import { apiFetch } from './api'
import { wsUrl } from './config'

export type ConsoleFrame = {
  type: string
  id?: number
  status?: string
  data?: string
  message?: string
  command?: string
  profile?: string
  [key: string]: unknown
}

type Listener = (frame: ConsoleFrame) => void

/**
 * Thin client over the Hermes `/api/console` WebSocket.
 *
 * Protocol (server -> client): `ready`, `output`, `complete`, `error`,
 * `confirm_required`, `pong`.
 * Protocol (client -> server): `{type:"input", line}` or
 * `{type:"command", command}`, plus `ping` / `cancel` / `confirm`.
 */
export class ConsoleClient {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private queue: string[] = []
  private opened = false
  private shouldClose = false

  connect(profile?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const path = profile && profile !== 'current' ? `/api/console?profile=${encodeURIComponent(profile)}` : '/api/console'
      const base = wsUrl(path)

      apiFetch<{ ticket: string }>('/api/auth/ws-ticket', { method: 'POST' })
        .then(({ ticket }) => {
          const sep = base.includes('?') ? '&' : '?'
          this.openSocket(`${base}${sep}ticket=${encodeURIComponent(ticket)}`, resolve, reject)
        })
        .catch(() => {
          // Fallback: rely on the session cookie (same-origin deployments).
          this.openSocket(base, resolve, reject)
        })
    })
  }

  private openSocket(url: string, resolve: () => void, reject: (e: Error) => void) {
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      this.opened = true
      this.flush()
      resolve()
    }

    ws.onmessage = (e) => {
      try {
        const frame = JSON.parse(String(e.data)) as ConsoleFrame
        this.listeners.forEach((l) => l(frame))
      } catch {
        // ignore malformed frame
      }
    }

    ws.onclose = () => {
      this.opened = false
      this.ws = null
      if (!this.shouldClose) this.listeners.forEach((l) => l({ type: 'closed' }))
    }

    ws.onerror = () => {
      if (!this.opened) reject(new Error('No se pudo conectar al console de Hermes'))
    }
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  send(line: string): void {
    if (this.opened && this.ws) {
      this.ws.send(JSON.stringify({ type: 'input', line }))
    } else {
      this.queue.push(line)
    }
  }

  cancel(): void {
    if (this.opened && this.ws) this.ws.send(JSON.stringify({ type: 'cancel' }))
  }

  confirm(command: string): void {
    if (this.opened && this.ws) this.ws.send(JSON.stringify({ type: 'confirm', command }))
  }

  close(): void {
    this.shouldClose = true
    this.ws?.close()
  }

  private flush() {
    while (this.queue.length) {
      this.ws?.send(JSON.stringify({ type: 'input', line: this.queue.shift()! }))
    }
  }
}
