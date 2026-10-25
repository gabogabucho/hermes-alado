import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { useBack } from '../../app/transition'
import { on } from '../../lib/hermes/connection'
import {
  displayObserve,
  displayStatus,
  leaseAcquire,
  leaseHeldBy,
  leaseRelease,
  parseGeometry,
  screenWsUrl,
  viewerHash,
  type ScreenViewer,
} from '../../lib/hermes/display'
import type { DisplayLease } from '../../lib/hermes/vendor/gateway-contract.generated'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { applyDisplayStatus, computerDetail, computerError, loadComputer } from './store'
import './computer.css'

/**
 * Full-screen live view of the bot's desktop over noVNC (lazy-loaded — the
 * library never reaches the main bundle). Default view-only; "Tomar el
 * control" acquires the lease and unlocks input; "Devolver" hands it back.
 * Phone-first: fit-to-width, pinch-zoom, two-finger scroll, tap = click, and
 * a floating keyboard button for the on-screen keyboard.
 */

type RfbLike = {
  viewOnly: boolean
  scaleViewport: boolean
  resizeSession: boolean
  focusOnClick: boolean
  background: string
  qualityLevel: number
  addEventListener: (type: string, handler: (event: { detail?: { clean?: boolean; reason?: string } }) => void) => void
  disconnect: () => void
  focus: () => void
  sendKey: (keysym: number, code: string, down?: boolean) => void
}

type ConnState = 'idle' | 'attaching' | 'live' | 'error'

type Gesture =
  | { mode: 'idle' }
  | { mode: 'pan'; startX: number; startY: number; baseX: number; baseY: number }
  | {
      mode: 'pinch'
      startX: number
      startY: number
      startDist: number
      base: { x: number; y: number; scale: number }
    }
  | { mode: 'mouse' }

/** Bridge close codes (mirrors tui_gateway display bridge). */
const CLOSE_CONTROL_TAKEN = 4000
const CLOSE_DESKTOP_GONE = 4001
const EVICTION_LOOP_WINDOW_MS = 10_000
const MAX_RAPID_EVICTIONS = 3
const MIN_SCALE = 0.5
const MAX_SCALE = 4
const XK_BackSpace = 0xff08
const XK_Return = 0xff0d

async function loadRfb(): Promise<
  new (target: HTMLElement, socket: WebSocket, options?: Record<string, unknown>) => RfbLike
> {
  const mod = (await import('@novnc/novnc')) as unknown as {
    default: new (...args: never[]) => RfbLike
  }
  return mod.default as unknown as new (target: HTMLElement, socket: WebSocket, options?: Record<string, unknown>) => RfbLike
}

function codeForChar(ch: string): string {
  if (ch === ' ') return 'Space'
  if (/[a-zA-Z]/.test(ch)) return `Key${ch.toUpperCase()}`
  if (/[0-9]/.test(ch)) return `Digit${ch}`
  return ''
}

export default function ComputerLivePage() {
  const { profile = 'default' } = useParams()
  const back = useBack(`/bots/${encodeURIComponent(profile)}/computer`)
  const detail = useStore(computerDetail)
  const loadError = useStore(computerError)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const rfbRef = useRef<RfbLike | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const viewerRef = useRef<ScreenViewer | null>(null)
  const leaseRef = useRef<DisplayLease | null>(null)
  const attachGeneration = useRef(0)
  const dialedAt = useRef(0)
  const rapidEvictions = useRef(0)
  const transformRef = useRef({ x: 0, y: 0, scale: 1 })
  const fitScaleRef = useRef(1)
  const gestureRef = useRef<Gesture>({ mode: 'idle' })
  const lastTextRef = useRef('')

  const [lease, setLease] = useState<DisplayLease | null>(null)
  const [viewer, setViewer] = useState<ScreenViewer | null>(null)
  const [conn, setConn] = useState<ConnState>('idle')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [evicted, setEvicted] = useState(false)
  const [kbdOpen, setKbdOpen] = useState(false)
  const [kbdText, setKbdText] = useState('')

  const iHold = leaseHeldBy(lease, viewer)
  const running = detail?.running === true
  const geometry = useMemo(() => parseGeometry(detail?.geometry), [detail?.geometry])

  const applyLease = useCallback((next: DisplayLease | null) => {
    leaseRef.current = next
    setLease(next)
    const client = rfbRef.current
    if (client) {
      const held = leaseHeldBy(next, viewerRef.current)
      client.viewOnly = !held
      if (held) client.focus()
    }
  }, [])

  const detach = useCallback((handBack = false) => {
    attachGeneration.current += 1
    // noVNC closes without a status; an intentional close must send 1000 first
    // so the bridge hands control back for its holder.
    if (handBack) socketRef.current?.close(1000)
    rfbRef.current?.disconnect()
    rfbRef.current = null
    socketRef.current?.close()
    socketRef.current = null
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      applyDisplayStatus(await displayStatus(profile))
    } catch {
      // the bot-profile row's loader surfaces errors; here the frame just stays
    }
  }, [profile])

  const attach = useCallback(
    async (auto = false) => {
      const canvas = canvasRef.current
      if (!canvas) return
      if (!auto) rapidEvictions.current = 0
      detach()
      const generation = attachGeneration.current
      setConn('attaching')
      setError('')
      try {
        // Load the client BEFORE dialing (noVNC's Websock installs its own
        // onopen; a socket opened during the import would miss the event).
        const Rfb = await loadRfb()
        // Re-present the id this connection already minted: a reconnect must
        // keep the lease bound to this window, or the new stream is watch-only.
        const prior = viewerRef.current?.id
        const observe = await displayObserve(profile, prior)
        const minted = { id: observe.viewer_id, hash: await viewerHash(observe.viewer_id) }
        viewerRef.current = minted
        setViewer(minted)
        applyDisplayStatus(observe)
        if (generation !== attachGeneration.current || !canvasRef.current) return
        setEvicted(false)
        dialedAt.current = Date.now()
        const url = screenWsUrl(observe.ticket)
        const ws = new WebSocket(url)
        ws.binaryType = 'arraybuffer'
        socketRef.current = ws
        // The bridge's verdict lives in the raw close frame (4000 = another
        // viewer took the lease); listen before RFB installs its own onclose.
        let closeCode = 0
        ws.addEventListener('close', event => {
          closeCode = event.code
        })
        const client = new Rfb(canvas, ws, { shared: true })
        client.scaleViewport = false
        client.resizeSession = false
        client.focusOnClick = true
        client.background = 'transparent'
        client.qualityLevel = 7
        client.viewOnly = !leaseHeldBy(observe.lease, minted)
        client.addEventListener('connect', () => {
          if (generation === attachGeneration.current) {
            setConn('live')
            setEvicted(false)
          }
        })
        client.addEventListener('disconnect', event => {
          if (rfbRef.current === client) rfbRef.current = null
          if (generation !== attachGeneration.current) return
          const reason = event.detail?.reason ?? ''
          if (closeCode === CLOSE_CONTROL_TAKEN || reason.includes('control-taken')) {
            // Evicted: re-attach in watch mode on a fresh ticket; a bridge
            // that evicts every fresh attach is bounded, then error state.
            rapidEvictions.current =
              Date.now() - dialedAt.current < EVICTION_LOOP_WINDOW_MS ? rapidEvictions.current + 1 : 1
            if (rapidEvictions.current > MAX_RAPID_EVICTIONS) {
              setEvicted(false)
              setConn('error')
              setError('Otra persona está usando la pantalla. Reintentá en un momento.')
            } else {
              setEvicted(true)
              setConn('idle')
            }
            void refreshStatus()
          } else if (closeCode === CLOSE_DESKTOP_GONE) {
            setConn('error')
            setError('La computadora se apagó.')
            void refreshStatus()
          } else if (event.detail?.clean) {
            setConn('idle')
          } else {
            setConn('error')
            setError(reason || 'Se perdió la conexión con la pantalla')
          }
        })
        rfbRef.current = client
        applyLease(observe.lease)
      } catch (err) {
        if (generation === attachGeneration.current) {
          setConn('error')
          setError(err instanceof Error ? err.message : 'No se pudo conectar con la pantalla')
        }
      }
    },
    [applyLease, detach, profile, refreshStatus],
  )

  // Deep links land here without the status page having loaded first.
  useEffect(() => {
    if (computerDetail.get()?.profile !== profile) void loadComputer(profile)
  }, [profile])

  // Auto-attach once the screen is running (and re-attach in watch mode
  // after the 4000 eviction path drops back to idle).
  useEffect(() => {
    if (running && conn === 'idle') void attach(true)
  }, [running, conn, attach])

  // Lease events for THIS profile's screen repaint the banner and flip the
  // RFB between view-only and input.
  useEffect(() => {
    return on('display.lease', event => {
      const payload = event.payload
      if (!payload?.profile_key) return
      const current = computerDetail.get()
      if (!current?.profile_key || payload.profile_key !== current.profile_key) return
      applyLease(payload.lease)
    })
  }, [applyLease])

  // Hand control back when leaving: unmount and a tab hidden while holding
  // both release the lease (the hidden case keeps the stream attached).
  useEffect(() => {
    return () => {
      const v = viewerRef.current
      if (v && leaseHeldBy(leaseRef.current, v)) {
        void leaseRelease(profile, v.id).catch(() => undefined)
      }
      detach(true)
    }
  }, [detach, profile])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      const v = viewerRef.current
      if (v && leaseHeldBy(leaseRef.current, v)) {
        void leaseRelease(profile, v.id)
          .then(res => applyLease(res.lease))
          .catch(() => undefined)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [applyLease, profile])

  useEffect(() => {
    const client = rfbRef.current
    if (!client) return
    client.viewOnly = !iHold
    if (iHold) client.focus()
  }, [iHold])

  const takeOver = useCallback(async () => {
    const v = viewerRef.current
    if (!v) return
    setBusy(true)
    try {
      const res = await leaseAcquire(profile, v.id)
      applyLease(res.lease)
      if (conn !== 'live') void attach()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo tomar el control')
    } finally {
      setBusy(false)
    }
  }, [applyLease, attach, conn, profile])

  const handBack = useCallback(async () => {
    const v = viewerRef.current
    setBusy(true)
    try {
      const res = await leaseRelease(profile, v?.id)
      applyLease(res.lease)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo devolver el control')
    } finally {
      setBusy(false)
    }
  }, [applyLease, profile])

  // ── viewport gestures (fit-to-width, pinch-zoom, two-finger scroll) ──────

  const applyTransform = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const t = transformRef.current
    stage.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`
  }, [])

  const clampX = useCallback(
    (x: number) => {
      const viewport = viewportRef.current
      if (!viewport) return x
      const sw = geometry.width * transformRef.current.scale
      if (sw <= viewport.clientWidth) return (viewport.clientWidth - sw) / 2
      return Math.min(0, Math.max(viewport.clientWidth - sw, x))
    },
    [geometry],
  )

  const clampY = useCallback(
    (y: number) => {
      const viewport = viewportRef.current
      if (!viewport) return y
      const sh = geometry.height * transformRef.current.scale
      if (sh <= viewport.clientHeight) return (viewport.clientHeight - sh) / 2
      return Math.min(0, Math.max(viewport.clientHeight - sh, y))
    },
    [geometry],
  )

  const resetView = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const fit = viewport.clientWidth / geometry.width
    fitScaleRef.current = fit
    transformRef.current = { x: 0, y: 0, scale: fit }
    applyTransform()
  }, [applyTransform, geometry])

  useEffect(() => {
    resetView()
  }, [resetView, running])

  useEffect(() => {
    const onResize = () => resetView()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [resetView])

  // Native touch listeners (capture + passive:false so preventDefault works;
  // React delegates passive listeners at the root). Tap = click (a synthetic
  // mouse event for noVNC), one finger pans in view-only mode, two fingers
  // pinch-zoom + scroll in both modes.
  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return

    const synthMouse = (type: string, x: number, y: number, buttons: number) => {
      // noVNC listens on the canvas element it creates inside the container.
      const target = canvas.querySelector('canvas') ?? canvas
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons }),
      )
    }

    const onTouchStart = (ev: TouchEvent) => {
      const touches = ev.touches
      if (touches.length >= 2) {
        const a = touches[0]
        const b = touches[1]
        // A second finger while driving the mouse must not leave the
        // synthetic button held down.
        if (gestureRef.current.mode === 'mouse') {
          synthMouse('mouseup', a.clientX, a.clientY, 0)
        }
        const t = transformRef.current
        gestureRef.current = {
          mode: 'pinch',
          startX: (a.clientX + b.clientX) / 2,
          startY: (a.clientY + b.clientY) / 2,
          startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          base: { x: t.x, y: t.y, scale: t.scale },
        }
        ev.preventDefault()
        return
      }
      const t = touches[0]
      if (!t) return
      if (leaseHeldBy(leaseRef.current, viewerRef.current)) {
        gestureRef.current = { mode: 'mouse' }
        synthMouse('mousedown', t.clientX, t.clientY, 1)
      } else {
        const tr = transformRef.current
        gestureRef.current = { mode: 'pan', startX: t.clientX, startY: t.clientY, baseX: tr.x, baseY: tr.y }
      }
      ev.preventDefault()
    }

    const onTouchMove = (ev: TouchEvent) => {
      const g = gestureRef.current
      const t = transformRef.current
      if (g.mode === 'pan') {
        const touch = ev.touches[0]
        if (touch) {
          t.x = clampX(g.baseX + touch.clientX - g.startX)
          t.y = clampY(g.baseY + touch.clientY - g.startY)
          applyTransform()
        }
        ev.preventDefault()
      } else if (g.mode === 'pinch' && ev.touches.length >= 2) {
        const a = ev.touches[0]
        const b = ev.touches[1]
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
        const midX = (a.clientX + b.clientX) / 2
        const midY = (a.clientY + b.clientY) / 2
        const ratio = g.startDist > 0 ? dist / g.startDist : 1
        const scale = Math.min(MAX_SCALE, Math.max(fitScaleRef.current * MIN_SCALE, g.base.scale * ratio))
        const s = scale / g.base.scale
        t.scale = scale
        t.x = clampX(midX - (midX - g.base.x) * s)
        t.y = clampY(midY - (midY - g.base.y) * s)
        applyTransform()
        ev.preventDefault()
      } else if (g.mode === 'mouse') {
        const touch = ev.touches[0]
        if (touch) {
          synthMouse('mousemove', touch.clientX, touch.clientY, 1)
          ev.preventDefault()
        }
      }
    }

    const onTouchEnd = (ev: TouchEvent) => {
      const g = gestureRef.current
      if (g.mode === 'mouse') {
        const touch = ev.changedTouches[0]
        if (touch) synthMouse('mouseup', touch.clientX, touch.clientY, 0)
      }
      if (ev.touches.length === 1) {
        const t = ev.touches[0]
        const tr = transformRef.current
        gestureRef.current = { mode: 'pan', startX: t.clientX, startY: t.clientY, baseX: tr.x, baseY: tr.y }
      } else if (ev.touches.length === 0) {
        gestureRef.current = { mode: 'idle' }
      }
      ev.preventDefault()
    }

    stage.addEventListener('touchstart', onTouchStart, { capture: true, passive: false })
    stage.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    stage.addEventListener('touchend', onTouchEnd, { capture: true, passive: false })
    stage.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: false })
    return () => {
      stage.removeEventListener('touchstart', onTouchStart, true)
      stage.removeEventListener('touchmove', onTouchMove, true)
      stage.removeEventListener('touchend', onTouchEnd, true)
      stage.removeEventListener('touchcancel', onTouchEnd, true)
    }
  }, [applyTransform, clampX, clampY, running])

  // ── on-screen keyboard ───────────────────────────────────────────────────

  const openKeyboard = () => {
    lastTextRef.current = ''
    setKbdText('')
    setKbdOpen(true)
  }

  const onKbdInput = (value: string) => {
    const client = rfbRef.current
    if (!client) return
    const prev = lastTextRef.current
    if (value.length > prev.length) {
      for (const ch of value.slice(prev.length)) {
        if (ch === '\n') client.sendKey(XK_Return, 'Enter')
        else client.sendKey(ch.codePointAt(0) ?? 0, codeForChar(ch))
      }
    } else {
      for (let i = 0; i < prev.length - value.length; i++) client.sendKey(XK_BackSpace, 'Backspace')
    }
    lastTextRef.current = value
    // A newline was sent as Enter; clear so the next diff starts fresh.
    if (value.endsWith('\n')) {
      lastTextRef.current = ''
      setKbdText('')
    }
  }

  return (
    <div className="comp-live">
      <header className="comp-live-topbar">
        <IconButton icon="back" variant="glass" label="Volver" onClick={back} />
        <span className="comp-live-title">Computadora</span>
        {iHold ? (
          <span className="comp-live-chip comp-live-chip--control">Tenés el control</span>
        ) : lease?.holder === 'human' ? (
          <span className="comp-live-chip comp-live-chip--other">Otra persona la controla</span>
        ) : (
          <span className="comp-live-chip">Solo mirando</span>
        )}
        <span className="comp-live-spacer" />
        {iHold ? (
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void handBack()}>
            Devolver
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy || conn === 'attaching' || !viewer || !running}
            onClick={() => void takeOver()}
          >
            Tomar el control
          </button>
        )}
      </header>

      {iHold && <div className="comp-live-banner">Tenés el control — el bot está en pausa</div>}

      {!detail ? (
        <div className="comp-live-off">
          <p className="muted">
            {loadError ? `No se pudo cargar la computadora: ${loadError}` : 'Cargando…'}
          </p>
          {loadError && (
            <button type="button" className="btn btn-sm" onClick={() => void loadComputer(profile)}>
              Reintentar
            </button>
          )}
        </div>
      ) : !detail.running ? (
        <div className="comp-live-off">
          <p className="muted">La computadora está apagada.</p>
          <button type="button" className="btn btn-sm" onClick={back}>
            Volver
          </button>
        </div>
      ) : (
        <div className="comp-live-viewport" ref={viewportRef}>
          <div className="comp-live-stage" ref={stageRef} style={{ width: geometry.width, height: geometry.height }}>
            <div className="comp-live-canvas" ref={canvasRef} />
          </div>
          {conn === 'attaching' && <div className="comp-live-overlay">Conectando…</div>}
          {evicted && conn !== 'error' && (
            <div className="comp-live-note">Otra persona tomó el control — volviendo a mirar…</div>
          )}
          {conn === 'error' && error && (
            <div className="comp-live-error">
              {error}
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: 8 }}
                onClick={() => setConn('idle')}
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      )}

      {iHold && (
        <button type="button" className="comp-live-kbd" aria-label="Abrir teclado" onClick={openKeyboard}>
          <Icon name="keyboard" size={22} />
        </button>
      )}

      {kbdOpen && (
        <div className="comp-live-kbdbar">
          <textarea
            className="comp-live-kbdinput"
            rows={1}
            autoFocus
            value={kbdText}
            onChange={e => onKbdInput(e.target.value)}
            onKeyDown={e => e.stopPropagation()}
            onKeyUp={e => e.stopPropagation()}
            placeholder="Escribí acá…"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
          />
          <button type="button" className="btn btn-sm" onClick={() => setKbdOpen(false)}>
            Listo
          </button>
        </div>
      )}
    </div>
  )
}
