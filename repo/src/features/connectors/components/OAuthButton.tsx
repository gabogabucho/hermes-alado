import { useCallback, useEffect, useRef, useState } from 'react'
import { pollMcpOAuth, startMcpOAuth, type McpOAuthFlow } from '../../../lib/hermes/connectors'

const POLL_MS = 1000
const MAX_POLL_FAILURES = 3

/**
 * OAuth via poll flow (no callbacks — PWA): start → `window.open` the provider
 * URL → poll `/api/mcp/oauth/flows/{id}` until approved/error, mirroring the
 * web dashboard's `mcp-dashboard-oauth.ts`.
 */
export function OAuthButton({
  serverName,
  profile,
  onDone,
}: {
  serverName: string
  profile?: string
  onDone?: () => void
}) {
  const [state, setState] = useState<'idle' | 'starting' | 'polling' | 'done' | 'error'>('idle')
  const [flow, setFlow] = useState<McpOAuthFlow | null>(null)
  const timerRef = useRef<number | null>(null)
  const stoppedRef = useRef(false)

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      stoppedRef.current = true
      stop()
    },
    [stop],
  )

  const start = async () => {
    setState('starting')
    setFlow(null)
    try {
      const started = await startMcpOAuth(serverName, profile)
      setFlow(started)
      if (!started.authorization_url) {
        setState('error')
        return
      }
      window.open(started.authorization_url, '_blank', 'noopener')
      setState('polling')
      let failures = 0
      timerRef.current = window.setInterval(async () => {
        if (stoppedRef.current) return
        try {
          const current = await pollMcpOAuth(started.flow_id)
          failures = 0
          setFlow(current)
          if (current.status === 'approved') {
            stop()
            setState('done')
            onDone?.()
          } else if (current.status === 'error') {
            stop()
            setState('error')
          }
        } catch {
          failures += 1
          if (failures >= MAX_POLL_FAILURES) {
            stop()
            setState('error')
          }
        }
      }, POLL_MS)
    } catch {
      setState('error')
    }
  }

  const busy = state === 'starting' || state === 'polling'

  return (
    <div className="oauth-flow">
      <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void start()}>
        {busy ? 'Esperando autorización…' : state === 'done' ? 'Autorizado' : 'Autorizar (OAuth)'}
      </button>
      {state === 'error' && (
        <span className="error-text">
          {flow?.error ?? 'No se pudo completar la autorización.'}
          {flow?.authorization_url && (
            <>
              {' '}
              <a href={flow.authorization_url} target="_blank" rel="noreferrer">
                Reintentar en el navegador
              </a>
            </>
          )}
        </span>
      )}
      {state === 'polling' && flow?.authorization_url && (
        <span className="faint">
          Si no se abrió el navegador,{' '}
          <a href={flow.authorization_url} target="_blank" rel="noreferrer">
            abrí este enlace
          </a>
          .
        </span>
      )}
    </div>
  )
}
