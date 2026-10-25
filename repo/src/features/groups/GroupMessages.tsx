// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
//
// The room transcript, mirroring `canonical-group-history.tsx`: each bot
// message shows the bot name above the bubble and its avatar at the
// bottom-left; user messages sit right; terminal/notice events render as
// centered notes with their detail (error/reason/reason_code).
import type { RoomActor, RoomEvent, RoomMember } from '../../lib/hermes/groups'
import { useSlideNavigate } from '../../app/transition'
import { Avatar } from '../../ui/Avatar'
import { EmptyState } from '../../ui/EmptyState'
import { useBotAppearance } from '../bots/appearance-store'
import { GroupMarkdown } from './group-markdown'
import { memberName, memberProfile, rosterById } from './members'

const NOTICES: Record<string, string> = {
  'turn.failed': 'Turno fallido',
  'turn.cancelled': 'Ronda cancelada',
  'turn.deferred': 'Turno diferido',
  'member.unavailable': 'Miembro no disponible',
  'room.stop_requested': 'Ronda detenida',
  'room.disbanded': 'Grupo disuelto',
  'authority.lost': 'El grupo perdió su autoridad',
}

interface ActorWithName extends RoomActor {
  display_name?: string
}

function isMessage(event: RoomEvent): boolean {
  return event.kind === 'message' || event.kind === 'message.user' || event.kind === 'message.member'
}

/** Who spoke — the log's actor label wins so a message keeps its author even
 *  after the roster changes (same resolution as `eventAuthor`). */
function eventAuthor(event: RoomEvent, roster: Map<string, RoomMember>): string {
  if (event.kind === 'message.user') return 'Tú'
  const actor = event.actor as ActorWithName
  const member = actor.id ? roster.get(actor.id) : undefined
  return memberName(member) || actor.display_name || actor.id || 'Bot'
}

function noticeFor(event: RoomEvent): string | null {
  if (event.kind === 'room.activity' && event.payload.status === 'bounded') {
    return 'Se alcanzó el límite de trabajo de la ronda'
  }
  return NOTICES[event.kind] ?? null
}

function noticeDetail(event: RoomEvent): string {
  const value = event.payload.error ?? event.payload.reason ?? event.payload.reason_code
  return typeof value === 'string' ? value : ''
}

function MemberAvatar({ name }: { name: string }) {
  const appearance = useBotAppearance(name)
  return <Avatar name={name} size="xs" appearance={appearance} />
}

function NoticeRow({ event, notice }: { event: RoomEvent; notice: string }) {
  const detail = noticeDetail(event)
  return (
    <div className="group-notice">
      <strong>{notice}</strong>
      {detail && <span className="faint">{detail}</span>}
    </div>
  )
}

function MessageRow({ event, members }: { event: RoomEvent; members: RoomMember[] }) {
  const { forward } = useSlideNavigate()
  const roster = rosterById(members)
  const author = eventAuthor(event, roster)
  const text = typeof event.payload.text === 'string' ? event.payload.text : ''

  if (event.kind === 'message.user') {
    return (
      <div className="group-msg group-msg--user">
        <div className="group-msg-bubble group-msg-bubble--user">{text}</div>
      </div>
    )
  }

  const member = event.actor?.id ? roster.get(event.actor.id) : undefined
  const profile = member ? memberProfile(member) : author

  // Tapping a member's name/avatar opens that bot's profile.
  const identity =
    profile && member ? (
      <button
        type="button"
        className="group-msg-author-btn"
        onClick={() => forward(`/bots/${encodeURIComponent(profile)}`)}
      >
        <span className="group-msg-author">{author}</span>
      </button>
    ) : (
      <span className="group-msg-author">{author}</span>
    )
  const face =
    profile && member ? (
      <button
        type="button"
        className="group-msg-avatar"
        aria-label={`Ver perfil de ${author}`}
        onClick={() => forward(`/bots/${encodeURIComponent(profile)}`)}
      >
        <MemberAvatar name={profile} />
      </button>
    ) : (
      <span className="group-msg-avatar">
        <MemberAvatar name={profile} />
      </span>
    )

  return (
    <div className="group-msg group-msg--member">
      <div className="group-msg-body">{identity}
        <div className="group-msg-bubble group-msg-bubble--member">
          <GroupMarkdown text={text} />
        </div>
      </div>
      {face}
    </div>
  )
}

export function GroupMessages({ events, members }: { events: RoomEvent[]; members: RoomMember[] }) {
  return (
    <div className="group-messages" role="log">
      {events.length === 0 ? (
        <EmptyState
          title="Todavía no hay mensajes"
          text="Escribí el primero para que el grupo arranque a trabajar."
        />
      ) : (
        events.map(event => {
          const notice = noticeFor(event)
          if (!notice && !isMessage(event)) return null
          if (notice) return <NoticeRow key={event.seq} event={event} notice={notice} />
          return <MessageRow key={event.seq} event={event} members={members} />
        })
      )}
    </div>
  )
}
