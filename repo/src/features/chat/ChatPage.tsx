import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { useSlideNavigate } from '../../app/transition'
import { Avatar } from '../../ui/Avatar'
import { IconButton } from '../../ui/IconButton'
import { Sheet } from '../../ui/Sheet'
import { useBotAppearance, ensureAppearances } from '../bots/appearance-store'
import { homeBots } from '../home/store'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { RequestCard } from './RequestCards'
import { requests } from './requests'
import {
  chatMeta,
  chatSessionId,
  closeChat,
  items,
  openChat,
  openError,
  running,
  setChatVisible,
  stop,
} from './store'

export function ChatPage() {
  const { profile = 'default' } = useParams()
  const { back } = useSlideNavigate()
  const list = useStore(items)
  const isRunning = useStore(running)
  const cards = useStore(requests)
  const meta = useStore(chatMeta)
  const bots = useStore(homeBots)
  const error = useStore(openError)
  const [sheetOpen, setSheetOpen] = useState(false)

  const bot = bots.find(b => b.name === profile)
  const appearance = useBotAppearance(profile)

  useEffect(() => {
    ensureAppearances()
    setChatVisible(true)
    void openChat(profile, bot?.displayName).catch(() => undefined)
    return () => {
      setChatVisible(false)
      closeChat()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const sessionCards = cards.filter(c => c.sessionId === chatSessionId())

  return (
    <div className="chat-page">
      <header className="chat-header glass">
        <IconButton icon="back" variant="ghost" label="Volver" onClick={back} />
        <button className="chat-header-identity" onClick={() => setSheetOpen(true)}>
          <Avatar name={profile} size="sm" mood={isRunning ? 'thinking' : 'idle'} appearance={appearance} />
          <span className="chat-title">{meta.displayName || profile}</span>
        </button>
        <span className="spacer" />
        {isRunning ? (
          <IconButton icon="stop" variant="glass" label="Detener" onClick={() => void stop()} />
        ) : (
          <IconButton icon="more" variant="ghost" label="Más" disabled />
        )}
      </header>

      {sessionCards.length > 0 && (
        <div className="request-cards">
          {sessionCards.map(c => (
            <RequestCard key={c.id} card={c} bot={meta.displayName || profile} />
          ))}
        </div>
      )}

      {error && list.length === 0 && (
        <div className="empty">
          <p className="error-text">{error}</p>
          <button className="btn" onClick={() => void openChat(profile, bot?.displayName)}>
            Reintentar
          </button>
        </div>
      )}

      <MessageList
        items={list}
        running={isRunning}
        botName={meta.displayName || profile}
        isDefault={Boolean(bot?.isDefault)}
      />

      <Composer />

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={meta.displayName || profile}>
        <div className="row">
          <Avatar name={profile} size="lg" appearance={appearance} />
          <div>
            <div className="sheet-name">{meta.displayName || profile}</div>
            {bot?.model && <div className="faint">{bot.model}</div>}
          </div>
        </div>
        {bot?.description && <p className="muted" style={{ marginTop: 12 }}>{bot.description}</p>}
      </Sheet>
    </div>
  )
}
