import { atom } from 'nanostores'
import { apiFetch, ApiError } from '../../lib/api'

// Shape from plugins/kanban/dashboard/plugin_api.py `list_active_workers`
// (GET /api/plugins/kanban/workers/active).
export interface ActiveWorker {
  run_id: number
  task_id: string
  task_title: string
  task_status: string
  task_assignee: string | null
  profile: string | null
  worker_pid: number | null
  started_at: number
  claim_lock: string | null
  claim_expires: number | null
  last_heartbeat_at: number | null
  max_runtime_seconds: number | null
}

export interface ActiveWorkersResponse {
  workers: ActiveWorker[]
  count: number
  checked_at: number
}

export const workers = atom<ActiveWorker[]>([])
export const workersCount = atom<number>(0)
export const workersLoading = atom<boolean>(false)
export const workersError = atom<string>('')
/** True when the kanban plugin is not installed/enabled (backend 404s). */
export const workersAbsent = atom<boolean>(false)

export async function loadActiveWorkers(profile: string): Promise<void> {
  workersLoading.set(true)
  workersError.set('')
  workersAbsent.set(false)
  try {
    const res = await apiFetch<ActiveWorkersResponse>(
      `/api/plugins/kanban/workers/active?profile=${encodeURIComponent(profile)}`,
    )
    workers.set(res.workers ?? [])
    workersCount.set(res.count ?? 0)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      workersAbsent.set(true)
      workers.set([])
      workersCount.set(0)
    } else {
      workersError.set(e instanceof Error ? e.message : 'No se pudieron cargar los trabajos')
    }
  } finally {
    workersLoading.set(false)
  }
}
