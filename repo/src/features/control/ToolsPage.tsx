import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { ApplyToAllSheet } from '../bots/ApplyToAllSheet'
import { BotScopedScreen } from '../bot-profile/BotScopedScreen'
import { getToolsets, toggleToolset } from '../../lib/hermes/agent-control'
import type { LiveSessionStatus } from '../../lib/hermes/vendor/gateway-contract.generated'
import { Disclosure } from '../../ui/Disclosure'
import { Row, Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import { StatusDot, type DotTone } from '../../ui/StatusDot'
import { Toggle } from '../../ui/Toggle'
import { ConfirmSheet } from '../vault/ConfirmSheet'
import {
  activeSessions,
  computerUse,
  computerUseError,
  computerUseLoading,
  interruptBusy,
  loadActiveSessions,
  loadComputerUse,
  loadToolsets,
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

function checkTone(status: string): DotTone {
  return status === 'pass' || status === 'ok' ? 'ok' : 'warn'
}

/**
 * Herramientas (per bot): the computer_use / browser toolset toggles for THIS
 * bot (`/bots/:profile/tools`) plus its tasks in flight, with "Aplicar a
 * todos mis bots" for the toggle pair.
 */
export function ToolsPage() {
  const { profile = 'default' } = useParams()

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
  const [applyOpen, setApplyOpen] = useState(false)

  useEffect(() => {
    void loadToolsets(profile)
    void loadComputerUse(profile)
    void loadActiveSessions(profile)
  }, [profile])

  const running = useMemo(
    () => sessions.filter(s => RUNNING_STATUSES.includes(s.status)),
    [sessions],
  )
  const cuRow = ts.find(row => row.name === 'computer_use')
  const browserRow = ts.find(row => row.name === 'browser')

  const cuReady = cu?.ready === true
  const cuDotTone: DotTone = cu == null ? 'neutral' : cuReady ? 'ok' : 'warn'
  const cuDotLabel = cu == null ? 'Sin información' : cuReady ? 'Listo' : 'Requiere configuración'

  const cuEnabled = Boolean(cuRow?.enabled)
  const browserEnabled = Boolean(browserRow?.enabled)
  const togglesReady = !tsLoading && !tsError

  return (
    <BotScopedScreen profile={profile} title="Herramientas">
      <Section label="Computadora">
        {tsLoading ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <Skeleton height={56} />
            <Skeleton height={56} />
          </div>
        ) : tsError ? (
          <div className="empty">
            <p className="error-text">{tsError}</p>
            <button className="btn" onClick={() => void loadToolsets(profile)}>
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
                  checked={cuEnabled}
                  onChange={on => void setToolset(profile, 'computer_use', on)}
                  label="Control del computador"
                />
              }
            />
            <Row
              icon="monitor"
              title="Navegador"
              trailing={
                <Toggle
                  checked={browserEnabled}
                  onChange={on => void setToolset(profile, 'browser', on)}
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
            <button className="btn" onClick={() => void loadComputerUse(profile)}>
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

      {togglesReady && (
        <Section>
          <Row
            icon="grid"
            tint="accent"
            title="Aplicar estas herramientas a todos mis bots"
            subtitle="Control del computador y navegador, con el estado actual"
            chevron
            onClick={() => setApplyOpen(true)}
          />
        </Section>
      )}

      <Section label="Tarea en curso">
        {sessionsBusy ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <Skeleton height={56} />
          </div>
        ) : sessionsFail ? (
          <div className="empty">
            <p className="error-text">{sessionsFail}</p>
            <button className="btn" onClick={() => void loadActiveSessions(profile)}>
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

      <ApplyToAllSheet
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Aplicar estas herramientas a todos mis bots"
        itemLabel="el estado de las herramientas"
        exclude={profile}
        checkConfigured={async name => {
          const rows = await getToolsets(name)
          const cu = rows.find(r => r.name === 'computer_use')
          const browser = rows.find(r => r.name === 'browser')
          return cu?.enabled === cuEnabled && browser?.enabled === browserEnabled
        }}
        applyOne={async name => {
          await toggleToolset('computer_use', cuEnabled, name)
          await toggleToolset('browser', browserEnabled, name)
        }}
      />

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
          void stopSession(profile, id)
        }}
      />
    </BotScopedScreen>
  )
}
