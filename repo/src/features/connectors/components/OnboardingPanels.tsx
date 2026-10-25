import { useEffect, useRef, useState } from 'react'
import {
  applyTelegramOnboarding,
  applyWhatsappOnboarding,
  cancelTelegramOnboarding,
  cancelWhatsappOnboarding,
  getTelegramOnboarding,
  getWhatsappOnboarding,
  startTelegramOnboarding,
  startWhatsappOnboarding,
  type TelegramOnboarding,
  type WhatsappOnboarding,
} from '../../../lib/hermes/connectors'
import { QrCode } from './QrCode'

const POLL_MS = 2000

function usePolling(callback: () => Promise<boolean>, active: boolean): void {
  const cbRef = useRef(callback)
  useEffect(() => {
    cbRef.current = callback
  })
  useEffect(() => {
    if (!active) return
    let cancelled = false
    const tick = async () => {
      const stop = await cbRef.current()
      if (!cancelled && !stop) {
        timer.current = window.setTimeout(() => void tick(), POLL_MS)
      }
    }
    const timer = { current: window.setTimeout(() => void tick(), POLL_MS) }
    return () => {
      cancelled = true
      window.clearTimeout(timer.current)
    }
  }, [active])
}

const TERMINAL_WHATSAPP = new Set(['connected', 'error', 'expired', 'cancelled'])

export function TelegramOnboarding({
  profile,
  onDone,
}: {
  profile?: string
  onDone: () => Promise<void> | void
}) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'waiting' | 'ready' | 'error'>('idle')
  const [data, setData] = useState<TelegramOnboarding | null>(null)
  const [allowedIds, setAllowedIds] = useState('')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  const start = async () => {
    setError('')
    setPhase('starting')
    try {
      const res = await startTelegramOnboarding('Hermes Agent', profile)
      setData(res)
      setPhase(res.status === 'ready' ? 'ready' : 'waiting')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar.')
      setPhase('error')
    }
  }

  usePolling(
    async () => {
      if (!data) return true
      try {
        const res = await getTelegramOnboarding(data.pairing_id)
        setData(res)
        if (res.status === 'ready') {
          setPhase('ready')
          return true
        }
        return false
      } catch (e) {
        const status = (e as { status?: number }).status
        setError(status === 410 ? 'El código venció. Iniciá de nuevo.' : 'No se pudo verificar el vínculo.')
        setPhase('error')
        return true
      }
    },
    phase === 'waiting' && data !== null,
  )

  const apply = async () => {
    if (!data) return
    setApplying(true)
    setError('')
    const ids = allowedIds
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(Boolean)
    try {
      await applyTelegramOnboarding(data.pairing_id, ids, profile)
      setPhase('idle')
      setData(null)
      setAllowedIds('')
      await onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar el vínculo.')
      setPhase('ready')
    } finally {
      setApplying(false)
    }
  }

  const cancel = async () => {
    if (data) await cancelTelegramOnboarding(data.pairing_id).catch(() => undefined)
    setPhase('idle')
    setData(null)
    setAllowedIds('')
  }

  if (phase === 'idle') {
    return (
      <button type="button" className="btn btn-block" onClick={() => void start()}>
        Vincular con QR
      </button>
    )
  }

  return (
    <div className="onboarding">
      {phase === 'starting' && <p className="muted">Iniciando vínculo…</p>}
      {(phase === 'waiting' || phase === 'ready') && data && (
        <>
          {data.qr_payload && (
            <div className="qr-card">
              <QrCode value={data.qr_payload} />
              <p className="faint">Escaneá con Telegram</p>
            </div>
          )}
          {data.deep_link && (
            <a className="btn btn-block" style={{ marginTop: 10 }} href={data.deep_link} target="_blank" rel="noreferrer">
              Abrir en Telegram
            </a>
          )}
          {data.suggested_username && <p className="muted">Bot: @{data.suggested_username}</p>}
          {phase === 'ready' && (
            <>
              <label className="config-label" htmlFor="tg-ids">
                IDs de Telegram autorizados (uno por línea o separados por coma)
              </label>
              <textarea
                id="tg-ids"
                className="input"
                rows={3}
                value={allowedIds}
                onChange={e => setAllowedIds(e.target.value)}
                placeholder="123456789, 987654321"
              />
              <div className="row" style={{ marginTop: 10 }}>
                <button type="button" className="btn" onClick={() => void cancel()}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={applying}
                  onClick={() => void apply()}
                >
                  {applying ? '…' : 'Terminar vínculo'}
                </button>
              </div>
            </>
          )}
          {phase === 'waiting' && (
            <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => void cancel()}>
              Cancelar
            </button>
          )}
        </>
      )}
      {phase === 'error' && (
        <>
          <p className="error-text">{error}</p>
          <button type="button" className="btn" onClick={() => void cancel()}>
            Cerrar
          </button>
        </>
      )}
    </div>
  )
}

export function WhatsappOnboarding({
  profile,
  onDone,
}: {
  profile?: string
  onDone: () => Promise<void> | void
}) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'waiting' | 'connected' | 'error'>('idle')
  const [data, setData] = useState<WhatsappOnboarding | null>(null)
  const [mode, setMode] = useState<'bot' | 'self-chat'>('bot')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  const start = async () => {
    setError('')
    setPhase('starting')
    try {
      const res = await startWhatsappOnboarding(mode, profile)
      setData(res)
      if (res.status === 'connected') setPhase('connected')
      else if (TERMINAL_WHATSAPP.has(res.status)) {
        setError(res.error ?? `Estado: ${res.status}`)
        setPhase('error')
      } else setPhase('waiting')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar.')
      setPhase('error')
    }
  }

  usePolling(
    async () => {
      if (!data) return true
      try {
        const res = await getWhatsappOnboarding(data.pairing_id)
        setData(res)
        if (res.status === 'connected') {
          setPhase('connected')
          return true
        }
        if (TERMINAL_WHATSAPP.has(res.status) && res.status !== 'connected') {
          setError(res.error ?? `Estado: ${res.status}`)
          setPhase('error')
          return true
        }
        return false
      } catch (e) {
        const status = (e as { status?: number }).status
        setError(status === 410 ? 'El código venció. Iniciá de nuevo.' : 'No se pudo verificar el vínculo.')
        setPhase('error')
        return true
      }
    },
    phase === 'waiting' && data !== null,
  )

  const apply = async () => {
    if (!data) return
    setApplying(true)
    setError('')
    try {
      await applyWhatsappOnboarding(data.pairing_id, mode, profile)
      setPhase('idle')
      setData(null)
      await onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar el vínculo.')
      setPhase('connected')
    } finally {
      setApplying(false)
    }
  }

  const cancel = async () => {
    if (data) await cancelWhatsappOnboarding(data.pairing_id).catch(() => undefined)
    setPhase('idle')
    setData(null)
  }

  if (phase === 'idle') {
    return (
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select className="input" style={{ flex: 1 }} value={mode} onChange={e => setMode(e.target.value as 'bot' | 'self-chat')}>
          <option value="bot">Modo bot</option>
          <option value="self-chat">Self-chat</option>
        </select>
        <button type="button" className="btn btn-primary" onClick={() => void start()}>
          Vincular
        </button>
      </div>
    )
  }

  return (
    <div className="onboarding">
      {(phase === 'starting' || phase === 'waiting') && (
        <>
          {data?.qr_payload && (
            <div className="qr-card">
              <QrCode value={data.qr_payload} />
              <p className="faint">Escaneá con WhatsApp (Dispositivos vinculados)</p>
            </div>
          )}
          <p className="muted">
            {phase === 'starting' ? 'Preparando sesión…' : `Esperando el escaneo (${data?.status ?? 'waiting'})…`}
          </p>
          <button type="button" className="btn" onClick={() => void cancel()}>
            Cancelar
          </button>
        </>
      )}
      {phase === 'connected' && data && (
        <>
          <p className="chip ok">
            Conectado{data.account_name ? ` como ${data.account_name}` : ''}
            {data.account_phone ? ` (${data.account_phone})` : ''}
          </p>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn" onClick={() => void cancel()}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={applying} onClick={() => void apply()}>
              {applying ? '…' : 'Guardar vínculo'}
            </button>
          </div>
        </>
      )}
      {phase === 'error' && (
        <>
          <p className="error-text">{error}</p>
          <button type="button" className="btn" onClick={() => void cancel()}>
            Cerrar
          </button>
        </>
      )}
    </div>
  )
}
