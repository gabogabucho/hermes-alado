import { apiFetch } from '../../api'
import { scopedQuery } from './api'
import type { Connector, ConfigField } from './types'

export interface ToolsetInfo {
  name: string
  label: string
  description: string
  platform: string
  platform_label: string
  enabled: boolean
  available: boolean
  configured: boolean
  tools: string[]
}

export interface ToolsetEnvVar {
  key: string
  prompt: string
  url: string | null
  default: string | null
  is_set: boolean
}

export interface ToolsetProvider {
  name: string
  badge: string
  tag: string
  env_vars: ToolsetEnvVar[]
  post_setup: string | null
  requires_nous_auth: boolean
  managed_nous_feature: string | null
  is_active: boolean
  status: string
  web_backend?: string
  capabilities?: string[]
  tts_provider?: string
}

export interface ToolsetConfig {
  name: string
  has_category: boolean
  providers: ToolsetProvider[]
  active_provider: string | null
  active_search_backend?: string | null
  active_extract_backend?: string | null
  search_via_nous?: boolean
  extract_via_nous?: boolean
}

export interface ToolsetModel {
  id: string
  display: string
  speed: string
  strengths: string
  price: string
}

export interface ToolsetModels {
  name: string
  has_models: boolean
  models: ToolsetModel[]
  current: string | null
  default: string | null
  provider?: string
  plugin?: string
}

export interface ToolsData {
  toolsets: ToolsetInfo[]
}

/** Mirrored from the desktop Tools tab: the curated first row when the user has
 *  no usage data yet (`apps/desktop/src/app/capabilities/toolsets/toolsets-data.ts`). */
export const TOOLSET_ESSENTIALS: readonly string[] = ['browser', 'file', 'code_execution', 'memory']

export async function listToolsets(profile?: string): Promise<{ connectors: Connector[]; data: ToolsData }> {
  const res = await apiFetch<ToolsetInfo[]>(`/api/tools/toolsets${scopedQuery(profile)}`)
  const toolsets = Array.isArray(res) ? res : []
  return {
    connectors: toolsets.map(t => ({
      id: t.name,
      family: 'tools',
      name: t.label || t.name,
      description: t.description ?? '',
      icon: null,
      category: t.platform_label || null,
      status: t.enabled && t.configured ? 'connected' : t.enabled ? 'needs_setup' : 'available',
      configurable: true,
      auth: 'fields',
    })),
    data: { toolsets },
  }
}

export function setToolsetEnabled(
  name: string,
  enabled: boolean,
  profile?: string,
): Promise<{ ok: boolean; name: string; post_setup_started?: string | null }> {
  return apiFetch(`/api/tools/toolsets/${encodeURIComponent(name)}${scopedQuery(profile)}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export function getToolsetConfig(name: string, profile?: string): Promise<ToolsetConfig> {
  return apiFetch(`/api/tools/toolsets/${encodeURIComponent(name)}/config${scopedQuery(profile)}`)
}

export function getToolsetModels(name: string, provider: string, profile?: string): Promise<ToolsetModels> {
  return apiFetch(`/api/tools/toolsets/${encodeURIComponent(name)}/models${scopedQuery(profile, { provider })}`)
}

export function setToolsetProvider(
  name: string,
  provider: string,
  profile?: string,
): Promise<{ ok: boolean; name: string; provider: string; needs_nous_auth?: boolean; feature?: string }> {
  return apiFetch(`/api/tools/toolsets/${encodeURIComponent(name)}/provider${scopedQuery(profile)}`, {
    method: 'PUT',
    body: JSON.stringify({ provider }),
  })
}

export function setToolsetModel(name: string, model: string, profile?: string): Promise<{ ok: boolean; name: string; model: string }> {
  return apiFetch(`/api/tools/toolsets/${encodeURIComponent(name)}/model${scopedQuery(profile)}`, {
    method: 'PUT',
    body: JSON.stringify({ model }),
  })
}

export function setToolsetEnv(
  name: string,
  env: Record<string, string>,
  profile?: string,
): Promise<{ ok: boolean; name: string; saved: string[]; skipped: string[]; is_set: Record<string, boolean> }> {
  return apiFetch(`/api/tools/toolsets/${encodeURIComponent(name)}/env${scopedQuery(profile)}`, {
    method: 'PUT',
    body: JSON.stringify({ env }),
  })
}

export function postToolsetSetup(name: string, key: string, profile?: string): Promise<{ ok: boolean; pid: number; name: string; key: string }> {
  return apiFetch(`/api/tools/toolsets/${encodeURIComponent(name)}/post-setup${scopedQuery(profile)}`, {
    method: 'POST',
    body: JSON.stringify({ key }),
  })
}

/** Config form for the active provider's env vars. Blank secret inputs are
 *  skipped by the backend, so an empty password field keeps the stored key. */
export function toolsetConfigFields(provider: ToolsetProvider | undefined): ConfigField[] {
  if (!provider) return []
  return provider.env_vars.map(v => ({
    kind: 'secret',
    key: v.key,
    label: v.key,
    isSet: v.is_set,
    help: v.prompt,
    url: v.url ?? undefined,
  }))
}
