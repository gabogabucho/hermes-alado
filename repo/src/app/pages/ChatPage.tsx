import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import {
  connectChat,
  disconnectChat,
  messages,
  pendingConfirm,
  thinking,
} from '../../store/chat'
import { BotAvatar } from '../../components/BotAvatar'
import { MessageList } from '../../components/MessageList'
import { Composer } from '../../components/Composer'

export function ChatPage() {
  const { name = 'default' } = useParams()
  const navigate = useNavigate()
  const list = useStore(messages)
  const isThinking = useStore(thinking)
  const confirm = useStore(pendingConfirm)

  useEffect(() => {
    const profile = name === 'default' ? 'current' : name
    void connectChat(profile)
    return () => disconnectChat()
  }, [name])

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button className="btn ghost" onClick={() => navigate('/profiles')}>
          ‹
        </button>
        <BotAvatar name={name} size={28} mood={isThinking ? 'work' : 'idle'} />
        <span className="chat-title">{name}</span>
        {isThinking && <span className="chip">pensando…</span>}
      </div>
      <MessageList messages={list} />
      <Composer confirm={confirm} />
    </div>
  )
}
