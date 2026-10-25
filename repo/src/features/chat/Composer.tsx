import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useStore } from '@nanostores/react'
import { apiFetch } from '../../lib/api'
import { request } from '../../lib/hermes/connection'
import { IconButton } from '../../ui/IconButton'
import { chatMeta, chatSessionId, consumePendingDraft, running, sendMessage, stop } from './store'

interface Attachment {
  id: string
  name: string
}

const COARSE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
}

export function Composer() {
  const isRunning = useStore(running)
  const meta = useStore(chatMeta)
  // One-shot prefill queued before navigation (migration fallback).
  const [text, setText] = useState(() => consumePendingDraft())
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recTime, setRecTime] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Shrink back to one line once the text is cleared (e.g. after sending).
  useEffect(() => {
    if (!text && inputRef.current) inputRef.current.style.height = ''
  }, [text])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current)
  }, [])

  function onSubmit() {
    const value = text.trim()
    if (!value || isRunning) return
    setText('')
    setAttachments([])
    if ('vibrate' in navigator) navigator.vibrate?.(10)
    void sendMessage(value)
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const sid = chatSessionId()
    if (!sid) return
    setBusy(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      if (file.type.startsWith('image/')) {
        await request('image.attach_bytes', { session_id: sid, content_base64: base64, filename: file.name })
      } else if (file.type === 'application/pdf') {
        await request('pdf.attach', { session_id: sid, data: dataUrl, filename: file.name })
      } else {
        await request('file.attach', { session_id: sid, data_url: dataUrl, name: file.name })
      }
      setAttachments(a => [...a, { id: crypto.randomUUID(), name: file.name }])
    } catch (err) {
      setText(t => (t ? `${t}\n` : '') + `⚠ ${err instanceof Error ? err.message : 'No se pudo adjuntar'}`)
    } finally {
      setBusy(false)
    }
  }

  async function toggleRecord() {
    if (recording) {
      stopRecord()
      return
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = e => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        void transcribe()
      }
      rec.start()
      setRecording(true)
      setRecTime(0)
      recTimerRef.current = setInterval(() => setRecTime(t => t + 1), 1000)
    } catch {
      // mic permission denied or unavailable
    }
  }

  function stopRecord() {
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    recorderRef.current?.stop()
    setRecording(false)
  }

  async function transcribe() {
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'audio/webm' })
    chunksRef.current = []
    if (blob.size === 0) return
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('No se pudo leer el audio'))
        reader.readAsDataURL(blob)
      })
      const res = await apiFetch<{ transcript: string }>('/api/audio/transcribe', {
        method: 'POST',
        body: JSON.stringify({ data_url: dataUrl, mime_type: blob.type }),
      })
      if (res.transcript) setText(t => (t ? `${t} ${res.transcript}` : res.transcript))
    } catch {
      // transcription failed silently
    }
  }

  function formatTime(s: number): string {
    return `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  return (
    <div className="composer">
      {recording && (
        <div className="recording-bar">
          <span className="recording-dot" />
          <span className="label-mono">Grabando {formatTime(recTime)}</span>
          <button className="btn btn-sm" onClick={() => setText('')}>
            Cancelar
          </button>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="attach-chips">
          {attachments.map(a => (
            <span key={a.id} className="chip">
              {a.name}
            <button
              className="chip-x"
              onClick={() => setAttachments(list => list.filter(x => x.id !== a.id))}
            >
              ✕
            </button>
          </span>
        ))}
        </div>
      )}
      <div className="composer-row">
        <input ref={fileRef} type="file" hidden onChange={e => void onFile(e)} />
        <IconButton
          icon="paperclip"
          variant="ghost"
          label="Adjuntar"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        />
        <textarea
          ref={inputRef}
          className="composer-input"
          placeholder={`Dale una tarea a ${meta.displayName || 'Hermes'}`}
          rows={1}
          value={text}
          onChange={e => {
            setText(e.target.value)
            const el = e.target
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 6 * 24)}px`
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !COARSE) {
              e.preventDefault()
              onSubmit()
            }
          }}
        />
        {isRunning ? (
          <IconButton icon="stop" variant="solid" label="Detener" onClick={() => void stop()} />
        ) : text.trim() ? (
          <IconButton icon="send" variant="solid" label="Enviar" onClick={onSubmit} />
        ) : (
          <IconButton icon="mic" variant="solid" label="Grabar" onClick={() => void toggleRecord()} />
        )}
      </div>
    </div>
  )
}
