// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Typed REST client for the "Salud del sistema" screen (phase 4b). Shapes mirror
// hermes_cli/web_routers/ops.py (POST /api/ops/doctor) and
// hermes_cli/web_routers/actions.py (GET /api/actions/{name}/status).
import { apiFetch } from '../api'

/** Response of a spawned background action (`spawn_profile_action`). */
export interface SpawnedAction {
  ok: boolean
  pid: number
  name: string
  key?: string
}

/** Response of `GET /api/actions/{name}/status` (actions.py:439). */
export interface ActionStatus {
  name: string
  running: boolean
  exit_code: number | null
  pid: number | null
  lines: string[]
}

function profileQuery(profile?: string | null): string {
  return profile && profile !== 'default' ? `?profile=${encodeURIComponent(profile)}` : ''
}

/** `POST /api/ops/doctor` — spawn `hermes doctor` as a background action. */
export function spawnDoctor(profile?: string | null): Promise<SpawnedAction> {
  return apiFetch<SpawnedAction>(`/api/ops/doctor${profileQuery(profile)}`, { method: 'POST' })
}

/** Tail a background action log and read its live status. */
export function getActionStatus(name: string, lines = 200): Promise<ActionStatus> {
  return apiFetch<ActionStatus>(`/api/actions/${encodeURIComponent(name)}/status?lines=${lines}`)
}

/**
 * `POST /api/tools/toolsets/{name}/post-setup` — spawn `hermes tools post-setup
 * <key>` (e.g. `browser` + `agent_browser` to reinstall Chromium). Polled via
 * `GET /api/actions/tools-post-setup/status`.
 */
export function runToolsetPostSetup(
  name: string,
  key: string,
  profile?: string | null,
): Promise<SpawnedAction> {
  return apiFetch<SpawnedAction>(
    `/api/tools/toolsets/${encodeURIComponent(name)}/post-setup${profileQuery(profile)}`,
    { method: 'POST', body: JSON.stringify({ key }) },
  )
}
