const BACKEND_KEY = 'hermes.backendUrl'

export function getBackendUrl(): string {
  const v = localStorage.getItem(BACKEND_KEY)
  return (v ?? '').trim().replace(/\/+$/, '')
}

export function setBackendUrl(url: string): void {
  const clean = url.trim().replace(/\/+$/, '')
  if (clean) localStorage.setItem(BACKEND_KEY, clean)
  else localStorage.removeItem(BACKEND_KEY)
}

/** Absolute URL for an API path, using the configured backend or same-origin. */
export function apiUrl(path: string): string {
  const base = getBackendUrl()
  return base + path
}

/** WebSocket URL for a path, flipping the scheme to ws/wss. */
export function wsUrl(path: string): string {
  const base = getBackendUrl()
  const target = base || window.location.origin
  const u = new URL(target)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = path
  return u.toString()
}

/** The login page (same-origin). `path` is the relative post-login return path. */
export function loginUrl(path = '/'): string {
  return `/login?next=${encodeURIComponent(path)}`
}
