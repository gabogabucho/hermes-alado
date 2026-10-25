import { scheduleToSpanish, type CronSchedule } from '../../lib/hermes/cron-spanish'
import type { CronJob } from './types'

const dateTime = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Human Spanish schedule for a list row; falls back to the backend's own
 *  display, then to the raw schedule text. */
export function scheduleText(job: CronJob): string {
  const spanish = scheduleToSpanish(job.schedule as CronSchedule)
  if (spanish) return spanish
  return job.schedule_display ?? 'Sin horario'
}

/** Epoch seconds (run rows) or ISO strings (job records) → local date/time. */
export function formatDateTime(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateTime.format(date)
}

export function formatRunTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return '—'
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`
  return `${s} s`
}
