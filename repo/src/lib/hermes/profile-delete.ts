import { apiFetch } from '../api'

/**
 * `DELETE /api/profiles/{name}` (`hermes_cli/web_routers/profiles.py:979`).
 * The dashboard route always skips the CLI prompt (yes=True). A delete whose
 * identity settlement stays pending still answers `ok` — the profile
 * directory is already gone, so it is success for the user, not a failure.
 */
export interface DeleteProfileResult {
  ok: boolean
  path?: string
  identity_settled?: boolean
  settlement_pending?: boolean
  retry_command?: string
}

export function deleteProfile(name: string): Promise<DeleteProfileResult> {
  return apiFetch<DeleteProfileResult>(`/api/profiles/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}
