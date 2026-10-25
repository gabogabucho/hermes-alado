// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Typed client for "Control del agente" (plan §4.6 level 1). REST shapes mirror
// hermes_cli/web_routers/config_env.py + tools.py; live-session reads/writes go
// over the gateway RPC (tui_gateway/contracts/sessions.py: session.active_list,
// session.interrupt).
import { apiFetch } from '../api'
import { request } from './connection'
import type {
  SessionActiveItem,
  SessionInterruptResult,
} from './vendor/gateway-contract.generated'

export type HermesConfigRecord = Record<string, unknown>

/** Approval modes (hermes_cli/config_defaults.py: approvals.mode). */
export type ApprovalMode = 'manual' | 'smart' | 'off'

export interface ComputerUseCheck {
  label: string
  status: string
  message: string
}

/** `GET /api/tools/computer-use/status` (tools/computer_use/permissions.py::computer_use_status). */
export interface ComputerUseStatus {
  platform: string
  platform_supported: boolean
  installed: boolean
  version: string | null
  ready: boolean | null
  can_grant: boolean
  checks: ComputerUseCheck[]
  accessibility: boolean | null
  screen_recording: boolean | null
  screen_recording_capturable: boolean | null
  source: Record<string, unknown> | null
  error: string | null
}

/** One row of `GET /api/tools/toolsets` (tools.py). */
export interface ToolsetRow {
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

export function getConfig(profile?: string | null): Promise<HermesConfigRecord> {
  const q = profile && profile !== 'default' ? `?profile=${encodeURIComponent(profile)}` : ''
  return apiFetch<HermesConfigRecord>(`/api/config${q}`)
}

/** Deep-merge PUT — the dashboard form only sends what it changes. */
export function saveConfig(
  config: HermesConfigRecord,
  profile?: string | null,
): Promise<{ ok: boolean }> {
  const q = profile && profile !== 'default' ? `?profile=${encodeURIComponent(profile)}` : ''
  return apiFetch<{ ok: boolean }>(`/api/config${q}`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })
}

/** `approvals.mode` as `GET /api/config` returns it; undefined when absent. */
export function readApprovalMode(config: HermesConfigRecord): ApprovalMode | undefined {
  const approvals = config.approvals
  if (typeof approvals !== 'object' || approvals === null) return undefined
  const mode = (approvals as Record<string, unknown>).mode
  return mode === 'manual' || mode === 'smart' || mode === 'off' ? mode : undefined
}

export function setApprovalMode(mode: ApprovalMode, profile?: string | null): Promise<{ ok: boolean }> {
  return saveConfig({ approvals: { mode } }, profile)
}

export function getComputerUseStatus(profile?: string | null): Promise<ComputerUseStatus> {
  const q = profile && profile !== 'default' ? `?profile=${encodeURIComponent(profile)}` : ''
  return apiFetch<ComputerUseStatus>(`/api/tools/computer-use/status${q}`)
}

export function getToolsets(profile?: string | null): Promise<ToolsetRow[]> {
  const q = profile && profile !== 'default' ? `?profile=${encodeURIComponent(profile)}` : ''
  return apiFetch<ToolsetRow[]>(`/api/tools/toolsets${q}`)
}

export function toggleToolset(
  name: string,
  enabled: boolean,
  profile?: string | null,
): Promise<{ ok: boolean; name: string; enabled: boolean; post_setup_started?: string | null }> {
  const q = profile && profile !== 'default' ? `?profile=${encodeURIComponent(profile)}` : ''
  return apiFetch(`/api/tools/toolsets/${encodeURIComponent(name)}${q}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export async function listActiveSessions(profile?: string | null): Promise<SessionActiveItem[]> {
  const res = await request('session.active_list', { profile })
  return res.sessions
}

export function interruptSession(
  sessionId: string,
  profile?: string | null,
): Promise<SessionInterruptResult> {
  return request('session.interrupt', { session_id: sessionId, profile })
}
