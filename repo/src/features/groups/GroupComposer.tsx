// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
//
// Group composer with a member-scoped @ autocomplete, mirroring the desktop's
// `GroupMentionInput` (`group-chat-parts.tsx`): @everyone/@all quick picks plus
// each seated member's handle, inserted as `@handle `. The inserted charset is
// what the server-side driver's mention parser accepts
// (`gateway/hosted_room_discussion.py:39`).
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { groupEngine, type RoomMember } from '../../lib/hermes/groups'
import { IconButton } from '../../ui/IconButton'
import { memberName } from './members'
import { refreshGroupRoom } from './room-store'

interface MentionToken {
  query: string
  /** Index of the '@' the token starts at. */
  start: number
}

interface MentionOption {
  handle: string
  meta: string
}

/** The active @-token at the caret: text from the nearest '@' that begins a
 *  word up to the caret, or null when the caret isn't inside a mention. */
function mentionTokenAt(text: string, caret: number): MentionToken | null {
  const upto = String(text || '').slice(0, caret)
  const match = /(^|\s)@([a-z0-9._:-]*)$/i.exec(upto)
  if (!match) return null
  return { query: match[2].toLowerCase(), start: caret - match[2].length - 1 }
}

function mentionOptions(query: string, members: RoomMember[]): MentionOption[] {
  const options: MentionOption[] = []
  for (const pick of ['everyone', 'all']) {
    if (pick.startsWith(query)) options.push({ handle: pick, meta: 'Todos los miembros' })
  }
  for (const member of members) {
    const handle = (member.handle || member.member_id || '').trim()
    const meta = memberName(member)
    if (!handle) continue
    if (query && !handle.toLowerCase().startsWith(query) && !meta.toLowerCase().startsWith(query)) continue
    if (!options.some(o => o.handle === handle)) options.push({ handle, meta })
  }
  return options
}

export function GroupComposer({
  roomId,
  roomName,
  members,
  disabled,
}: {
  roomId: string
  roomName: string | undefined
  members: RoomMember[]
  disabled: boolean
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [token, setToken] = useState<MentionToken | null>(null)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const options = useMemo(() => (token ? mentionOptions(token.query, members) : []), [token, members])
  const open = Boolean(token) && options.length > 0
  const active = open ? Math.min(selected, options.length - 1) : 0

  const refreshToken = (target: HTMLTextAreaElement): void => {
    setToken(mentionTokenAt(target.value, target.selectionStart ?? target.value.length))
    setSelected(0)
  }

  const insert = (handle: string): void => {
    if (!token) return
    const caret = inputRef.current?.selectionStart ?? text.length
    const next = `${text.slice(0, token.start)}@${handle} ${text.slice(caret)}`
    setText(next)
    setToken(null)
    const pos = token.start + handle.length + 2
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      try {
        el.setSelectionRange(pos, pos)
      } catch {
        // no selection support
      }
    })
  }

  async function submit(): Promise<void> {
    const value = text.trim()
    if (!value || busy || disabled) return
    setBusy(true)
    setError('')
    try {
      await groupEngine.send(roomId, value)
      setText('')
      await refreshGroupRoom(roomId, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el mensaje')
    } finally {
      setBusy(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.nativeEvent?.isComposing || e.keyCode === 229) return
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((active + 1) % options.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((active - 1 + options.length) % options.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insert(options[active].handle)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setToken(null)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  const placeholder = roomName ? `Escríbele a ${roomName}` : 'Escribile al grupo'

  return (
    <div className="composer group-composer">
      {error && <div className="error-text group-composer-error">{error}</div>}
      <div className="composer-row">
        <div className="group-composer-field">
          {open && (
            <div className="mention-popover">
              {options.map((option, index) => (
                <button
                  key={option.handle}
                  type="button"
                  className={`mention-option${index === active ? ' mention-option--active' : ''}`}
                  onMouseDown={e => {
                    e.preventDefault()
                    insert(option.handle)
                  }}
                  onMouseEnter={() => setSelected(index)}
                >
                  <span className="mention-handle">@{option.handle}</span>
                  <span className="mention-meta">{option.meta}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            className="composer-input"
            placeholder={placeholder}
            rows={1}
            disabled={disabled || busy}
            value={text}
            onChange={e => {
              setText(e.target.value)
              const el = e.target
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 6 * 24)}px`
              refreshToken(el)
            }}
            onClick={e => refreshToken(e.target as HTMLTextAreaElement)}
            onBlur={() => setToken(null)}
            onKeyDown={onKeyDown}
          />
        </div>
        <IconButton
          icon="send"
          variant="solid"
          label="Enviar"
          disabled={busy || disabled || !text.trim()}
          onClick={() => void submit()}
        />
      </div>
    </div>
  )
}
