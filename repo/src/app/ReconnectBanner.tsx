import { useStore } from '@nanostores/react'
import { connectionState, hasOpenedOnce } from '../lib/hermes/connection'

export function ReconnectBanner() {
  const state = useStore(connectionState)
  const opened = hasOpenedOnce()

  if (!opened || state === 'open') return null

  return <div className="reconnect-banner">Reconectando…</div>
}
