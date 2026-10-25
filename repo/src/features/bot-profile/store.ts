import { atom } from 'nanostores'
import { apiFetch } from '../../lib/api'
import type { ProfileRow } from '../../lib/hermes/rpc-types'
import type { BotMeta } from '../../ui/avatar/appearance'

/** The `hermes-bots` ui_meta fields this feature reads/writes. The render-only
 *  `BotMeta` in ui/avatar doesn't carry `title`; the desktop's does
 *  (apps/desktop/src/plugins/hermes-bots/types.ts). */
export interface ProfileBotMeta extends BotMeta {
  title?: string
}

/**
 * Live stats for the bot profile screen, one REST read each:
 *   - workers:  `GET /api/plugins/kanban/workers/active?profile=` (plugin missing → null)
 *   - routines: enabled cron jobs (`GET /api/cron/jobs?profile=`) + enabled
 *     webhook subscriptions (`GET /api/webhooks?profile=`)
 * The Computadora row is served by `display.status` (features/computer/store).
 */

export const workersCount = atom<null | number>(null)
export const routinesCount = atom<null | number>(null)
export const profileStatsLoading = atom<boolean>(false)

interface KanbanWorker {
  profile?: string
}
interface KanbanWorkersResult {
  count?: number
  workers?: KanbanWorker[]
}
interface CronJob {
  enabled?: boolean
  id?: string
}
interface WebhookRoute {
  enabled?: boolean
  name?: string
}
interface WebhooksResult {
  enabled?: boolean
  subscriptions?: WebhookRoute[]
}

async function loadWorkers(name: string): Promise<void> {
  try {
    const res = await apiFetch<KanbanWorkersResult>(
      `/api/plugins/kanban/workers/active?profile=${encodeURIComponent(name)}`,
    )
    const rows = Array.isArray(res.workers) ? res.workers : []
    // The `?profile=` scope answers this profile's board; count only rows the
    // server tagged for it (belt and suspenders against cross-profile rows).
    const mine = rows.filter(w => !w.profile || w.profile === name).length
    workersCount.set(rows.length > 0 ? mine : Math.max(0, Number(res.count ?? 0)))
  } catch {
    // plugin missing / unreachable — the row shows "—"
    workersCount.set(null)
  }
}

async function loadRoutines(name: string): Promise<void> {
  const q = encodeURIComponent(name)
  const [cron, webhooks] = await Promise.allSettled([
    apiFetch<CronJob[]>(`/api/cron/jobs?profile=${q}`),
    apiFetch<WebhooksResult>(`/api/webhooks?profile=${q}`),
  ])

  let count = 0
  let answered = false

  if (cron.status === 'fulfilled') {
    answered = true
    count += (Array.isArray(cron.value) ? cron.value : []).filter(j => j.enabled !== false).length
  }

  if (webhooks.status === 'fulfilled') {
    answered = true
    count += (webhooks.value?.subscriptions ?? []).filter(s => s.enabled !== false).length
  }

  routinesCount.set(answered ? count : null)
}

export async function loadProfileStats(name: string): Promise<void> {
  profileStatsLoading.set(true)
  try {
    await Promise.all([loadWorkers(name), loadRoutines(name)])
  } finally {
    profileStatsLoading.set(false)
  }
}

/** The `ui_meta['hermes-bots']` record of a profiles.list row, if present. */
export function profileBotMeta(row: ProfileRow | undefined): ProfileBotMeta | null {
  const raw = row?.ui_meta?.['hermes-bots']
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as ProfileBotMeta) : null
}

/** The name a profile row shows: Bot Mode title → core display name → slug. */
export function botDisplayName(row: ProfileRow | undefined, fallback: string): string {
  const meta = profileBotMeta(row)
  return meta?.title?.trim() || row?.display_name?.trim() || fallback
}
