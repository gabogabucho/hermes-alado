import { useEffect, useState } from 'react'
import {
  approvePairing,
  getPairing,
  revokePairing,
  type PairingPayload,
} from '../../../lib/hermes/connectors'

export function PairingPanel({ profile, onChanged }: { profile?: string; onChanged: () => Promise<void> | void }) {
  const [pairing, setPairing] = useState<PairingPayload | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = async () => {
    try {
      setPairing(await getPairing(profile))
    } catch {
      // pairing requests are optional context; a failure must not block the page
      setPairing(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    getPairing(profile)
      .then(p => {
        if (!cancelled) setPairing(p)
      })
      .catch(() => {
        if (!cancelled) setPairing(null)
      })
    return () => {
      cancelled = true
    }
  }, [profile])

  const approve = async (user: { platform: string; request_id?: string }) => {
    if (!user.request_id) return
    setBusy(user.request_id)
    setError('')
    try {
      await approvePairing(user.platform, user.request_id, profile)
      await load()
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aprobar.')
    } finally {
      setBusy('')
    }
  }

  const revoke = async (user: { platform: string; user_id: string }) => {
    setBusy(user.user_id)
    setError('')
    try {
      await revokePairing(user.platform, user.user_id, profile)
      await load()
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revocar.')
    } finally {
      setBusy('')
    }
  }

  if (!pairing) return null

  return (
    <div className="ui-section">
      <h2>Vinculaciones pendientes</h2>
      {pairing.pending.length === 0 && <p className="muted">No hay solicitudes.</p>}
      <div className="list">
        {pairing.pending.map(u => (
          <div key={`${u.platform}:${u.user_id}`} className="list-row">
            <span className="list-row-body">
              <span className="list-row-title">
                {u.user_name ?? u.user_id} <span className="faint">({u.platform})</span>
              </span>
              {u.age_minutes !== undefined && (
                <span className="list-row-subtitle">hace {u.age_minutes} min</span>
              )}
            </span>
            <span className="list-row-trailing">
              <button
                type="button"
                className="btn"
                disabled={busy === u.request_id}
                onClick={() => void approve(u)}
              >
                Aprobar
              </button>
            </span>
          </div>
        ))}
      </div>
      {pairing.approved.length > 0 && (
        <>
          <h2 style={{ marginTop: 16 }}>Aprobados</h2>
          <div className="list">
            {pairing.approved.map(u => (
              <div key={`${u.platform}:${u.user_id}`} className="list-row">
                <span className="list-row-body">
                  <span className="list-row-title">
                    {u.user_name ?? u.user_id} <span className="faint">({u.platform})</span>
                  </span>
                </span>
                <span className="list-row-trailing">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy === u.user_id}
                    onClick={() => void revoke(u)}
                  >
                    Revocar
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
