import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useSlideNavigate } from '../../app/transition'
import type { ApprovalMode } from '../../lib/hermes/agent-control'
import type { LiveSessionStatus } from '../../lib/hermes/vendor/gateway-contract.generated'
import { IconButton } from '../../ui/IconButton'
import { Skeleton } from '../../ui/Skeleton'
import { Toggle } from '../../ui/Toggle'
import { ConfirmSheet } from '../vault/ConfirmSheet'
import {
  activeSessions,
  approvalError,
  approvalLoading,
  approvalMode,
  approvalSaving,
  computerUse,
  computerUseError,
  computerUseLoading,
  interruptBusy,
  loadApproval,
  loadComputerUse,
  loadControl,
  loadToolsets,
  saveApproval,
  sessionsError,
  sessionsLoading,
  setToolset,
  stopSession,
  toolsetBusy,
  toolsetError,
  toolsets,
  toolsetsLoading,
} from './store'
import './control.css'

const SESSION_STATUS_LABELS: Record<LiveSessionStatus, string> = {
  idle: 'Inactiva',
  starting: 'Arrancando',
  waiting: 'Esperando',
  working: 'Trabajando',
  streaming: 'Escribiendo',
  resuming: 'Retomando',
}

const RUNNING_STATUSES: LiveSessionStatus[] = ['starting', 'waiting', 'working', 'streaming', 'resuming']

const APPROVAL_OPTIONS: { mode: ApprovalMode; label: string }[] = [
  { mode: 'manual', label: 'Siempre' },
  { mode: 'smart', label: 'Inteligente' },
  { mode: 'off', label: 'Nunca' },
]

export function ControlPage() {
  const { back } = useSlideNavigate()
  const mode = useStore(approvalMode)
  const approvalBusy = useStore(approvalLoading)
  const approvalFail = useStore(approvalError)
  const approvalPending = useStore(approvalSaving)

  const cu = useStore(computerUse)
  const cuLoading = useStore(computerUseLoading)
  const cuError = useStore(computerUseError)

  const ts = useStore(toolsets)
  const tsLoading = useStore(toolsetsLoading)
  const tsError = useStore(toolsetError)
  const tsBusy = useStore(toolsetBusy)

  const sessions = useStore(activeSessions)
  const sessionsBusy = useStore(sessionsLoading)
  const sessionsFail = useStore(sessionsError)
  const stopping = useStore(interruptBusy)

  const [stopTarget, setStopTarget] = useState('')

  useEffect(() => {
    void loadControl()
  }, [])

  const running = useMemo(
    () => sessions.filter(s => RUNNING_STATUSES.includes(s.status)),
    [sessions],
  )
  const cuRow = ts.find(row => row.name === 'computer_use')
  const browserRow = ts.find(row => row.name === 'browser')

  const modeHint =
    mode === 'manual'
      ? 'Siempre pide aprobación antes de una acción riesgosa.'
      : mode === 'smart'
        ? 'Modo inteligente: pide en las riesgosas y resuelve solo las de bajo riesgo.'
        : 'No pide aprobación: el bot ejecuta acciones riesgosas por su cuenta.'

  return (
    <div className="settings-page">
      <header className="page-header glass">
        <IconButton icon="back" variant="ghost" label="Volver" onClick={back} />
        <h1 className="page-header-title">Control del agente</h1>
      </header>

      {/* Auto-review */}
      <section className="control-section">
        <h2 className="control-section-title">Auto-review</h2>
        {approvalBusy ? (
          <Skeleton height={72} />
        ) : approvalFail ? (
          <div className="empty">
            <p className="error-text">{approvalFail}</p>
            <button className="btn" onClick={() => void loadApproval()}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className="card control-row control-row-stack">
            <div className="spacer">
              <div className="control-row-title">Pedir aprobación para acciones riesgosas</div>
              <div className="faint">shell, MCP, computadora</div>
              <div className="control-hint">{modeHint}</div>
            </div>
            <div className="segmented" role="radiogroup" aria-label="Modo de aprobación">
              {APPROVAL_OPTIONS.map(opt => (
                <button
                  key={opt.mode}
                  type="button"
                  role="radio"
                  aria-checked={mode === opt.mode}
                  className={mode === opt.mode ? 'segmented-item active' : 'segmented-item'}
                  disabled={approvalPending}
                  onClick={() => void saveApproval(opt.mode)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {approvalPending && <span className="faint">Guardando…</span>}
          </div>
        )}
      </section>

      {/* Computer use */}
      <section className="control-section">
        <h2 className="control-section-title">Computadora</h2>
        {tsLoading ? (
          <Skeleton height={120} />
        ) : tsError ? (
          <div className="empty">
            <p className="error-text">{tsError}</p>
            <button className="btn" onClick={() => void loadToolsets()}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className="list">
            <div className="card control-row">
              <div className="spacer">
                <div className="control-row-title">Control del computador</div>
                <div className="faint">
                  {cuRow?.enabled ? 'Activo' : 'Inactivo'} · toolset computer_use
                </div>
              </div>
              <Toggle
                checked={Boolean(cuRow?.enabled)}
                onChange={on => void setToolset('computer_use', on)}
                label="Control del computador"
              />
            </div>
            <div className="card control-row">
              <div className="spacer">
                <div className="control-row-title">Navegador</div>
                <div className="faint">
                  {browserRow?.enabled ? 'Activo' : 'Inactivo'} · toolset browser
                </div>
              </div>
              <Toggle
                checked={Boolean(browserRow?.enabled)}
                onChange={on => void setToolset('browser', on)}
                label="Navegador"
              />
            </div>
            {tsBusy && <p className="faint">Aplicando cambio…</p>}
          </div>
        )}

        {cuLoading ? (
          <Skeleton height={56} />
        ) : cuError ? (
          <div className="card" style={{ marginTop: 10 }}>
            <p className="error-text">{cuError}</p>
            <button className="btn" onClick={() => void loadComputerUse()}>
              Reintentar
            </button>
          </div>
        ) : cu ? (
          <div className="card" style={{ marginTop: 10 }}>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span className={`chip${cu.ready === true ? ' ok' : cu.ready === false ? ' warn' : ''}`}>
                {cu.ready === true ? 'Listo' : cu.ready === false ? 'Faltan permisos' : 'Estado desconocido'}
              </span>
              <span className="chip">{cu.installed ? (cu.version ?? 'Instalado') : 'Driver no instalado'}</span>
              <span className={`chip${cu.platform_supported ? ' ok' : ''}`}>
                {cu.platform_supported ? `Soporta ${cu.platform}` : `Sin soporte (${cu.platform})`}
              </span>
            </div>
            {cu.error && <p className="error-text">{cu.error}</p>}
            {cu.checks.map(check => (
              <div key={check.label} className="control-check">
                <span className="control-check-label">{check.label}</span>
                <span className="faint">
                  {check.status}: {check.message}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* Tarea en curso */}
      <section className="control-section">
        <h2 className="control-section-title">Tarea en curso</h2>
        {sessionsBusy ? (
          <Skeleton height={64} />
        ) : sessionsFail ? (
          <div className="empty">
            <p className="error-text">{sessionsFail}</p>
            <button className="btn" onClick={() => void loadControl()}>
              Reintentar
            </button>
          </div>
        ) : running.length === 0 ? (
          <p className="muted">No hay tareas en curso.</p>
        ) : (
          <div className="list">
            {running.map(session => (
              <div key={session.id} className="card control-row">
                <div className="spacer">
                  <div className="control-row-title">{session.title || 'Tarea'}</div>
                  <div className="faint">
                    {SESSION_STATUS_LABELS[session.status]}
                    {session.model ? ` · ${session.model}` : ''}
                  </div>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  style={{ minHeight: 44 }}
                  disabled={stopping === session.id}
                  onClick={() => setStopTarget(session.id)}
                >
                  {stopping === session.id ? '…' : 'Detener'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Level 2 placeholder */}
      <section className="control-section">
        <h2 className="control-section-title">Pantalla</h2>
        <div className="card control-row control-row--disabled" aria-disabled="true">
          <div className="spacer">
            <div className="control-row-title">Ver pantalla y tomar el control</div>
            <div className="faint">Próximamente</div>
          </div>
        </div>
      </section>

      <ConfirmSheet
        open={stopTarget !== ''}
        onClose={() => setStopTarget('')}
        title="Detener tarea"
        body="¿Detenés la tarea en curso? El turno se interrumpe y se pierde lo que estaba haciendo."
        confirmLabel="Detener"
        busy={stopping !== ''}
        onConfirm={() => {
          const id = stopTarget
          setStopTarget('')
          void stopSession(id)
        }}
      />
    </div>
  )
}
