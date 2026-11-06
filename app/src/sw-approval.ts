/// <reference lib="webworker" />
//
// Approve/Reject desde la notificación, sin abrir la app.
//
// El push de una aprobación llega con un bloque `approval` (session_key,
// request_id, command). Al tocar un botón, el SW abre SU PROPIO websocket al
// gateway (ticket mono-uso vía POST /api/auth/ws-ticket con la cookie de
// sesión) y llama `approval.respond` — el mismo RPC que usa la app abierta:
//   approve → choice "once"  (consiento una sola vez, la opción más segura)
//   reject  → choice "deny"
// Sin cookie válida, gateway abajo o sesión desaparecida → false, y quien
// llama abre el chat para responder a mano (degradación honesta, nunca un
// falso "aprobado").

declare let self: ServiceWorkerGlobalScope

export interface PushApproval {
  session_key: string
  request_id?: string | null
  command?: string
}

const WS_TIMEOUT_MS = 12_000

function wsOrigin(): string {
  const u = new URL(self.location.origin)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  return u.toString().replace(/\/$/, '')
}

async function mintTicket(): Promise<string> {
  const res = await fetch('/api/auth/ws-ticket', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`ws-ticket ${res.status}`)
  const body = (await res.json()) as { ticket?: string }
  if (!body.ticket) throw new Error('ws-ticket empty')
  return body.ticket
}

/**
 * Responde la aprobación pendiente. True solo cuando el gateway confirmó
 * (`resolved >= 1`); cualquier otra cosa es "no pasó nada" y el llamador
 * debe ofrecer el camino manual.
 */
export async function respondApproval(
  approval: PushApproval,
  choice: 'once' | 'deny',
): Promise<boolean> {
  const ticket = await mintTicket()
  const socket = new WebSocket(`${wsOrigin()}/api/ws?ticket=${encodeURIComponent(ticket)}`)

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ws open timeout')), WS_TIMEOUT_MS)
      socket.onopen = () => {
        clearTimeout(timer)
        resolve()
      }
      socket.onerror = () => {
        clearTimeout(timer)
        reject(new Error('ws error'))
      }
    })

    const reply = await new Promise<{ result?: { resolved?: number }; error?: unknown }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ws reply timeout')), WS_TIMEOUT_MS)
      socket.onmessage = (event: MessageEvent) => {
        try {
          const frame = JSON.parse(String(event.data)) as {
            id?: number
            result?: { resolved?: number }
            error?: unknown
          }
          if (frame.id === 1) {
            clearTimeout(timer)
            resolve(frame)
          }
        } catch {
          // frame no-JSON (early hello, eventos): ignorar y seguir esperando
        }
      }
      socket.onerror = () => {
        clearTimeout(timer)
        reject(new Error('ws error'))
      }
      const request: Record<string, unknown> = {
        jsonrpc: '2.0',
        id: 1,
        method: 'approval.respond',
        params: {
          session_id: approval.session_key,
          choice,
          ...(approval.request_id ? { request_id: approval.request_id } : {}),
        },
      }
      socket.send(JSON.stringify(request))
    })

    return Boolean(reply.result && Number(reply.result.resolved) >= 1)
  } finally {
    try {
      socket.close()
    } catch {
      // ya cerrado
    }
  }
}
