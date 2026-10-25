import { atom } from 'nanostores'
import { apiFetch } from '../../lib/api'
import { on, request } from '../../lib/hermes/connection'
import type { ProfileRow } from '../../lib/hermes/rpc-types'

/**
 * Home list data.
 *
 * The whole list is driven by ONE RPC — `profiles.list { include_sessions: true }`
 * — whose `canonical_session` (resolved server-side by the "Bot Chat" title,
 * `tui_gateway/methods_profiles.py::_canonical_session_row`) already carries
 * `preview`, `last_active` and `has_avatar` per row. No REST sidebar join is
 * needed: those three are exactly what a bot row renders. Avatars are fetched
 * lazily via `profiles.get_asset` (RPC-only — there is no REST avatar route).
 *
 * `unread` is NOT part of `canonical_session` (a hidden Bot Chat never reaches
 * the REST session list where `unread` lives), so it is tracked client-side the
 * way the desktop does (`apps/desktop/.../roster-actions.ts::trackInboundActivity`):
 * a `last_active` watermark per bot, advanced past the watermark while that bot's
 * chat is not on screen → unread.
 */

export interface HomeBot {
  name: string
  displayName: string
  model: string | null
  description: string
  isDefault: boolean
  hasAvatar: boolean
  avatarUrl: string | null
  canonical: {
    id: string
    resolvedId: string
    preview: string
    lastActive: number
  } | null
  unread: boolean
}

export const homeBots = atom<HomeBot[]>([])
export const homeLoading = atom<boolean>(true)
export const homeError = atom<string>('')
export const activeProfile = atom<string>('default')

// Avatars: name -> data URL, cached per session (memory only).
const avatarCache = new Map<string, string>()
const avatarFetching = new Set<string>()

// Unread watermarks + set (client-side; hidden Bot Chats have no server unread).
let watermarksSeeded = false
const watermarks = new Map<string, number>()
const unread = new Set<string>()
let visibleProfile: string | null = null

/** The chat currently on screen (so background activity doesn't badge it). */
export function setVisibleProfile(name: string | null): void {
  visibleProfile = name
  if (name) {
    unread.delete(name)
    emitUnread()
  }
}

function emitUnread(): void {
  homeBots.set(homeBots.get().map(b => ({ ...b, unread: unread.has(b.name) })))
}

export async function loadActiveProfile(): Promise<void> {
  try {
    const res = await apiFetch<{ active: string; current: string }>('/api/profiles/active')
    activeProfile.set(res.active || 'default')
  } catch {
    // non-fatal: fall back to "default"
  }
}

function orderBots(rows: ProfileRow[]): ProfileRow[] {
  const withChat = rows
    .filter(r => r.canonical_session)
    .sort((a, b) => (b.canonical_session?.last_active ?? 0) - (a.canonical_session?.last_active ?? 0))
  const withoutChat = rows
    .filter(r => !r.canonical_session)
    .sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name))
  return [...withChat, ...withoutChat]
}

function trackUnread(rows: ProfileRow[]): void {
  const seeding = !watermarksSeeded
  watermarksSeeded = true
  for (const row of rows) {
    const ts = row.canonical_session?.last_active ?? 0
    const prev = watermarks.get(row.name) ?? 0
    watermarks.set(row.name, Math.max(prev, ts))
    if (seeding || ts <= prev) continue
    if (visibleProfile === row.name) continue
    unread.add(row.name)
  }
}

function toHomeBot(row: ProfileRow): HomeBot {
  const cs = row.canonical_session
  return {
    name: row.name,
    displayName: row.display_name || row.name,
    model: row.model ?? null,
    description: row.description ?? '',
    isDefault: Boolean(row.is_default),
    hasAvatar: Boolean(row.has_avatar),
    avatarUrl: avatarCache.get(row.name) ?? null,
    canonical: cs
      ? {
          id: cs.id,
          resolvedId: cs.resolved_id,
          preview: cs.preview ?? '',
          lastActive: cs.last_active ?? 0,
        }
      : null,
    unread: unread.has(row.name),
  }
}

/** Pull the avatar for rows that have one, once per session. Fire-and-forget. */
function fetchAvatars(rows: ProfileRow[]): void {
  for (const row of rows) {
    if (!row.has_avatar || avatarCache.has(row.name) || avatarFetching.has(row.name)) continue
    avatarFetching.add(row.name)
    void request('profiles.get_asset', { name: row.name, asset: 'avatar' })
      .then(res => {
        const data = res.found ? (res.data ?? null) : null
        if (!data) return
        avatarCache.set(row.name, data)
        homeBots.set(homeBots.get().map(b => (b.name === row.name ? { ...b, avatarUrl: data } : b)))
      })
      .catch(() => undefined)
      .finally(() => avatarFetching.delete(row.name))
  }
}

async function refresh(): Promise<void> {
  try {
    const res = await request('profiles.list', { include_sessions: true })
    const rows = res?.profiles ?? []
    const ordered = orderBots(rows)
    trackUnread(rows)
    homeBots.set(ordered.map(toHomeBot))
    fetchAvatars(rows)
    homeError.set('')
  } catch (e) {
    homeError.set(e instanceof Error ? e.message : 'No se pudieron cargar los bots')
  } finally {
    homeLoading.set(false)
  }
}

export async function loadHome(): Promise<void> {
  homeLoading.set(true)
  await Promise.all([loadActiveProfile(), refresh()])
}

// Live refresh: debounce 500 ms on `sessions.changed` and on app visibility.
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void refresh()
  }, 500)
}

on('sessions.changed', () => scheduleRefresh())

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh()
})
