import { useRef, useState, type ChangeEvent } from 'react'
import { useStore } from '@nanostores/react'
import { cancelMessage, confirmPending, sendMessage, thinking } from '../store/chat'
import { uploadFile } from '../lib/files'

export function Composer({ confirm }: { confirm: string }) {
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const isThinking = useStore(thinking)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const path = await uploadFile(file)
      setText((t) => (t ? `${t}\n[archivo: ${path}]` : `[archivo: ${path}]`))
    } catch (err) {
      setText((t) => `${t}\n⚠ No se pudo subir: ${err instanceof Error ? err.message : 'error'}`)
    } finally {
      setUploading(false)
    }
  }

  function onSubmit() {
    const value = text.trim()
    if (!value || isThinking) return
    setText('')
    sendMessage(value)
  }

  if (confirm) {
    return (
      <div className="composer confirm">
        <div className="faint">Permitir ejecutar:</div>
        <div className="confirm-cmd">{confirm}</div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => confirmPending()}>
            Confirmar
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={() => cancelMessage()}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="composer">
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => void onFile(e)}
      />
      <button
        className="btn ghost"
        title="Adjuntar archivo"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        {uploading ? '⏳' : '＋'}
      </button>
      <input
        className="composer-input"
        placeholder="Mensaje…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
        }}
      />
      {isThinking ? (
        <button className="btn btn-danger composer-send" onClick={() => cancelMessage()}>
          ■
        </button>
      ) : (
        <button className="btn btn-primary composer-send" onClick={onSubmit}>
          ➤
        </button>
      )}
    </div>
  )
}
