import { atom } from 'nanostores'
import { connectionState, on, request } from '../../lib/hermes/connection'
import { homeProfiles } from './store'
import {
  applyActiveList,
  applyGroupActivity,
  applyMessageBoundary,
  applySessionInfo,
  busyOf,
  initialBusyState,
  registerBusySession,
  snapshotFence,
  type BusyState,
} from './busy-reducer'

/**
 * Live "bot is running a turn" state for Home (wires the pure reducer to the
 * gateway). A profile shows busy while any feed claims it; every feed is
 * event-driven except the two backstops the desktop also keeps:
 * `session.active_list` on reconnect + a 30 s visible poll (mirrors
 * `LIVE_SESSION_STATUS_BACKSTOP_INTERVAL_MS`, apps/desktop/src/app/contrib/
 * hooks/use-background-sync.ts:693), and the group store's existing 15 s poll.
 */

export const busyProfiles = atom<ReadonlySet<string>>(new Set())

let state: BusyState = initialBusyState()
let watched = 0
let backstopTimer: ReturnType<typeof setTimeout> | null = null
let changedTimer: ReturnType<typeof setTimeout> | null = null

function publish(): void {
  const next = busyOf(state)
  const prev = busyProfiles.get()
  if (prev.size === next.size && [...next].every(p => prev.has(p))) return
  busyProfiles.set(next)
}

// Session ids we can attribute to a profile from the roster (profiles.list):
// the canonical "Bot Chat" row, its compression tip, the newest worker row and
// the newest human-facing row. Unmapped live sessions (unknown cron rooms)
// simply don't light a bot row — same as the desktop's known-sessions rule.
function storedIdsByProfile(): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, Set<string>>()
  for (const row of homeProfiles.get()) {
    const ids = new Set<string>()
    for (const s of [row.canonical_session, row.worker_session, row.last_session]) {
      if (s?.id) ids.add(s.id)
    }
    if (row.canonical_session?.resolved_id) ids.add(row.canonical_session.resolved_id)
    map.set(row.name, ids)
  }
  return map
}

/** One `session.active_list` snapshot, fenced against live-event races. */
export async function refreshActiveList(): Promise<void> {
  try {
    const fence = snapshotFence(state)
    const res = await request('session.active_list', {})
    state = applyActiveList(state, res?.sessions ?? [], fence, storedIdsByProfile())
    publish()
  } catch {
    // older gateway / socket down; live events keep the indicator honest
  }
}

/** Group rooms publish their member activity after every `groups.list` cycle. */
export function publishGroupBusy(busyByProfile: ReadonlyMap<string, boolean>): void {
  state = applyGroupActivity(state, busyByProfile)
  publish()
}

/** Chat open: teach the reducer the sid → profile mapping for this session. */
export function registerBusySessionProfile(sid: string, profile: string): void {
  state = registerBusySession(state, sid, profile)
}

on('session.info', e => {
  const sid = e.session_id ?? ''
  if (!sid) return
  state = applySessionInfo(state, sid, {
    running: e.payload?.running,
    profile_name: e.payload?.profile_name,
  })
  publish()
})

on('message.start', e => {
  const sid = e.session_id ?? ''
  if (!sid) return
  state = applyMessageBoundary(state, sid, true)
  publish()
})

on('message.complete', e => {
  const sid = e.session_id ?? ''
  if (!sid) return
  state = applyMessageBoundary(state, sid, false)
  publish()
})

// Rehydrate on (re)connect and after roster churn: sessions.changed is a
// coarse "state.db moved" hint, so refresh the cheap snapshot, debounced.
connectionState.listen(s => {
  if (s === 'open') void refreshActiveList()
})

// The roster carries the stored-session ids that attribute snapshot rows to
// profiles; when it (re)arrives, re-apply the last snapshot so a turn that was
// already running at boot lights up without waiting for the next backstop.
homeProfiles.listen(() => {
  if (watched > 0) void refreshActiveList()
})

on('sessions.changed', () => {
  if (changedTimer) clearTimeout(changedTimer)
  changedTimer = setTimeout(() => {
    changedTimer = null
    void refreshActiveList()
  }, 500)
})

function ensureBackstop(): void {
  if (backstopTimer || watched === 0) return
  backstopTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshActiveList()
  }, 30_000)
}

function dropBackstop(): void {
  if (watched > 0) return
  if (backstopTimer) {
    clearInterval(backstopTimer)
    backstopTimer = null
  }
}

/** Home mounts this subscription; the 30 s backstop runs only while watched. */
export function watchBusy(): () => void {
  watched += 1
  ensureBackstop()
  void refreshActiveList()
  return () => {
    watched -= 1
    dropBackstop()
  }
}
