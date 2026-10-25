/**
 * Pure resolution of a parsed export into a creation plan: slugifies bot
 * names to valid Hermes profile ids (lowercase `[a-z0-9_-]`, ≤ 64 chars —
 * hermes_cli/profiles.py `validate_profile_name`), flags conflicts against
 * existing profiles, and resolves group members / routine bots through the
 * name map. No I/O: unit-tested in plan.test.ts.
 */

import type { ParsedBot, ParsedGroup, ParsedRoutine } from './parse'
import type { SpanishSchedule } from './spanish-schedule'
import { spanishSchedule } from './spanish-schedule'

export interface ExistingProfile {
  name: string
  displayName: string
}

export interface PlannedBot {
  originalName: string
  /** Final slug to create — null when the user reuses an existing profile. */
  slug: string | null
  /** Existing profile name the user chose to reuse ('' otherwise). */
  useExisting: string
  soul: string
  conflict: boolean
}

export interface PlannedGroup {
  name: string
  /** Original member names as written in the export. */
  members: string[]
}

export interface PlannedRoutine {
  name: string
  bot: string
  when: string
  prompt: string
  /** What we POST as the cron `schedule` (converted or the original text). */
  scheduleText: string
  schedule: SpanishSchedule
}

export interface ImportPlan {
  bots: PlannedBot[]
  groups: PlannedGroup[]
  routines: PlannedRoutine[]
  /** Lowercase original name → resolved profile name (existing or new slug). */
  nameMap: Map<string, string>
}

/** `'Panchó Bot'` → `'pancho-bot'` (Hermes profile id rules). */
export function profileSlug(name: string): string {
  const candidate = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return /^[a-z0-9]/.test(candidate) ? candidate : 'bot'
}

/** First free `base-N` slug not in `taken`. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  let candidate = base
  let n = 2
  while (taken.has(candidate)) {
    candidate = `${base}-${n}`
    n += 1
  }
  return candidate
}

/** The existing profile a name refers to, matched by slug or display name. */
export function existingByName(
  name: string,
  existing: ExistingProfile[],
): ExistingProfile | null {
  const slug = profileSlug(name)
  const bySlug = existing.find(p => p.name.toLowerCase() === slug)
  if (bySlug) return bySlug
  const byDisplay = existing.find(
    p => p.displayName.toLowerCase() === name.trim().toLowerCase(),
  )
  return byDisplay ?? null
}

/**
 * Build the plan for a parsed export. Conflicts (bot name already exists) get
 * `conflict: true` and default to `useExisting` — the UI flips them to "Crear
 * como X 2" via `uniqueSlug`.
 */
export function buildImportPlan(
  parsed: { bots: ParsedBot[]; groups: ParsedGroup[]; routines: ParsedRoutine[] },
  existing: ExistingProfile[],
): ImportPlan {
  const taken = new Set(existing.map(p => p.name.toLowerCase()))

  const bots: PlannedBot[] = parsed.bots.map(bot => {
    const slug = profileSlug(bot.name)
    const hit = existingByName(bot.name, existing)
    if (hit) {
      return {
        originalName: bot.name,
        slug: null,
        useExisting: hit.name,
        soul: bot.soul,
        conflict: true,
      }
    }
    const finalSlug = uniqueSlug(slug, taken)
    taken.add(finalSlug)
    return {
      originalName: bot.name,
      slug: finalSlug,
      useExisting: '',
      soul: bot.soul,
      conflict: false,
    }
  })

  // Original name (lowercased) → the profile it resolves to: an existing
  // profile the export references, the planned slug, or the slugified name.
  const nameMap = new Map<string, string>()
  for (const profile of existing) {
    nameMap.set(profile.name.toLowerCase(), profile.name)
  }
  for (const bot of bots) {
    if (bot.slug) nameMap.set(bot.originalName.trim().toLowerCase(), bot.slug)
    else nameMap.set(bot.originalName.trim().toLowerCase(), bot.useExisting)
  }

  const groups: PlannedGroup[] = parsed.groups.map(group => ({
    name: group.name,
    members: group.members,
  }))

  const routines: PlannedRoutine[] = parsed.routines.map(routine => {
    const schedule = spanishSchedule(routine.when)
    return {
      name: routine.name,
      bot: routine.bot,
      when: routine.when,
      prompt: routine.prompt,
      scheduleText: schedule.schedule ?? routine.when,
      schedule,
    }
  })

  return { bots, groups, routines, nameMap }
}

/** Resolve an original bot name to a profile name (best effort). */
export function resolveBotProfile(name: string, plan: ImportPlan): string {
  const key = name.trim().toLowerCase()
  const mapped = plan.nameMap.get(key)
  if (mapped) return mapped
  return profileSlug(name)
}
