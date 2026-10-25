import { useEffect, useRef } from 'react'
import type { ChatMsg } from './store'

export function MessageList({ messages }: { messages: ChatMsg[] }) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="empty">
        <p className="muted">Escribí tu primer mensaje a este agente.</p>
      </div>
    )
  }

  return (
    <div className="msg-list">
      {messages.map(m => (
        <div key={m.id} className={`msg ${m.role}`}>
          <div className="msg-bubble">
            {m.text ? m.text : m.pending ? '…' : ''}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}
