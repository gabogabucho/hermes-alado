import { apiFetch } from '../../api'
import { scopedQuery } from './api'
import type { Connector, ConnectorAuth, ConfigField } from './types'

export interface McpCatalogEnvVar {
  name: string
  prompt: string
  required: boolean
}

export interface McpCatalogEntry {
  name: string
  description: string
  connector_slug: string | null
  source: string
  transport: string
  auth_type: string | null
  required_env: McpCatalogEnvVar[]
  command: string | null
  args: string[]
  url: string | null
  install_url: string | null
  install_ref: string | null
  bootstrap: string[]
  default_enabled: string[] | null
  post_install: string | null
  suggest: unknown | null
  needs_install: boolean
  installed: boolean
  enabled: boolean
}

export interface McpServerSummary {
  name: string
  transport: string
  url: string | null
  command: string | null
  args: string[]
  env: Record<string, string>
  auth: 'oauth' | 'header' | null
  enabled: boolean
  tools: string[] | null
  source: string
  plugin: string | null
}

export interface McpTestResult {
  ok: boolean
  error?: string
  tools: { name: string; description: string; schema_chars?: number }[]
  prompts?: number
  resources?: number
}

export interface McpOAuthFlow {
  flow_id: string
  server_name: string
  status: 'starting' | 'authorization_required' | 'approved' | 'error'
  authorization_url: string | null
  error: string | null
  tools?: { name: string; description: string }[]
}

export interface McpData {
  catalog: McpCatalogEntry[]
  servers: McpServerSummary[]
}

const authFor = (authType: string | null | undefined): ConnectorAuth =>
  authType === 'oauth' ? 'oauth' : authType === 'header' ? 'fields' : 'none'

export async function listMcp(profile?: string): Promise<{ connectors: Connector[]; data: McpData }> {
  const [catalogRes, serversRes] = await Promise.all([
    apiFetch<{ entries?: McpCatalogEntry[]; diagnostics?: unknown[] }>(`/api/mcp/catalog${scopedQuery(profile)}`),
    apiFetch<{ servers?: McpServerSummary[] }>(`/api/mcp/servers${scopedQuery(profile)}`),
  ])
  const catalog = catalogRes.entries ?? []
  const servers = serversRes.servers ?? []

  const connectors: Connector[] = catalog.map(entry => ({
    id: entry.name,
    family: 'apps',
    name: entry.name,
    description: entry.description ?? '',
    icon: null,
    category: null,
    status: entry.installed && entry.enabled ? 'connected' : 'available',
    configurable: true,
    auth: authFor(entry.auth_type),
  }))

  const catalogNames = new Set(catalog.map(e => e.name))
  for (const server of servers) {
    if (catalogNames.has(server.name)) continue
    connectors.push({
      id: server.name,
      family: 'apps',
      name: server.name,
      description: server.url ?? server.command ?? '',
      icon: null,
      category: null,
      status: server.enabled ? 'connected' : 'available',
      configurable: true,
      auth: authFor(server.auth),
    })
  }

  return { connectors, data: { catalog, servers } }
}

export function installMcpEntry(
  name: string,
  env: Record<string, string>,
  profile?: string,
): Promise<{ ok: boolean; name?: string; pid?: number; action?: string; background?: boolean }> {
  return apiFetch(`/api/mcp/catalog/install${scopedQuery(profile)}`, {
    method: 'POST',
    body: JSON.stringify({ name, env, enable: true }),
  })
}

export function deleteMcpServer(name: string, profile?: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/mcp/servers/${encodeURIComponent(name)}${scopedQuery(profile)}`, { method: 'DELETE' })
}

export function testMcpServer(name: string, profile?: string): Promise<McpTestResult> {
  return apiFetch(`/api/mcp/servers/${encodeURIComponent(name)}/test${scopedQuery(profile)}`, { method: 'POST' })
}

export function setMcpServerEnabled(name: string, enabled: boolean, profile?: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/mcp/servers/${encodeURIComponent(name)}/enabled${scopedQuery(profile)}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export function startMcpOAuth(name: string, profile?: string): Promise<McpOAuthFlow> {
  return apiFetch(`/api/mcp/servers/${encodeURIComponent(name)}/auth${scopedQuery(profile)}`, { method: 'POST' })
}

export function pollMcpOAuth(flowId: string): Promise<McpOAuthFlow> {
  return apiFetch(`/api/mcp/oauth/flows/${encodeURIComponent(flowId)}`)
}

export function cancelMcpOAuth(flowId: string): Promise<{ ok: boolean; status: string }> {
  return apiFetch(`/api/mcp/oauth/flows/${encodeURIComponent(flowId)}`, { method: 'DELETE' })
}

/** Install-time config form for a catalog entry: one field per declared env var. */
export function mcpInstallFields(entry: McpCatalogEntry): ConfigField[] {
  return entry.required_env.map(v => ({
    kind: 'secret',
    key: v.name,
    label: v.name,
    isSet: false,
    help: v.prompt,
    required: v.required,
  }))
}
