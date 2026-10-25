import { useEffect, useMemo, useRef, useState } from 'react'
import { IconButton } from '../../ui/IconButton'
import { Markdown } from './markdown'
import { loadOlder, retryLast, type ChatItem } from './store'

function groupItems(items: ChatItem[]): (ChatItem | { kind: 'toolgroup'; id: string; tools: Extract<ChatItem, { kind: 'tool' }>[] })[] {
  const out: ReturnType<typeof groupItems> = []
  let i = 0
  while (i < items.length) {
    const item = items[i]
    if (item.kind === 'tool') {
      const tools: Extract<ChatItem, { kind: 'tool' }>[] = [item]
      let j = i + 1
      while (j < items.length && items[j].kind === 'tool') {
        tools.push(items[j] as Extract<ChatItem, { kind: 'tool' }>)
        j++
      }
      out.push({ kind: 'toolgroup', id: tools.map(t => t.id).join('-'), tools })
      i = j
      continue
    }
    out.push(item)
    i++
  }
  return out
}

export function MessageList({ items, running }: { items: ChatItem[]; running: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const canLoadRef = useRef(true)
  const [showJump, setShowJump] = useState(false)
  const [newBelow, setNewBelow] = useState(0)

  const grouped = useMemo(() => groupItems(items), [items])

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [items])

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current && running) el.scrollTop = el.scrollHeight
  }, [items, running])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stickRef.current = nearBottom
    setShowJump(!nearBottom)
    if (nearBottom) setNewBelow(0)
    if (el.scrollTop > 200) canLoadRef.current = true
    if (el.scrollTop < 40 && canLoadRef.current) {
      canLoadRef.current = false
      void loadOlder()
    }
  }

  useEffect(() => {
    if (!stickRef.current) {
      setNewBelow(n => n + 1)
    }
  }, [items.length])

  function jumpToBottom() {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
    stickRef.current = true
    setShowJump(false)
    setNewBelow(0)
  }

  return (
    <div className="msg-wrap">
      <div className="msg-list" ref={scrollRef} onScroll={onScroll}>
        {grouped.length === 0 && !running ? (
          <div className="empty">
            <p className="muted">Escribí tu primer mensaje a este agente.</p>
          </div>
        ) : (
          grouped.map(g => <Group key={g.id} g={g} />)
        )}
        {running && <TypingIndicator />}
      </div>
      {showJump && (
        <div className="jump-wrap">
          <IconButton icon="arrow-down" variant="solid" label="Ir al final" onClick={jumpToBottom} />
          {newBelow > 0 && <span className="jump-count">{newBelow}</span>}
        </div>
      )}
    </div>
  )
}

function Group({ g }: { g: ReturnType<typeof groupItems>[number] }) {
  if (g.kind === 'toolgroup') {
    const first = g.tools[0]
    const label = first.name === 'terminal' ? 'terminal' : first.name
    return (
      <details className="tool-group" open={!first.done}>
        <summary className="tool-group-summary">
          <span className="tool-status">{g.tools.every(t => t.done) ? '✓' : '…'}</span>
          <span>{g.tools.length > 1 ? `${g.tools.length} herramientas · ${label}` : label}</span>
          {first.durationS != null && <span className="faint">· {first.durationS.toFixed(1)} s</span>}
        </summary>
        <div className="tool-group-body">
          {g.tools.map(t => (
            <div key={t.id} className="tool-row">
              {t.argsText && <div className="confirm-cmd">{t.argsText}</div>}
              {t.summary && <div className="faint tool-summary">{t.summary}</div>}
            </div>
          ))}
        </div>
      </details>
    )
  }

  switch (g.kind) {
    case 'user':
      return (
        <div className="msg user">
          <div className="msg-bubble">{g.text}</div>
        </div>
      )
    case 'agent':
      return (
        <div className="msg-note">
          <span>
            Mensaje de <b>{g.sender}</b>
          </span>
          {g.body && (
            <details className="msg-note-details">
              <summary>ver mensaje</summary>
              <div className="msg-note-body">{g.body}</div>
            </details>
          )}
        </div>
      )
    case 'delivery':
      return (
        <div className="msg-note">
          <span>
            Escribió a <b>{g.target}</b>
            {g.pending ? '…' : ''}
          </span>
          {!g.pending && g.reply && (
            <details className="msg-note-details">
              <summary>ver mensaje</summary>
              <div className="msg-note-body">{g.reply}</div>
            </details>
          )}
        </div>
      )
    case 'assistant':
      return (
        <div className="msg assistant">
          <div className="msg-bubble assistant">
            {g.reasoning && (
              <details className="reasoning">
                <summary>Pensando…</summary>
                <div className="reasoning-body">{g.reasoning}</div>
              </details>
            )}
            {g.text ? (
              <Markdown text={g.text} />
            ) : g.streaming ? (
              <span className="typing-dots">
                <i /><i /><i />
              </span>
            ) : null}
            {g.error && (
              <div className="msg-error">
                <span>{g.error}</span>
                <button className="btn btn-sm" onClick={() => void retryLast()}>
                  Reintentar
                </button>
              </div>
            )}
          </div>
        </div>
      )
    case 'error':
      return (
        <div className="msg-error-row">
          <span>⚠ {g.text}</span>
          <button className="btn btn-sm" onClick={() => void retryLast()}>
            Reintentar
          </button>
        </div>
      )
    case 'tool':
      return null
  }
}

function TypingIndicator() {
  return (
    <div className="msg assistant">
      <div className="msg-bubble assistant">
        <span className="typing-dots">
          <i /><i /><i />
        </span>
      </div>
    </div>
  )
}
