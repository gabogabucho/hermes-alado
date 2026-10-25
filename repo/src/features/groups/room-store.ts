import { atom } from 'nanostores'
import { useStore } from '@nanostores/react'
import { useEffect } from 'react'
import {
  groupEngine,
  type GroupPendingAction,
  type Room,
  type RoomDriverStatus,
  type RoomEvent,
} from '../../lib/hermes/groups'

/**
 * Live state for the open group room. There are no `groups.*` push events, so
 * the screen polls `groups.state` + `groups.log { since_seq }` every 2 s while
 * visible, backing off to 10 s when the driver is idle (not working, no member
 * activity), pausing while the tab is hidden. One per-room seq cursor, dedupe
 * by event seq. Same shape as the desktop's `CanonicalRoomView` refresh loop.
 */

const ACTIVE_POLL_MS = 2_000
const IDLE_POLL_MS = 10_000
const LOG_PAGE_LIMIT = 100

export const groupRoom = atom<Room | null>(null)
export const groupDriver = atom<RoomDriverStatus | null>(null)
export const groupEvents = atom<RoomEvent[]>([])
export const groupRoomLoading = atom<boolean>(true)
export const groupRoomError = atom<string>('')

// Per-room replay cursors, keyed by room id. A full refresh resets the cursor
// and re-reads the whole (bounded) history; incremental polls only the delta.
const cursors = new Map<string, number>()

/** Coerce one raw `pending_actions` row (`Record<string, unknown>` in the
 *  vendored contract) into the typed action the engine consumes. */
export function toPendingAction(row: Record<string, unknown>): GroupPendingAction {
  return {
    kind: typeof row.kind === 'string' ? row.kind : '',
    ...(typeof row.member_id === 'string' ? { member_id: row.member_id } : {}),
    ...(typeof row.task_id === 'string' ? { task_id: row.task_id } : {}),
    ...(typeof row.execution_generation === 'number' ? { execution_generation: row.execution_generation } : {}),
    ...(typeof row.request_id === 'string' ? { request_id: row.request_id } : {}),
  }
}

async function readLogDelta(roomId: string): Promise<RoomEvent[]> {
  let cursor = cursors.get(roomId) ?? 0
  const events: RoomEvent[] = []
  for (;;) {
    const page = await groupEngine.log(roomId, cursor, LOG_PAGE_LIMIT)
    events.push(...page.events)
    if (!page.has_more) {
      cursor = page.cursor
      break
    }
    if (!Number.isSafeInteger(page.cursor) || page.cursor <= cursor) {
      throw new Error('Cursor de log de grupo inválido')
    }
    cursor = page.cursor
  }
  cursors.set(roomId, cursor)
  return events
}

function mergeEvents(existing: RoomEvent[], incoming: RoomEvent[]): RoomEvent[] {
  const bySeq = new Map<number, RoomEvent>()
  for (const event of existing) bySeq.set(event.seq, event)
  for (const event of incoming) bySeq.set(event.seq, event)
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}

/** Read state + the log delta for one room into the room atoms. `full` resets
 *  the replay cursor first (used on mount and after mutations, like the
 *  desktop's post-mutation `refresh`). */
export async function refreshGroupRoom(roomId: string, full = false): Promise<void> {
  if (full) cursors.delete(roomId)
  const state = await groupEngine.state(roomId)
  const events = await readLogDelta(roomId)
  groupRoom.set(state.room)
  groupDriver.set(state.driver_status ?? null)
  groupEvents.set(full ? mergeEvents([], events) : mergeEvents(groupEvents.get(), events))
  groupRoomError.set('')
}

/** Mount the room polling loop for `roomId`. Returns a cleanup that stops it;
 *  StrictMode-safe (each mount resets the room atoms). */
export function useGroupRoom(roomId: string | undefined): {
  room: Room | null
  driver: RoomDriverStatus | null
  events: RoomEvent[]
  loading: boolean
  error: string
  refresh: (full?: boolean) => Promise<void>
} {
  const room = useStore(groupRoom)
  const driver = useStore(groupDriver)
  const events = useStore(groupEvents)
  const loading = useStore(groupRoomLoading)
  const error = useStore(groupRoomError)

  useEffect(() => {
    if (!roomId) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null

    groupRoom.set(null)
    groupDriver.set(null)
    groupEvents.set([])
    groupRoomLoading.set(true)
    groupRoomError.set('')
    cursors.delete(roomId)

    const tick = async (): Promise<void> => {
      if (!alive) return
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(() => void tick(), ACTIVE_POLL_MS)
        return
      }
      try {
        await refreshGroupRoom(roomId)
        groupRoomLoading.set(false)
      } catch (e) {
        if (alive) {
          groupRoomError.set(e instanceof Error ? e.message : 'No se pudo cargar el grupo')
          // First load failed: stop the skeleton so the error screen shows.
          if (groupEvents.get().length === 0) groupRoomLoading.set(false)
        }
      }
      if (!alive) return
      const current = groupDriver.get()
      const idle = !current?.working && !current?.member_activity?.length
      timer = setTimeout(() => void tick(), idle ? IDLE_POLL_MS : ACTIVE_POLL_MS)
    }

    void tick()

    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || !alive) return
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      void tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [roomId])

  return { room, driver, events, loading, error, refresh: full => (roomId ? refreshGroupRoom(roomId, full) : Promise.resolve()) }
}
