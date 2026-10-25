import { atom } from 'nanostores'
import { apiFetch } from '../api'
import { wsUrl } from '../config'
import { resolveAuth, type AuthState } from './auth'
import { getSessionToken } from './session-token'
import type { RpcMethods, BackendGatewayEventMap, GatewayEvent } from './rpc-types'
import { JsonRpcGatewayClient } from './vendor/json-rpc-gateway'
import { reconnectBackoffDelayMs } from './vendor/reconnect-backoff'

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

// `prompt.submit` is fire-and-forget: completion arrives via `message.complete`
// events, not the RPC ACK. The ACK itself can take minutes, so bound it by the
// backend's agent-turn ceiling (apps/desktop/src/api/client.ts).
export const PROMPT_SUBMIT_TIMEOUT_MS = 1_800_000

export const connectionState = atom<ConnectionState>('idle')

let auth: AuthState | null = null
let wantOpen = false
let openedOnce = false
let backoffAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let lastCloseCode: number | null = null
let dialing = false

const client = new JsonRpcGatewayClient({
  onSocketClose: event => {
    lastCloseCode = event.code
    return false
  },
})

client.onState(state => {
  connectionState.set(state)
  if (state === 'open') {
    openedOnce = true
    backoffAttempt = 0
  } else if ((state === 'closed' || state === 'error') && wantOpen) {
    scheduleReconnect()
  }
})

export function hasOpenedOnce(): boolean {
  return openedOnce
}

async function buildWsUrl(): Promise<string> {
  const base = wsUrl('/api/ws')
  const sep = base.includes('?') ? '&' : '?'

  if (auth?.mode === 'loopback') {
    return `${base}${sep}token=${encodeURIComponent(getSessionToken() ?? '')}`
  }

  // Gated: mint a fresh single-use ticket on EVERY connect (30 s TTL).
  const { ticket } = await apiFetch<{ ticket: string }>('/api/auth/ws-ticket', {
    method: 'POST',
  })
  return `${base}${sep}ticket=${encodeURIComponent(ticket)}`
}

async function dial(): Promise<boolean> {
  if (auth?.mode === 'unreachable') {
    connectionState.set('error')
    return false
  }
  if (auth?.mode === 'gated-anonymous') {
    connectionState.set('closed')
    return false
  }

  try {
    const url = await buildWsUrl()
    await client.connect(url)
    return true
  } catch {
    // The client has already moved to 'closed'/'error' via onState.
    return false
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer || !wantOpen) return
  const delay = reconnectBackoffDelayMs(backoffAttempt, { baseDelayMs: 1_000, capMs: 30_000 })
  backoffAttempt += 1
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    void runReconnect()
  }, delay)
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

async function runReconnect(): Promise<void> {
  if (!wantOpen || dialing) return
  dialing = true

  try {
    // Close code 4401 = auth rejection (tui_gateway/chat_ws.py). Re-resolve auth
    // before retrying; if we became anonymous, stop and let the UI show login.
    if (lastCloseCode === 4401) {
      lastCloseCode = null
      auth = await resolveAuth()
    }

    if (!auth) {
      auth = await resolveAuth()
    }

    const ok = await dial()
    if (!ok && wantOpen && auth?.mode !== 'gated-anonymous') {
      scheduleReconnect()
    }
  } finally {
    dialing = false
  }
}

/** Open (or reopen) the gateway connection, resolving auth mode first. */
export async function connect(): Promise<void> {
  wantOpen = true
  await runReconnect()
}

/** Close on purpose; stops the reconnect loop. */
export function close(): void {
  wantOpen = false
  clearReconnectTimer()
  client.close()
}

/** Typed RPC request over the gateway. */
export function request<M extends keyof RpcMethods>(
  method: M,
  params: RpcMethods[M]['params'],
  timeoutMs?: number,
): Promise<RpcMethods[M]['result']> {
  const budget = method === 'prompt.submit' ? PROMPT_SUBMIT_TIMEOUT_MS : timeoutMs
  return client.request<RpcMethods[M]['result']>(
    method,
    params as Record<string, unknown>,
    budget,
  )
}

/** Subscribe to a typed gateway event. */
export function on<E extends keyof BackendGatewayEventMap>(
  type: E,
  handler: (event: GatewayEvent<E>) => void,
): () => void {
  return client.on(type, handler)
}

/** Subscribe to every gateway event. */
export function onAny(handler: (event: GatewayEvent) => void): () => void {
  return client.onAny(handler)
}

// Immediate reconnect on network return / tab becoming visible.
window.addEventListener('online', wake)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') wake()
})

function wake(): void {
  if (!wantOpen || connectionState.get() === 'open') return
  clearReconnectTimer()
  backoffAttempt = 0
  void runReconnect()
}
