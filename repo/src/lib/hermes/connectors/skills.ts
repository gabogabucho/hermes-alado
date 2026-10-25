import { apiFetch } from '../../api'
import { scopedQuery } from './api'
import type { Connector } from './types'

export interface SkillInfo {
  name: string
  category?: string | null
  description?: string | null
  enabled: boolean
  usage?: number
  provenance?: 'hub' | 'bundled' | 'external' | 'agent' | string
}

export interface HubSkillMeta {
  name: string
  description: string
  source: string
  identifier: string
  trust_level: string | null
  repo: string | null
  tags: string[]
}

export interface OfficialSkill extends HubSkillMeta {
  category: string
  installed: boolean
}

export interface HubSources {
  sources: unknown[]
  index_available: boolean
  featured: HubSkillMeta[]
  installed: Record<string, HubSkillMeta>
}

export interface HubPreview {
  name: string
  description: string
  source: string
  identifier: string
  trust_level: string | null
  repo: string | null
  tags: string[]
  skill_md: string
  files: string[]
}

export interface SkillsData {
  skills: SkillInfo[]
  official: OfficialSkill[]
  featured: HubSkillMeta[]
}

export const HUB_ID_PREFIX = 'hub:'

export const isHubId = (id: string): boolean => id.startsWith(HUB_ID_PREFIX)

export const hubIdentifier = (id: string): string => id.slice(HUB_ID_PREFIX.length)

export function toggleSkill(
  name: string,
  enabled: boolean,
  profile?: string,
): Promise<{ ok: boolean; name: string; enabled: boolean }> {
  return apiFetch(`/api/skills/toggle${scopedQuery(profile)}`, {
    method: 'PUT',
    body: JSON.stringify({ name, enabled }),
  })
}

export function installSkill(
  identifier: string,
  profile?: string,
): Promise<{ ok: boolean; pid: number; name: string }> {
  return apiFetch(`/api/skills/hub/install${scopedQuery(profile)}`, {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  })
}

export function uninstallSkill(name: string, profile?: string): Promise<{ ok: boolean; pid: number; name: string }> {
  return apiFetch(`/api/skills/hub/uninstall${scopedQuery(profile)}`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function updateSkillHub(profile?: string): Promise<{ ok: boolean; pid: number; name: string }> {
  return apiFetch(`/api/skills/hub/update${scopedQuery(profile)}`, { method: 'POST' })
}

export function previewSkill(identifier: string): Promise<HubPreview> {
  return apiFetch(`/api/skills/hub/preview?identifier=${encodeURIComponent(identifier)}`)
}

/**
 * Installed skills plus the official hub list (for browsing/install) plus the
 * hub's curated `featured` picks. The hub reads are best-effort: a GitHub rate
 * limit must not hide the locally installed skills.
 */
export async function listSkills(profile?: string): Promise<{ connectors: Connector[]; data: SkillsData }> {
  const [skillsRes, officialRes, sourcesRes] = await Promise.allSettled([
    apiFetch<SkillInfo[]>(`/api/skills${scopedQuery(profile)}`),
    apiFetch<{ skills: OfficialSkill[] }>(`/api/skills/hub/official${scopedQuery(profile)}`),
    apiFetch<HubSources>(`/api/skills/hub/sources${scopedQuery(profile)}`),
  ])

  const skills = skillsRes.status === 'fulfilled' && Array.isArray(skillsRes.value) ? skillsRes.value : []
  const official = officialRes.status === 'fulfilled' ? (officialRes.value.skills ?? []) : []
  const sources = sourcesRes.status === 'fulfilled' ? sourcesRes.value : null
  const featured = sources?.featured ?? []

  const connectors: Connector[] = skills.map(s => ({
    id: s.name,
    family: 'skills',
    name: s.name,
    description: s.description ?? '',
    icon: null,
    category: s.category || null,
    status: s.enabled ? 'connected' : 'available',
    configurable: false,
    auth: 'none',
  }))

  const seen = new Set(skills.map(s => s.name))
  const pushHub = (meta: HubSkillMeta, category: string | null) => {
    if (seen.has(meta.identifier)) return
    seen.add(meta.identifier)
    connectors.push({
      id: HUB_ID_PREFIX + meta.identifier,
      family: 'skills',
      name: meta.name,
      description: meta.description ?? '',
      icon: null,
      category,
      status: 'available',
      configurable: false,
      auth: 'none',
    })
  }

  for (const meta of featured) pushHub(meta, null)
  for (const entry of official) if (!entry.installed) pushHub(entry, entry.category || null)

  return { connectors, data: { skills, official, featured } }
}
