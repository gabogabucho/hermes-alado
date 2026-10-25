import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { useSlideNavigate } from '../../app/transition'
import { Avatar } from '../../ui/Avatar'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { ListRow } from '../../ui/ListRow'
import { Sheet } from '../../ui/Sheet'
import { Skeleton } from '../../ui/Skeleton'
import { Toggle } from '../../ui/Toggle'
import { ensureAppearances, useBotAppearance } from '../bots/appearance-store'
import { homeLoading, homeProfiles } from '../home/store'
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
 * Bot profile (GrokBot screen 6): big avatar + name + model/description, the
 * Editar button, and the rows: Programando, Rutinas, Biblioteca, Computadora
 * and the Notificaciones toggle.
 */
export function BotProfilePage() {
  const { profile = 'default' } = useParams()
  const { back, forward } = useSlideNavigate()
  const rows = useStore(homeProfiles)
  const rosterLoading = useStore(homeLoading)
  const statsLoading = useStore(profileStatsLoading)
  const workers = useStore(workersCount)
  const routines = useStore(routinesCount)
  const computer = useStore(computerStatus)
  const appearance = useBotAppearance(profile)
  const [notifOpen, setNotifOpen] = useState(false)

  useEffect(() => {
    ensureAppearances()
    void loadProfileStats(profile)
  }, [profile])

  const row = rows.find(r => r.name === profile)
  const displayName = botDisplayName(row, profile)
  const model = row?.model ?? null
  const description = row?.description ?? ''

  const workersLabel = workers === null ? '—' : `${workers} trabajando`
  const routinesLabel = routines === null ? '—' : `${routines} activadas`
  const computerLabel = computer === 'active' ? 'Activo' : computer === 'inactive' ? 'Inactivo' : '—'

  const enc = encodeURIComponent(profile)

  return (
    <div className="bp-page">
      <header className="page-header glass">
        <IconButton icon="back" variant="ghost" label="Volver" onClick={back} />
        <h1 className="page-header-title">{displayName}</h1>
      </header>

      {rosterLoading && !row ? (
        <div className="bp-hero">
          <Skeleton variant="circle" width={112} height={112} />
          <Skeleton width={180} />
          <Skeleton width={240} />
        </div>
      ) : !row ? (
        <div className="empty">
          <p className="muted">No se encontró este bot.</p>
        </div>
      ) : (
        <>
          <div className="bp-hero">
            <Avatar name={profile} size="xl" ring appearance={appearance} />
            <span className="bp-name">{displayName}</span>
            <span className="bp-sub">{model || description || 'Bot'}</span>
            <button
              type="button"
              className="btn bp-edit"
              onClick={() => forward(`/bots/${enc}/edit`)}
            >
              Editar
            </button>
          </div>

          <div className="list">
            {statsLoading ? (
              <>
                <Skeleton width="100%" height={56} />
                <Skeleton width="100%" height={56} />
              </>
            ) : (
              <>
                <ListRow
                  leading={<Icon name="bolt" />}
                  title="Programando"
                  subtitle={workersLabel}
                  trailing={<Icon name="chevron-right" />}
                  onClick={() => forward(`/bots/${enc}/working`)}
                />
                <ListRow
                  leading={<Icon name="calendar" />}
                  title="Rutinas"
                  subtitle={routinesLabel}
                  trailing={<Icon name="chevron-right" />}
                  onClick={() => forward(`/bots/${enc}/routines`)}
                />
              </>
            )}
            <ListRow
              leading={<Icon name="folder" />}
              title="Biblioteca"
              trailing={<Icon name="chevron-right" />}
              onClick={() => forward(`/bots/${enc}/library`)}
            />
            <ListRow
              leading={<Icon name="monitor" />}
              title="Computadora"
              subtitle={computerLabel}
              trailing={<Icon name="chevron-right" />}
              onClick={() => forward('/settings/control')}
            />
            <ListRow
              leading={<Icon name="bell" />}
              title="Notificaciones"
              subtitle="Cuando este bot termine o te esté esperando"
              trailing={<Toggle checked={false} onChange={() => setNotifOpen(true)} label="Notificaciones" />}
            />
          </div>
        </>
      )}

      <Sheet open={notifOpen} onClose={() => setNotifOpen(false)} title="Notificaciones">
        <p className="muted">
          Hermes todavía no tiene Web Push. Cuando esta opción esté lista, va a avisarte por
          ntfy o por Telegram (a decidir). Por ahora no guarda nada.
        </p>
      </Sheet>
    </div>
  )
}
