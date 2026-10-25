import { atom } from 'nanostores'
import { useStore } from '@nanostores/react'
import { useEffect } from 'react'
import { groupEngine, type Room } from '../../lib/hermes/groups'

/**
 * Group list data for Home (the architect wires `useGroupRows()` into the
 * Home list). No `groups.*` push events exist, so the list is polled every
 * 15 s while subscribed and visible, pausing while the tab is hidden.
 *
 * Each cycle also reads `groups.state` + a `groups.log` tail per room, so the
 * rows carry `preview` (last message) and `needsYou` (pending approvals/
 * retries) without keeping a per-room cursor alive.
 */

export interface GroupRow {
  roomId: string
  name: string
  members: string[]
  preview: string
  lastActivity: number
  needsYou: boolean
}

export const groupRows = atom<GroupRow[]>([])
export const groupsLoading = atom<boolean>(true)
export const groupsError = atom<string>('')
/** null = checking, false = driver off, true = groups usable. */
export const groupsAvailable = atom<boolean | null>(null)

const LIST_POLL_MS = 15_000
const PREVIEW_MAX = 96

let capabilityPromise: Promise<boolean | null> | null = null

/** Fetch `groups.capabilities` once (retryable on failure) and publish the
 *  driver flag. Both the Home rows and the room screens call this so a deep
 *  link never depends on Home having mounted. */
export function ensureGroupsCapability(): Promise<boolean | null> {
  if (!capabilityPromise) {
    capabilityPromise = groupEngine
      .capabilities()
      .then(caps => {
        groupsAvailable.set(caps.driver === true)
        return caps.driver === true
      })
      .catch(() => {
        capabilityPromise = null
        groupsAvailable.set(null)
        return null
      })
  }
  return capabilityPromise
}

function isMessageKind(kind: string): boolean {
  return kind === 'message' || kind === 'message.user' || kind === 'message.member'
}

function previewOf(payload: Record<string, unknown>): string {
  const text = typeof payload.text === 'string' ? payload.text : typeof payload.content === 'string' ? payload.content : ''
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''
  return collapsed.length > PREVIEW_MAX ? `${collapsed.slice(0, PREVIEW_MAX)}…` : collapsed
}

async function roomToRow(room: Room): Promise<GroupRow | null> {
  try {
    const { driver_status } = await groupEngine.state(room.room_id)
    let preview = ''
    const latest = room.latest_seq ?? null
    if (latest && latest > 0) {
      const page = await groupEngine.log(room.room_id, Math.max(latest - 1, 0), 100)
      const lastMessage = [...page.events].reverse().find(e => isMessageKind(e.kind))
      if (lastMessage) preview = previewOf(lastMessage.payload)
    }
    return {
      roomId: room.room_id,
      name: room.name,
      members: room.members.map(m => m.profile || m.member_id || '').filter(Boolean),
      preview,
      lastActivity: room.updated_at ?? room.created_at ?? 0,
      needsYou: (driver_status?.pending_actions?.length ?? 0) > 0,
    }
  } catch {
    // Room vanished (disbanded mid-cycle); the next `groups.list` drops it.
    return null
  }
}

export async function refreshGroupRows(): Promise<void> {
  try {
    const available = await ensureGroupsCapability()
    if (available === false) {
      groupRows.set([])
      groupsError.set('')
      return
    }
    if (available === null) return

    const rooms = await groupEngine.list()
    const rows = await Promise.all(rooms.map(roomToRow))
    groupRows.set(rows.filter((row): row is GroupRow => row !== null))
    groupsError.set('')
  } catch (e) {
    groupsError.set(e instanceof Error ? e.message : 'No se pudieron cargar los grupos')
  } finally {
    groupsLoading.set(false)
  }
}

// ── polling controller (shared by every useGroupRows subscription) ────────

let subscribers = 0
let timer: ReturnType<typeof setTimeout> | null = null
let polling = false

function stopPolling(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  polling = false
}

async function pollLoop(): Promise<void> {
  if (!polling) return
  if (document.visibilityState === 'hidden') {
    timer = setTimeout(() => void pollLoop(), LIST_POLL_MS)
    return
  }
  await refreshGroupRows()
  if (!polling) return
  timer = setTimeout(() => void pollLoop(), LIST_POLL_MS)
}

function startPolling(): void {
  if (polling) return
  polling = true
  void pollLoop()
}

function onVisible(): void {
  if (document.visibilityState !== 'visible') return
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (polling) void pollLoop()
}

document.addEventListener('visibilitychange', onVisible)

/** Rows the Home list can render. Polls `groups.list` every 15 s while any
 *  component is subscribed; pauses while the tab is hidden. */
export function useGroupRows(): {
  rows: GroupRow[]
  loading: boolean
  error: string
  available: boolean | null
  refresh: () => Promise<void>
} {
  const rows = useStore(groupRows)
  const loading = useStore(groupsLoading)
  const error = useStore(groupsError)
  const available = useStore(groupsAvailable)

  useEffect(() => {
    subscribers += 1
    if (subscribers === 1) startPolling()
    return () => {
      subscribers -= 1
      if (subscribers === 0) stopPolling()
    }
  }, [])

  return { rows, loading, error, available, refresh: refreshGroupRows }
}
