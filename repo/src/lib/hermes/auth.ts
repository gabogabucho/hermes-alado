import { ApiError, apiFetch } from '../api'
import { getBackendUrl } from '../config'
import type { UserInfo } from '../types'
import { setSessionToken } from './session-token'

export type AuthState =
  | { mode: 'loopback'; token: string }
  | { mode: 'gated'; user: UserInfo }
  | { mode: 'gated-anonymous' }
  | { mode: 'unreachable'; error: string }

// The token is injected as `window.__HERMES_SESSION_TOKEN__="…"` (json.dumps'd) on a
// loopback `hermes dashboard` root page; gated mode withholds it and reports
// `__HERMES_AUTH_REQUIRED__=true` instead (hermes_cli/web_server_dashboard.py).
const TOKEN_RE = /__HERMES_SESSION_TOKEN__\s*=\s*"((?:[^"\\]|\\.)*)"/

function tokenPagePath(): string {
  const backend = getBackendUrl()
  if (backend) return `${backend}/`
  // In dev our own Vite index.html is served at `/`, so read the loopback token
  // through the `/__hermes_root` proxy (vite.config.ts). In prod the PWA is
  // served same-origin as Hermes and `/` is the dashboard root.
  return import.meta.env.DEV ? '/__hermes_root' : '/'
}

function decodeToken(match: string): string {
  try {
    return JSON.parse(`"${match}"`) as string
  } catch {
    return match
  }
}

/**
 * Detect which Hermes auth mode this backend is in.
 *
 * - loopback: root page exposes the in-memory session token (header auth).
 * - gated: no token on the root page; identity comes from the session cookie.
 * - gated-anonymous: gated backend but no (valid) session cookie.
 * - unreachable: the backend did not answer at all.
 */
export async function resolveAuth(): Promise<AuthState> {
  setSessionToken(null)

  try {
    const res = await fetch(tokenPagePath(), { credentials: 'include' })
    if (res.ok) {
      const html = await res.text()
      const m = TOKEN_RE.exec(html)
      if (m) {
        const token = decodeToken(m[1])
        setSessionToken(token)
        return { mode: 'loopback', token }
      }
    }
  } catch (e) {
    return { mode: 'unreachable', error: e instanceof Error ? e.message : String(e) }
  }

  try {
    const user = await apiFetch<UserInfo>('/api/auth/me')
    return { mode: 'gated', user }
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      return { mode: 'gated-anonymous' }
    }
    return { mode: 'unreachable', error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Mint a single-use WS ticket (30 s TTL). Fired IN PARALLEL with the boot
 * `auth/me` so the socket dial never waits on it serially — a 401 here just
 * means logged out (`tui_gateway/chat_ws.py` answers the ticket endpoint the
 * same way). Returns null on any failure; the caller decides what null means.
 */
export async function mintWsTicket(): Promise<string | null> {
  try {
    const { ticket } = await apiFetch<{ ticket: string }>('/api/auth/ws-ticket', {
      method: 'POST',
    })
    return typeof ticket === 'string' && ticket ? ticket : null
  } catch {
    return null
  }
}
