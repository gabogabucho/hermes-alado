// The loopback session token lives in memory only (never persisted — AGENTS.md rule 4).
let sessionToken: string | null = null

export function setSessionToken(token: string | null): void {
  sessionToken = token
}

export function getSessionToken(): string | null {
  return sessionToken
}
