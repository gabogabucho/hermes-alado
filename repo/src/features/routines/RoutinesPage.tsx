import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { Skeleton } from '../../ui/Skeleton'
import { Toggle } from '../../ui/Toggle'
import { NewRoutineSheet } from './NewRoutineSheet'
import { scheduleText } from './format'
import {
  jobs,
  loadRoutines,
  routinesError,
  routinesLoading,
  setJobPaused,
  setWebhookEnabled,
  webhooks,
  webhooksEnabled,
} from './store'
import type { CronJob, WebhookRoute } from './types'
import './index.css'

export function RoutinesPage() {
  const { profile = 'default' } = useParams()
  const navigate = useNavigate()
  const jobList = useStore(jobs)
  const webhookList = useStore(webhooks)
  const webhookPlatform = useStore(webhooksEnabled)
  const loading = useStore(routinesLoading)
  const error = useStore(routinesError)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    void loadRoutines(profile)
  }, [profile])

  async function onToggleJob(job: CronJob, paused: boolean) {
    if (busyId) return
    setBusyId(`cron:${job.id}`)
    try {
      await setJobPaused(profile, job, paused)
    } catch {
      // keep the row as-is; the next refresh shows the real state
    } finally {
      setBusyId('')
    }
  }

  async function onToggleWebhook(webhook: WebhookRoute, enabled: boolean) {
    if (busyId) return
    setBusyId(`webhook:${webhook.name}`)
    try {
      await setWebhookEnabled(profile, webhook.name, enabled)
    } catch {
      // keep the row as-is
    } finally {
      setBusyId('')
    }
  }

  function isPausedJob(job: CronJob): boolean {
    return job.state === 'paused' || !job.enabled
  }

  return (
    <div>
      <div className="subpage-header">
        <IconButton icon="back" label="Volver" onClick={() => navigate(-1)} />
        <span className="subpage-title">Rutinas</span>
        <span className="spacer" />
        <IconButton icon="plus" label="Nueva rutina" onClick={() => setSheetOpen(true)} />
      </div>

      {loading && (
        <div className="list">
          {[0, 1, 2].map(i => (
            <span key={i} className="card">
              <Skeleton height={52} />
            </span>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="empty">
          <p className="error-text">{error}</p>
        </div>
      )}

      {!loading && !error && jobList.length === 0 && webhookList.length === 0 && (
        <div className="empty">
          <p className="muted">No hay rutinas todavía.</p>
          <p className="faint">Creá una desde una plantilla con el botón +.</p>
        </div>
      )}

      {jobList.length > 0 && (
        <>
          <h2 className="section-title">Rutinas</h2>
          <div className="list">
            {jobList.map(job => {
              const paused = isPausedJob(job)
              return (
                <button
                  key={job.id}
                  type="button"
                  className="routine-row"
                  onClick={() =>
                    navigate(`/bots/${encodeURIComponent(profile)}/routines/${encodeURIComponent(job.id)}`)
                  }
                >
                  <span className="routine-row-icon">
                    <Icon name="calendar" />
                  </span>
                  <span className="routine-row-body">
                    <span className="routine-row-title">{job.name || job.id}</span>
                    <span className={`routine-row-subtitle${paused ? ' paused' : ''}`}>
                      {scheduleText(job)}
                      {paused ? ' · Pausada' : ''}
                    </span>
                  </span>
                  <span className="routine-row-toggle" onClick={e => e.stopPropagation()}>
                    <Toggle
                      checked={!paused}
                      onChange={on => void onToggleJob(job, !on)}
                      label={`${paused ? 'Reanudar' : 'Pausar'} ${job.name || job.id}`}
                    />
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {webhookList.length > 0 && (
        <>
          <h2 className="section-title">Webhooks</h2>
          {!webhookPlatform && (
            <p className="faint">La recepción de webhooks está desactivada en el backend.</p>
          )}
          <div className="list">
            {webhookList.map(webhook => {
              const paused = !webhook.enabled
              return (
                <div key={webhook.name} className="routine-row routine-row--static">
                  <span className="routine-row-icon">
                    <Icon name="bolt" />
                  </span>
                  <span className="routine-row-body">
                    <span className="routine-row-title">{webhook.name}</span>
                    <span className={`routine-row-subtitle${paused ? ' paused' : ''}`}>
                      Cuando se activa un webhook
                      {paused ? ' · Pausada' : ''}
                    </span>
                  </span>
                  <span className="routine-row-toggle">
                    <Toggle
                      checked={webhook.enabled}
                      onChange={on => void onToggleWebhook(webhook, on)}
                      label={`${paused ? 'Activar' : 'Pausar'} ${webhook.name}`}
                    />
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {sheetOpen && (
        <NewRoutineSheet
          open={sheetOpen}
          profile={profile}
          onClose={() => setSheetOpen(false)}
          onCreated={() => {
            setSheetOpen(false)
            void loadRoutines(profile)
          }}
        />
      )}
    </div>
  )
}
