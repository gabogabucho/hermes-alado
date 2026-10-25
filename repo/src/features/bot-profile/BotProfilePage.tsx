import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { useBack, useSlideNavigate } from '../../app/transition'
import { Avatar } from '../../ui/Avatar'
import { EmptyState } from '../../ui/EmptyState'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Sheet } from '../../ui/Sheet'
import { Skeleton } from '../../ui/Skeleton'
import { StatusDot, type DotTone } from '../../ui/StatusDot'
import { Toggle } from '../../ui/Toggle'
import { ensureAppearances, useBotAppearance } from '../bots/appearance-store'
import { homeLoading, homeProfiles } from '../home/store'
import { loadPrefs, pushPrefs, pushSetup, savePrefsForProfile, defaultPrefs } from '../push/store'
import {
  botDisplayName,
  computerStatus,
  loadProfileStats,
  profileStatsLoading,
  routinesCount,
  workersCount,
} from './store'
import './bot-profile.css'

/**
 * Bot profile (GrokBot screen 6): halo hero + Editar, and one grouped
 * section of icon-tile rows — Programando, Rutinas, Biblioteca, Computadora
 * (status dot) and the Notificaciones toggle.
 */
export function BotProfilePage() {
  const { profile = 'default' } = useParams()
  const back = useBack('/')
  const { forward } = useSlideNavigate()
  const rows = useStore(homeProfiles)
  const rosterLoading = useStore(homeLoading)
  const statsLoading = useStore(profileStatsLoading)
  const workers = useStore(workersCount)
  const routines = useStore(routinesCount)
  const computer = useStore(computerStatus)
  const appearance = useBotAppearance(profile)
  const [notifOpen, setNotifOpen] = useState(false)
  const allPrefs = useStore(pushPrefs)
  const prefs = { ...defaultPrefs(), ...(allPrefs[profile] ?? {}) }
  const deviceSetup = useStore(pushSetup)

  useEffect(() => {
    ensureAppearances()
    void loadProfileStats(profile)
  }, [profile])

  useEffect(() => {
    if (notifOpen) void loadPrefs()
  }, [notifOpen])

  const row = rows.find(r => r.name === profile)
  const displayName = botDisplayName(row, profile)
  const model = row?.model ?? null
  const description = row?.description ?? ''

  const workersLabel = workers === null ? '—' : `${workers} trabajando`
  const routinesLabel = routines === null ? '—' : `${routines} activadas`
  const computerTone: DotTone = computer === 'active' ? 'ok' : 'neutral'
  const computerLabel = computer === 'active' ? 'Activo' : computer === 'inactive' ? 'Inactivo' : '—'

  const enc = encodeURIComponent(profile)

  return (
    <PageShell title={displayName} onBack={back}>
      {rosterLoading && !row ? (
        <div className="bp-hero">
          <Skeleton variant="circle" width={112} height={112} />
          <Skeleton width={180} />
          <Skeleton width={240} />
        </div>
      ) : !row ? (
        <EmptyState title="No se encontró este bot" />
      ) : (
        <>
          <div className="bp-hero">
            <Avatar name={profile} size="xl" appearance={appearance} />
            <span className="bp-name">{displayName}</span>
            <span className="bp-sub">{model || description || 'Bot'}</span>
            <button
              type="button"
              className="btn btn-tonal bp-edit"
              onClick={() => forward(`/bots/${enc}/edit`)}
            >
              Editar
            </button>
          </div>

          <Section>
            {statsLoading ? (
              <div style={{ padding: 'var(--space-4)' }}>
                <Skeleton height={52} />
                <Skeleton height={52} />
              </div>
            ) : (
              <>
                <Row
                  icon="bolt"
                  tint="accent"
                  title="Programando"
                  value={workersLabel}
                  chevron
                  onClick={() => forward(`/bots/${enc}/working`)}
                />
                <Row
                  icon="calendar"
                  tint="accent"
                  title="Rutinas"
                  value={routinesLabel}
                  chevron
                  onClick={() => forward(`/bots/${enc}/routines`)}
                />
              </>
            )}
            <Row
              icon="folder"
              tint="accent"
              title="Biblioteca"
              chevron
              onClick={() => forward(`/bots/${enc}/library`)}
            />
            <Row
              icon="monitor"
              tint="accent"
              title="Computadora"
              subtitle={<StatusDot tone={computerTone} label={computerLabel} />}
              chevron
              onClick={() => forward('/settings/control')}
            />
            <Row
              icon="bell"
              tint="accent"
              title="Notificaciones"
              subtitle="Cuando este bot termine o te esté esperando"
              trailing={<Toggle checked={prefs.termina} onChange={() => setNotifOpen(true)} label="Notificaciones" />}
            />
          </Section>
        </>
      )}

      <Sheet open={notifOpen} onClose={() => setNotifOpen(false)} title="Notificaciones">
        {deviceSetup?.state === 'no-plugin' ? (
          <p className="muted">
            Las notificaciones requieren el complemento del servidor (droidbot-push en Hermes). Tu
            arquitecto puede instalarlo con el preparer.
          </p>
        ) : (
          <>
            <Row
              icon="check"
              tint="accent"
              title="Cuando termine"
              subtitle="Aviso cuando este bot termina un turno"
              trailing={
                <Toggle
                  checked={prefs.termina}
                  onChange={next => void savePrefsForProfile(profile, { termina: next }).catch(() => undefined)}
                  label="Cuando termine"
                />
              }
            />
            <Row
              icon="bolt"
              tint="accent"
              title="Cuando te necesite"
              subtitle="Aprobaciones, preguntas o grupos que te esperan"
              trailing={
                <Toggle
                  checked={prefs.necesita}
                  onChange={next => void savePrefsForProfile(profile, { necesita: next }).catch(() => undefined)}
                  label="Cuando te necesite"
                />
              }
            />
            <p className="faint" style={{ padding: '0 var(--space-4) var(--space-4)' }}>
              Activá el master switch en Ajustes → Notificaciones para recibir avisos en este
              dispositivo.
            </p>
          </>
        )}
      </Sheet>
    </PageShell>
  )
}
