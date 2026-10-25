// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Typed REST client for the credential surfaces the Bóveda uses. Shapes mirror
// apps/desktop/src/api/config.ts and the dashboard routers at
// hermes_cli/web_routers/config_env.py + ops.py (pinned bf0203a).
//
// D4/D5: write-only vault — values are never read back. `/api/env/reveal` is
// deliberately NOT exposed here, and nothing secret is ever persisted client-side.
import { apiFetch } from '../api'

export interface EnvProviderProfile {
  description: string
  primary: boolean
  provider: string
  provider_label: string
  url: string | null
}

/** One row of `GET /api/env` (config_env.py::_get_env_vars_sync). */
export interface EnvVarInfo {
  advanced: boolean
  category: string
  channel_managed?: boolean
  custom?: boolean
  description: string
  is_password: boolean
  is_set: boolean
  provider?: string
  provider_label?: string
  provider_profiles?: EnvProviderProfile[]
  provider_primary?: boolean
  redacted_value: string | null
  tools: string[]
  url: string | null
}

export interface CredentialPoolEntry {
  index: number
  id: string
  label: string
  auth_type: string
  source: string
  priority: number
  last_status: string | null
  request_count: number
  token_preview: string
  has_refresh: boolean
}

export interface CredentialPoolProvider {
  provider: string
  entries: CredentialPoolEntry[]
}

export interface CredentialPoolResponse {
  providers: CredentialPoolProvider[]
}

function profileQuery(profile?: string | null): string {
  return profile && profile !== 'default' ? `?profile=${encodeURIComponent(profile)}` : ''
}

export function getEnvVars(profile?: string | null): Promise<Record<string, EnvVarInfo>> {
  return apiFetch<Record<string, EnvVarInfo>>(`/api/env${profileQuery(profile)}`)
}

export function setEnvVar(
  key: string,
  value: string,
  profile?: string | null,
): Promise<unknown> {
  return apiFetch(`/api/env${profileQuery(profile)}`, {
    method: 'PUT',
    body: JSON.stringify({ key, value }),
  })
}

export function deleteEnvVar(key: string, profile?: string | null): Promise<unknown> {
  return apiFetch(`/api/env${profileQuery(profile)}`, {
    method: 'DELETE',
    body: JSON.stringify({ key }),
  })
}

export function getCredentialPool(profile?: string | null): Promise<CredentialPoolResponse> {
  return apiFetch<CredentialPoolResponse>(`/api/credentials/pool${profileQuery(profile)}`)
}

export function addCredentialPoolEntry(
  provider: string,
  apiKey: string,
  label: string,
  profile?: string | null,
): Promise<unknown> {
  return apiFetch(`/api/credentials/pool${profileQuery(profile)}`, {
    method: 'POST',
    body: JSON.stringify({ provider, api_key: apiKey, label }),
  })
}

/** `index` is 1-based, as listed by the pool endpoint. */
export function removeCredentialPoolEntry(
  provider: string,
  index: number,
  profile?: string | null,
): Promise<unknown> {
  return apiFetch(
    `/api/credentials/pool/${encodeURIComponent(provider)}/${index}${profileQuery(profile)}`,
    { method: 'DELETE' },
  )
}

/**
 * The exact env-var name shape the backend accepts for a custom key
 * (hermes_cli/config.py::_ENV_VAR_NAME_RE + validate_env_var_name_for_write).
 */
export function isValidEnvVarName(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
}
