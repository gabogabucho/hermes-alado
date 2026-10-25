import { atom } from 'nanostores'
import { apiFetch } from '../../lib/api'
import type { ImportPlan } from '../../lib/import/plan'
import { resolveBotProfile } from '../../lib/import/plan'
import { groupEngine } from '../../lib/hermes/groups'
import { createProfile } from '../bots/store'
import { loadHome } from '../home/store'
import { ensureGroupsCapability } from '../groups/store'

/**
 * The step-4 creation engine: sequential, one progress item per entity, each
 * failure captured instead of aborting. Bots → SOULs → routines → groups.
 *
 * Contract (Hermes @ bf0203a):
 * - bot:        POST /api/profiles {name, clone_from}            (web_routers/profiles.py:812)
 * - soul:       PUT  /api/profiles/{name}/soul {content}         (web_routers/profiles.py:1015)
 * - routine:    POST /api/cron/jobs?profile={bot} {name, schedule, prompt, deliver}
 *               (web_routers/cron.py:716 → cron/jobs.py parse_schedule)
 * - group:      groups.create over /api/ws (groups.create JSON-RPC)
 */

export interface ImportItem {
  id: string
  label: string
  state: 'pending' | 'running' | 'done' | 'failed'
  error: string
}

export interface ImportSummary {
  bots: number
  routines: number
  groups: number
  failed: number
  failures: string[]
}

export const importItems = atom<ImportItem[]>([])
export const importRunning = atom<boolean>(false)
export const importSummary = atom<ImportSummary | null>(null)

let itemId = 0

function nextId(): string {
  itemId += 1
  return `item-${itemId}`
}

function patchItem(id: string, patch: Partial<ImportItem>): void {
  importItems.set(importItems.get().map(item => (item.id === id ? { ...item, ...patch } : item)))
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'No se pudo crear'
}

/**
 * Create everything in the plan, sequentially. `cloneFrom` seeds new bots with
 * a working model + credentials (the featured bot, else "default").
 */
export async function runImport(plan: ImportPlan, cloneFrom: string): Promise<ImportSummary> {
  importRunning.set(true)
  importSummary.set(null)
  itemId = 0

  const items: ImportItem[] = []
  const addItem = (label: string): string => {
    const id = nextId()
    items.push({ id, label, state: 'pending', error: '' })
    return id
  }
  importItems.set(items)

  const summary: ImportSummary = { bots: 0, routines: 0, groups: 0, failed: 0, failures: [] }
  const fail = (id: string, e: unknown) => {
    const text = errText(e)
    patchItem(id, { state: 'failed', error: text })
    summary.failed += 1
    summary.failures.push(text)
  }

  const createdSlugs = new Set<string>()

  // 1. Bots
  const toCreate = plan.bots.filter(bot => bot.slug !== null)
  for (const bot of toCreate) {
    const id = addItem(`Bot ${bot.originalName}`)
    patchItem(id, { state: 'running' })
    try {
      await createProfile(bot.slug as string, { cloneFrom })
      createdSlugs.add((bot.slug as string).toLowerCase())
      patchItem(id, { state: 'done' })
      summary.bots += 1
    } catch (e) {
      fail(id, e)
    }
  }

  // 2. SOULs (only for bots we just created — never overwrite a reused one)
  for (const bot of toCreate) {
    if (!bot.soul.trim() || !bot.slug || !createdSlugs.has(bot.slug.toLowerCase())) continue
    const id = addItem(`Personalidad de ${bot.originalName}`)
    patchItem(id, { state: 'running' })
    try {
      await apiFetch(`/api/profiles/${encodeURIComponent(bot.slug)}/soul`, {
        method: 'PUT',
        body: JSON.stringify({ content: bot.soul.trim() }),
      })
      patchItem(id, { state: 'done' })
    } catch (e) {
      fail(id, e)
    }
  }

  // 3. Routines
  for (const routine of plan.routines) {
    const bot = resolveBotProfile(routine.bot || 'default', plan)
    const id = addItem(`Rutina ${routine.name}`)
    patchItem(id, { state: 'running' })
    try {
      if (!routine.scheduleText.trim()) throw new Error('La rutina no tiene horario')
      await apiFetch(`/api/cron/jobs?profile=${encodeURIComponent(bot)}`, {
        method: 'POST',
        body: JSON.stringify({
          name: routine.name,
          schedule: routine.scheduleText,
          prompt: routine.prompt || routine.name,
          deliver: 'local',
        }),
      })
      patchItem(id, { state: 'done' })
      summary.routines += 1
    } catch (e) {
      fail(id, e)
    }
  }

  // 4. Groups
  if (plan.groups.length > 0) {
    const available = await ensureGroupsCapability().catch(() => null)
    if (available === false) {
      const id = addItem(`Grupos (${plan.groups.length})`)
      fail(id, new Error('El motor de grupos no está disponible en este Hermes'))
    } else {
      for (const group of plan.groups) {
        const id = addItem(`Grupo ${group.name}`)
        patchItem(id, { state: 'running' })
        try {
          const members = group.members.map(name => resolveBotProfile(name, plan))
          const unique = [...new Set(members.map(m => m.toLowerCase()))].length
          if (members.length < 2) throw new Error('Un grupo necesita al menos dos miembros')
          if (unique !== members.length) throw new Error('El grupo repite miembros')
          await groupEngine.create(group.name, members.map(profile => ({ profile })))
          patchItem(id, { state: 'done' })
          summary.groups += 1
        } catch (e) {
          fail(id, e)
        }
      }
    }
  }

  importRunning.set(false)
  importSummary.set(summary)
  await loadHome()
  return summary
}

export function resetImport(): void {
  importItems.set([])
  importSummary.set(null)
  importRunning.set(false)
}
