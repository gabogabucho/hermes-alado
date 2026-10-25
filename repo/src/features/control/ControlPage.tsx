import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useBack } from '../../app/transition'
import type { ApprovalMode } from '../../lib/hermes/agent-control'
import type { LiveSessionStatus } from '../../lib/hermes/vendor/gateway-contract.generated'
import { Disclosure } from '../../ui/Disclosure'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import { StatusDot, type DotTone } from '../../ui/StatusDot'
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

function checkTone(status: string): DotTone {
  return status === 'pass' || status === 'ok' ? 'ok' : 'warn'
}

export function ControlPage() {
  const back = useBack('/settings')
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

  const cuReady = cu?.ready === true
  const cuDotTone: DotTone = cu == null ? 'neutral' : cuReady ? 'ok' : 'warn'
  const cuDotLabel = cu == null ? 'Sin información' : cuReady ? 'Listo' : 'Requiere configuración'

  return (
    <PageShell title="Control del agente" onBack={back}>
      <Section label="Auto-review">
        {approvalBusy ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <Skeleton height={72} />
          </div>
        ) : approvalFail ? (
          <div className="empty">
            <p className="error-text">{approvalFail}</p>
            <button className="btn" onClick={() => void loadApproval()}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className="control-auto">
            <div className="control-row-title">Pedir aprobación para acciones riesgosas</div>
            <div className="faint">shell, MCP, computadora</div>
            <div className="control-hint">{modeHint}</div>
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
      </Section>

      <Section label="Computadora">
        {tsLoading ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <Skeleton height={56} />
            <Skeleton height={56} />
          </div>
        ) : tsError ? (
          <div className="empty">
            <p className="error-text">{tsError}</p>
            <button className="btn" onClick={() => void loadToolsets()}>
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <Row
              icon="monitor"
              tint="accent"
              title="Control del computador"
              subtitle={
                cuLoading ? 'Comprobando…' : <StatusDot tone={cuDotTone} label={cuDotLabel} />
              }
              trailing={
                <Toggle
                  checked={Boolean(cuRow?.enabled)}
                  onChange={on => void setToolset('computer_use', on)}
                  label="Control del computador"
                />
              }
            />
            <Row
              icon="monitor"
              title="Navegador"
              trailing={
                <Toggle
                  checked={Boolean(browserRow?.enabled)}
                  onChange={on => void setToolset('browser', on)}
                  label="Navegador"
                />
              }
            />
            {tsBusy && <p className="faint" style={{ padding: 'var(--space-2) var(--space-4)' }}>Aplicando cambio…</p>}
          </>
        )}

        {!cuLoading && cuError && (
          <div className="empty">
            <p className="error-text">{cuError}</p>
            <button className="btn" onClick={() => void loadComputerUse()}>
              Reintentar
            </button>
          </div>
        )}

        {!cuLoading && cu && (
          <div className="advanced-block">
            <Disclosure title="Detalles técnicos">
              <Section>
                {cu.error && (
                  <Row
                    icon="bolt"
                    tint="danger"
                    title="Error"
                    subtitle={cu.error}
                  />
                )}
                <Row
                  title="Driver"
                  value={cu.installed ? (cu.version ?? 'Instalado') : 'No instalado'}
                  trailing={<StatusDot tone={cu.installed ? 'ok' : 'warn'} />}
                />
                <Row
                  title="Plataforma"
                  value={cu.platform_supported ? `Soporta ${cu.platform}` : `Sin soporte (${cu.platform})`}
                  trailing={<StatusDot tone={cu.platform_supported ? 'ok' : 'warn'} />}
                />
                {cu.checks.map(check => (
                  <Row
                    key={check.label}
                    title={check.label}
                    subtitle={check.message}
                    trailing={<StatusDot tone={checkTone(check.status)} />}
                  />
                ))}
              </Section>
            </Disclosure>
          </div>
        )}
      </Section>

      <Section label="Tarea en curso">
        {sessionsBusy ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <Skeleton height={56} />
          </div>
        ) : sessionsFail ? (
          <div className="empty">
            <p className="error-text">{sessionsFail}</p>
            <button className="btn" onClick={() => void loadControl()}>
              Reintentar
            </button>
          </div>
        ) : running.length === 0 ? (
          <p className="muted" style={{ padding: 'var(--space-3) var(--space-4)' }}>
            No hay tareas en curso.
          </p>
        ) : (
          running.map(session => (
            <Row
              key={session.id}
              title={session.title || 'Tarea'}
              subtitle={
                SESSION_STATUS_LABELS[session.status] + (session.model ? ` · ${session.model}` : '')
              }
              trailing={
                <button
                  className="btn btn-danger btn-sm"
                  disabled={stopping === session.id}
                  onClick={() => setStopTarget(session.id)}
                >
                  {stopping === session.id ? '…' : 'Detener'}
                </button>
              }
            />
          ))
        )}
      </Section>

      <Section label="Pantalla">
        <Row title="Ver pantalla y tomar el control" value="Próximamente" />
      </Section>

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
    </PageShell>
  )
}
