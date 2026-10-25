import { apiFetch } from '../../api'
import { scopedQuery } from './api'
import type { Connector } from './types'

export interface PluginRow {
  name: string
  version: string
  description: string
  source: string
  runtime_status: 'enabled' | 'disabled' | 'inactive'
  has_dashboard_manifest: boolean
  dashboard_manifest: unknown | null
  path: string
  can_remove: boolean
  can_update_git: boolean
  auth_required: boolean
  auth_command: string
  user_hidden: boolean
  removed_reason: string | null
}

export interface PluginsHub {
  plugins: PluginRow[]
  orphan_dashboard_plugins: unknown[]
  providers: unknown
}

export interface PluginsData {
  hub: PluginsHub
}

export async function listPlugins(profile?: string): Promise<{ connectors: Connector[]; data: PluginsData }> {
  const hub = await apiFetch<PluginsHub>(`/api/dashboard/plugins/hub${scopedQuery(profile)}`)
  const rows = hub?.plugins ?? []
  return {
    connectors: rows
      .filter(row => !row.user_hidden)
      .map(row => ({
        id: row.name,
        family: 'plugins',
        name: row.name,
        description: row.description ?? '',
        icon: null,
        category: null,
        status: row.runtime_status === 'enabled' ? 'connected' : 'available',
        configurable: true,
        auth: row.auth_required ? 'fields' : 'none',
      })),
    data: { hub },
  }
}

export function installPlugin(
  identifier: string,
  profile?: string,
): Promise<{ ok: boolean; name?: string; consent_required?: boolean }> {
  return apiFetch(`/api/dashboard/agent-plugins/install${scopedQuery(profile)}`, {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  })
}

export function enablePlugin(name: string, profile?: string): Promise<{ ok: boolean; name: string; restart_required?: boolean }> {
  return apiFetch(`/api/dashboard/agent-plugins/${encodeURIComponent(name)}/enable${scopedQuery(profile)}`, { method: 'POST' })
}

export function disablePlugin(name: string, profile?: string): Promise<{ ok: boolean; name: string; restart_required?: boolean }> {
  return apiFetch(`/api/dashboard/agent-plugins/${encodeURIComponent(name)}/disable${scopedQuery(profile)}`, { method: 'POST' })
}

export function updatePlugin(name: string, profile?: string): Promise<{ ok: boolean; name: string }> {
  return apiFetch(`/api/dashboard/agent-plugins/${encodeURIComponent(name)}/update${scopedQuery(profile)}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function removePlugin(name: string, profile?: string): Promise<{ ok: boolean; name?: string }> {
  return apiFetch(`/api/dashboard/agent-plugins/${encodeURIComponent(name)}${scopedQuery(profile)}`, { method: 'DELETE' })
}
