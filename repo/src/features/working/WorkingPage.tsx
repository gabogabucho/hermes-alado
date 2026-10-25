import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { useBack } from '../../app/transition'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/Icon'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import { loadActiveWorkers, workers, workersAbsent, workersCount, workersError, workersLoading } from './store'

const REFRESH_MS = 10_000

function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`
  return `${s} s`
}

function useNow(tick: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!tick) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [tick])
  return now
}

export function WorkingPage() {
  const { profile = 'default' } = useParams()
  const back = useBack('/')
  const list = useStore(workers)
  const count = useStore(workersCount)
  const loading = useStore(workersLoading)
  const error = useStore(workersError)
  const absent = useStore(workersAbsent)
  const now = useNow(list.length > 0)

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null

    function poll() {
      void loadActiveWorkers(profile)
    }

    function onVisibility() {
      if (document.hidden) {
        if (id) {
          clearInterval(id)
          id = null
        }
      } else {
        poll()
        if (!id) id = setInterval(poll, REFRESH_MS)
      }
    }

    poll()
    id = setInterval(poll, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (id) clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [profile])

  return (
    <PageShell title="Programando" onBack={back}>
      {loading && list.length === 0 && (
        <div className="list">
          {[0, 1].map(i => (
            <span key={i} className="card">
              <Skeleton height={64} />
            </span>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="empty">
          <p className="error-text">{error}</p>
        </div>
      )}

      {!loading && absent && (
        <EmptyState
          icon={<Icon name="monitor" size={30} />}
          title="Nada en curso"
          text="El plugin de kanban no está disponible en este backend."
        />
      )}

      {!loading && !error && !absent && list.length === 0 && (
        <EmptyState
          icon={<Icon name="monitor" size={30} />}
          title="Nada en curso"
          text="Cuando un bot arranque una tarea, aparece acá."
        />
      )}

      {list.length > 0 && (
        <Section label={`${loading ? '…' : count} trabajando`}>
          {list.map(worker => {
            const elapsed = Math.max(0, (now - worker.started_at * 1000) / 1000)
            return (
              <Row
                key={worker.run_id}
                icon="bolt"
                tint="accent"
                title={worker.task_title || worker.task_id}
                subtitle={worker.task_assignee || worker.profile || 'sin bot asignado'}
                value={formatElapsed(elapsed)}
              />
            )
          })}
        </Section>
      )}
    </PageShell>
  )
}
