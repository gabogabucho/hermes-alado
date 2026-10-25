import { useRef, useState, type ChangeEvent } from 'react'
import { useStore } from '@nanostores/react'
import { uploadFile } from '../../lib/files'
import { IconButton } from '../../ui/IconButton'
import { sendMessage, stop, thinking } from './store'

export function Composer() {
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
      setText(t => (t ? `${t}\n[archivo: ${path}]` : `[archivo: ${path}]`))
    } catch (err) {
      setText(t => `${t}\n⚠ No se pudo subir: ${err instanceof Error ? err.message : 'error'}`)
    } finally {
      setUploading(false)
    }
  }

  function onSubmit() {
    const value = text.trim()
    if (!value || isThinking) return
    setText('')
    void sendMessage(value)
  }

  return (
    <div className="composer">
      <input ref={fileRef} type="file" hidden onChange={e => void onFile(e)} />
      <IconButton
        icon="paperclip"
        variant="ghost"
        label="Adjuntar archivo"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      />
      <input
        className="composer-input"
        placeholder="Mensaje…"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit()
          }
        }}
      />
      {isThinking ? (
        <IconButton icon="stop" variant="solid" label="Detener" onClick={() => void stop()} />
      ) : (
        <IconButton icon="send" variant="solid" label="Enviar" onClick={onSubmit} />
      )}
    </div>
  )
}
