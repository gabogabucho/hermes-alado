import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { useBack, useSlideNavigate } from '../../app/transition'
import { deleteProfile } from '../../lib/hermes/profile-delete'
import { Avatar } from '../../ui/Avatar'
import { DangerConfirmSheet } from '../../ui/DangerConfirmSheet'
import { EmptyState } from '../../ui/EmptyState'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Sheet } from '../../ui/Sheet'
import { Skeleton } from '../../ui/Skeleton'
import { StatusDot, type DotTone } from '../../ui/StatusDot'
import { Toggle } from '../../ui/Toggle'
import { ensureAppearances, useBotAppearance } from '../bots/appearance-store'
import { computerDetail, computerRowStatus, loadComputer } from '../computer/store'
import {
  activeProfile,
  featuredBotName,
  homeLoading,
  homeProfiles,
  loadHome,
  setFeaturedBot,
} from '../home/store'
import {
  botDisplayName,
  loadProfileStats,
  profileStatsLoading,
  routinesCount,
  workersCount,
} from './store'
import './bot-profile.css'

/**
 * Bot profile (GrokBot screen 6): halo hero + Editar, and one grouped
 * section of icon-tile rows — Programando, Rutinas, Biblioteca, Computadora
 * (live `display.status` dot) and the Notificaciones toggle — plus the
 * bottom "Eliminar bot" danger row.
 */
export function BotProfilePage() {
  const { profile = 'default' } = useParams()
  const back = useBack('/')
  const { forward, navigate } = useSlideNavigate()
  const rows = useStore(homeProfiles)
  const rosterLoading = useStore(homeLoading)
  const statsLoading = useStore(profileStatsLoading)
  const workers = useStore(workersCount)
  const routines = useStore(routinesCount)
  const computer = useStore(computerDetail)
  const active = useStore(activeProfile)
  const appearance = useBotAppearance(profile)
  const [notifOpen, setNotifOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    ensureAppearances()
    void loadProfileStats(profile)
    void loadComputer(profile)
  }, [profile])

  const row = rows.find(r => r.name === profile)
  const displayName = botDisplayName(row, profile)
  const model = row?.model ?? null
  const description = row?.description ?? ''

  const workersLabel = workers === null ? '—' : `${workers} trabajando`
  const routinesLabel = routines === null ? '—' : `${routines} activadas`
  const computerState = computerRowStatus(computer)
  const computerTone: DotTone = computerState === 'active' ? 'ok' : computerState === 'not-installed' ? 'warn' : 'neutral'
  const computerLabel =
    computerState === 'active' ? 'Activo' : computerState === 'inactive' ? 'Inactivo' : computerState === 'not-installed' ? 'Sin instalar' : '—'

  const isDefault = Boolean(row?.is_default)
  const isActive = active === profile
  const deleteBlocked = isDefault || isActive
  const deleteSubtitle = isDefault
    ? 'El bot principal no se puede eliminar: Hermes siempre necesita uno.'
    : isActive
      ? 'Es el bot activo del servidor. Cambiá el perfil activo antes de eliminarlo.'
      : 'Se borran sus chats, rutinas y archivos'

  const enc = encodeURIComponent(profile)

  const doDelete = async (): Promise<void> => {
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteProfile(profile)
      // A settlement-pending answer still means the directory is gone: success.
      if (featuredBotName() === profile) setFeaturedBot(null)
      setDeleteOpen(false)
      await loadHome()
      navigate('/', { replace: true })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'No se pudo eliminar el bot')
    } finally {
      setDeleting(false)
    }
  }

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
              onClick={() => forward(`/bots/${enc}/computer`)}
            />
            <Row
              icon="bell"
              tint="accent"
              title="Notificaciones"
              subtitle="Cuando este bot termine o te esté esperando"
              trailing={<Toggle checked={false} onChange={() => setNotifOpen(true)} label="Notificaciones" />}
            />
          </Section>

          <Section footer="Eliminar borra todo lo de este bot del servidor. No se puede deshacer.">
            <Row
              icon="trash"
              tint="danger"
              title="Eliminar bot"
              subtitle={deleteSubtitle}
              disabled={deleteBlocked}
              onClick={() => setDeleteOpen(true)}
            />
          </Section>
        </>
      )}

      <Sheet open={notifOpen} onClose={() => setNotifOpen(false)} title="Notificaciones">
        <p className="muted">
          Hermes todavía no tiene Web Push. Cuando esta opción esté lista, va a avisarte por
          ntfy o por Telegram (a decidir). Por ahora no guarda nada.
        </p>
      </Sheet>

      {deleteOpen && (
        <DangerConfirmSheet
          onClose={() => setDeleteOpen(false)}
          title="Eliminar bot"
          nameToType={profile}
          body={
            <>
              Se van a borrar los chats, rutinas y archivos de <b>{displayName}</b>. No se puede
              deshacer.
            </>
          }
          confirmLabel="Eliminar bot"
          busy={deleting}
          error={deleteError}
          onConfirm={() => void doDelete()}
        />
      )}
    </PageShell>
  )
}
