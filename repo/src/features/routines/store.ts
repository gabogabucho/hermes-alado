import { atom } from 'nanostores'
import { apiFetch } from '../../lib/api'
import type { Blueprint, CronJob, CronRun, WebhookRoute, WebhooksResponse } from './types'

export const jobs = atom<CronJob[]>([])
export const webhooks = atom<WebhookRoute[]>([])
export const webhooksEnabled = atom<boolean>(false)
export const routinesLoading = atom<boolean>(false)
export const routinesError = atom<string>('')

export const blueprints = atom<Blueprint[]>([])
export const blueprintsLoading = atom<boolean>(false)
export const blueprintsError = atom<string>('')

export const detailJob = atom<CronJob | null>(null)
export const detailRuns = atom<CronRun[]>([])
export const detailLoading = atom<boolean>(false)
export const detailError = atom<string>('')

function profileQuery(profile: string): string {
  return `?profile=${encodeURIComponent(profile)}`
}

export async function loadRoutines(profile: string): Promise<void> {
  routinesLoading.set(true)
  routinesError.set('')
  try {
    const [jobsRes, webhooksRes] = await Promise.all([
      apiFetch<CronJob[]>(`/api/cron/jobs${profileQuery(profile)}`),
      apiFetch<WebhooksResponse>(`/api/webhooks${profileQuery(profile)}`),
    ])
    jobs.set(Array.isArray(jobsRes) ? jobsRes : [])
    webhooks.set(webhooksRes.subscriptions ?? [])
    webhooksEnabled.set(Boolean(webhooksRes.enabled))
  } catch (e) {
    routinesError.set(e instanceof Error ? e.message : 'No se pudieron cargar las rutinas')
  } finally {
    routinesLoading.set(false)
  }
}

export async function setJobPaused(profile: string, job: CronJob, paused: boolean): Promise<void> {
  const verb = paused ? 'pause' : 'resume'
  const updated = await apiFetch<CronJob>(
    `/api/cron/jobs/${encodeURIComponent(job.id)}/${verb}${profileQuery(profile)}`,
    { method: 'POST' },
  )
  jobs.set(jobs.get().map(j => (j.id === job.id ? { ...j, ...updated } : j)))
}

export async function setWebhookEnabled(
  profile: string,
  name: string,
  enabled: boolean,
): Promise<void> {
  const res = await apiFetch<{ ok: boolean; name: string; enabled: boolean }>(
    `/api/webhooks/${encodeURIComponent(name)}/enabled${profileQuery(profile)}`,
    { method: 'PUT', body: JSON.stringify({ enabled }) },
  )
  webhooks.set(webhooks.get().map(w => (w.name === res.name ? { ...w, enabled: res.enabled } : w)))
}

export async function triggerJob(profile: string, id: string): Promise<CronJob> {
  const updated = await apiFetch<CronJob>(
    `/api/cron/jobs/${encodeURIComponent(id)}/trigger${profileQuery(profile)}`,
    { method: 'POST' },
  )
  jobs.set(jobs.get().map(j => (j.id === id ? { ...j, ...updated } : j)))
  return updated
}

export async function deleteJob(profile: string, id: string): Promise<void> {
  await apiFetch(`/api/cron/jobs/${encodeURIComponent(id)}${profileQuery(profile)}`, {
    method: 'DELETE',
  })
  jobs.set(jobs.get().filter(j => j.id !== id))
}

export async function loadBlueprints(profile: string): Promise<void> {
  blueprintsLoading.set(true)
  blueprintsError.set('')
  try {
    const res = await apiFetch<{ blueprints: Blueprint[] }>(
      `/api/cron/blueprints${profileQuery(profile)}`,
    )
    blueprints.set(res.blueprints ?? [])
  } catch (e) {
    blueprintsError.set(e instanceof Error ? e.message : 'No se pudieron cargar las plantillas')
  } finally {
    blueprintsLoading.set(false)
  }
}

export async function instantiateBlueprint(
  profile: string,
  key: string,
  values: Record<string, string>,
): Promise<CronJob> {
  return apiFetch<CronJob>(
    `/api/cron/blueprints/instantiate${profileQuery(profile)}`,
    { method: 'POST', body: JSON.stringify({ blueprint: key, values }) },
  )
}

export async function loadJobDetail(profile: string, id: string): Promise<void> {
  detailLoading.set(true)
  detailError.set('')
  try {
    const [job, runs] = await Promise.all([
      apiFetch<CronJob>(`/api/cron/jobs/${encodeURIComponent(id)}${profileQuery(profile)}`),
      apiFetch<{ runs: CronRun[] }>(
        `/api/cron/jobs/${encodeURIComponent(id)}/runs${profileQuery(profile)}&limit=20`,
      ),
    ])
    detailJob.set(job)
    detailRuns.set(runs.runs ?? [])
  } catch (e) {
    detailError.set(e instanceof Error ? e.message : 'No se pudo cargar la rutina')
  } finally {
    detailLoading.set(false)
  }
}

export function resetDetail(): void {
  detailJob.set(null)
  detailRuns.set([])
  detailError.set('')
}
