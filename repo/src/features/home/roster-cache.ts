import { getBackendUrl } from '../../lib/config'
import type { ProfileRow } from '../../lib/hermes/rpc-types'

/**
 * Last-known roster cache — the ONE allowed client-storage exception to
 * "only the backend URL may be persisted" (see AGENTS.md hard rule 4):
 * Home paints instantly from this and refreshes in the background
 * (stale-while-revalidate).
 *
 * Contents are strictly non-secret: bot names, titles, avatar appearance
 * config, model/description labels, last-active stamps and the
 * session ids the roster rows already expose. No tokens, no credentials.
 * Keyed by backend origin so switching backends never leaks one server's
 * roster into another.
 */

const KEY_PREFIX = 'droidbot.roster.'

export interface CachedRoster {
  savedAt: number
  rows: ProfileRow[]
}

function storageKey(): string {
  return KEY_PREFIX + (getBackendUrl() || 'same-origin')
}

export function readRosterCache(): CachedRoster | null {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CachedRoster>
    if (!Array.isArray(parsed.rows)) return null
    return { savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0, rows: parsed.rows }
  } catch {
    return null
  }
}

// Message content never reaches storage: chat previews/snippets are dropped
// at any depth (they refresh from the server a moment later anyway).
const CONTENT_KEYS = new Set(['preview', 'last_message', 'snippet', 'content', 'text', 'summary'])

export function writeRosterCache(rows: ProfileRow[]): void {
  try {
    const entry: CachedRoster = { savedAt: Date.now(), rows }
    localStorage.setItem(storageKey(), JSON.stringify(entry, (k, v) => (CONTENT_KEYS.has(k) ? undefined : v)))
  } catch {
    // storage full/unavailable; the cache is a paint-fast nicety, never fatal
  }
}
