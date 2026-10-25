import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { Avatar } from '../../ui/Avatar'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { closeChat, messages, openChat, thinking } from './store'

export function ChatPage() {
  const { name = 'default' } = useParams()
  const navigate = useNavigate()
  const list = useStore(messages)
  const isThinking = useStore(thinking)

  useEffect(() => {
    void openChat(name).catch(() => undefined)
    return () => closeChat()
  }, [name])

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button className="btn ghost" onClick={() => navigate('/profiles')}>
          ‹
        </button>
        <Avatar name={name} size="sm" mood={isThinking ? 'thinking' : 'idle'} />
        <span className="chat-title">{name}</span>
        {isThinking && <span className="chip">pensando…</span>}
      </div>
      <MessageList messages={list} />
      <Composer />
    </div>
  )
}
