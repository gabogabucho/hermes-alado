/**
 * Pure busy-state reducer: which bots are running a turn right now.
 *
 * Mirrors the desktop's sidebar working indicator
 * (`apps/desktop/src/app/session/hooks/use-message-stream/gateway-event/session-info.ts`,
 *  `apps/desktop/src/app/contrib/hooks/use-background-sync.ts`), reduced to the
 * three cheap feeds the PWA already has over its single `/api/ws` socket:
 *
 * 1. `session.info` events — `payload.running` + `payload.profile_name`
 *    (`tui_gateway/server.py:1607,1612`). Event-driven, covers every session
 *    attached to our transport (chats we opened, even closed).
 * 2. `session.active_list` snapshots — `status: working|streaming|waiting`
 *    (`tui_gateway/session_registry.py:648-655`). Rehydrates turns that
 *    started before our socket saw them (another device rebinding the
 *    transport, cron/group turns) — the desktop's degraded-socket backstop.
 * 3. Group room `member_activity` (`groups.state` driver_status) — `member_id`
 *    is the profile name, `status: running` means that bot is mid-turn in a
 *    hosted room (already fetched by the group store's 15 s poll).
 *
 * A profile is busy when ANY source claims it; the claim must be released by
 * the same source. No polling faster than the 15–30 s backstops.
 */

export interface SessionInfoLike {
  running?: boolean
  profile_name?: string | null
}

export interface ActiveListItemLike {
  id: string
  session_key: string
  status: string
}

export interface BusyState {
  /** sid → { profile, busy } from live events (authoritative for our socket). */
  sessionClaims: Map<string, { profile: string; busy: boolean }>
  /** sid → { profile, busy } from the last `session.active_list` snapshot. */
  snapshotClaims: Map<string, { profile: string; busy: boolean }>
  /** profile → busy from group room member activity. */
  groupClaims: Map<string, boolean>
  /** sid → profile, learned from `session.info` + chat opens. */
  sidToProfile: Map<string, string>
  /** sid → event version, bumped per event so a stale snapshot row is skipped. */
  eventVersions: Map<string, number>
}

export function initialBusyState(): BusyState {
  return {
    sessionClaims: new Map(),
    snapshotClaims: new Map(),
    groupClaims: new Map(),
    sidToProfile: new Map(),
    eventVersions: new Map(),
  }
}

/** The set of profile names currently running a turn (a fresh Set every call). */
export function busyOf(state: BusyState): Set<string> {
  const busy = new Set<string>()
  for (const claim of state.sessionClaims.values()) {
    if (claim.busy) busy.add(claim.profile)
  }
  for (const claim of state.snapshotClaims.values()) {
    if (claim.busy) busy.add(claim.profile)
  }
  for (const [profile, on] of state.groupClaims) {
    if (on) busy.add(profile)
  }
  return busy
}

function bumpEventVersion(state: BusyState, sid: string): BusyState {
  const eventVersions = new Map(state.eventVersions)
  eventVersions.set(sid, (eventVersions.get(sid) ?? 0) + 1)
  return { ...state, eventVersions }
}

function withSessionClaim(state: BusyState, sid: string, profile: string, busy: boolean): BusyState {
  const sessionClaims = new Map(state.sessionClaims)
  sessionClaims.set(sid, { profile, busy })
  const sidToProfile = new Map(state.sidToProfile)
  if (profile) sidToProfile.set(sid, profile)
  return { ...state, sessionClaims, sidToProfile }
}

/** Learn a sid → profile mapping (chat open, any other source). */
export function registerBusySession(state: BusyState, sid: string, profile: string): BusyState {
  if (!sid || !profile || state.sidToProfile.get(sid) === profile) return state
  const sidToProfile = new Map(state.sidToProfile)
  sidToProfile.set(sid, profile)
  return { ...state, sidToProfile }
}

/**
 * `session.info` — the authoritative busy edge. `running: true` arms busy for
 * the payload's profile; `running: false` releases it.
 */
export function applySessionInfo(state: BusyState, sid: string, info: SessionInfoLike): BusyState {
  const bumped = bumpEventVersion(state, sid)
  const profile = (info.profile_name ?? '').trim()
  if (!profile) return bumped
  return withSessionClaim(bumped, sid, profile, Boolean(info.running))
}

/**
 * `message.start` / `message.complete` — turn boundaries for sessions whose
 * profile we already know (registered on chat open or via `session.info`).
 */
export function applyMessageBoundary(state: BusyState, sid: string, busy: boolean): BusyState {
  const bumped = bumpEventVersion(state, sid)
  const profile = state.sidToProfile.get(sid)
  if (!profile) return bumped
  return withSessionClaim(bumped, sid, profile, busy)
}

/** The event versions at snapshot request time (its staleness fence). */
export function snapshotFence(state: BusyState): Map<string, number> {
  return new Map(state.eventVersions)
}

/** Snapshot statuses that mean "this session is mid-turn". */
export function isWorkingStatus(status: string): boolean {
  return status === 'working' || status === 'streaming' || status === 'waiting'
}

/**
 * Apply an `session.active_list` snapshot. Rows whose events advanced while the
 * request was in flight are skipped (the event state is newer — the desktop's
 * `existing !== stateAtRequest[runtimeSessionId]` guard). Rows are attributed
 * to a profile by runtime sid (learned from events/opens) or by stored
 * session key (canonical / worker / newest-session ids from `profiles.list`).
 */
export function applyActiveList(
  state: BusyState,
  rows: ActiveListItemLike[],
  fence: Map<string, number>,
  storedIdsByProfile: ReadonlyMap<string, ReadonlySet<string>>,
): BusyState {
  const snapshotClaims = new Map<string, { profile: string; busy: boolean }>()
  const sidToProfile = new Map(state.sidToProfile)

  for (const row of rows) {
    const sid = String(row.id ?? '').trim()
    const key = String(row.session_key ?? '').trim()
    if (!sid && !key) continue

    // A live event already moved this session past the snapshot: skip it.
    if ((fence.get(sid) ?? 0) !== (state.eventVersions.get(sid) ?? 0)) continue

    let profile = sidToProfile.get(sid) ?? ''
    if (!profile && key) {
      for (const [candidate, ids] of storedIdsByProfile) {
        if (ids.has(key)) {
          profile = candidate
          break
        }
      }
    }
    if (!profile) continue
    sidToProfile.set(sid, profile)
    snapshotClaims.set(sid, { profile, busy: isWorkingStatus(String(row.status ?? '')) })
  }

  return { ...state, snapshotClaims, sidToProfile }
}

/**
 * Replace the group-room busy claims wholesale (one map per `groups.state`
 * refresh cycle: member profile → running in some room).
 */
export function applyGroupActivity(state: BusyState, busyByProfile: ReadonlyMap<string, boolean>): BusyState {
  return { ...state, groupClaims: new Map(busyByProfile) }
}
