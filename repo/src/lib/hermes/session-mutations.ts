// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Fenced session writes, mirroring apps/desktop/src/api/sessions.ts `mutateSessionHttp`:
// the backend refuses an unfenced PATCH/DELETE with 409 `client_upgrade_required`, so every
// write carries {request_id, expected_revision, expected_generation} from /mutation-snapshot.
import { apiFetch } from '../api'
import {
  createSessionMutationClient,
  type SessionMutationIdentity,
  type SessionMutationSnapshot,
} from './vendor/session-http-mutations'

const mutate = createSessionMutationClient()

function mutateSessionHttp<T>(
  id: string,
  payload: Record<string, unknown>,
  profile?: string | null,
): Promise<T> {
  const path = `/api/sessions/${encodeURIComponent(id)}`
  const query = profile ? `?profile=${encodeURIComponent(profile)}` : ''
  const key = JSON.stringify([profile ?? null, id, 'PATCH', payload])

  return mutate(
    key,
    () => apiFetch<SessionMutationSnapshot>(`${path}/mutation-snapshot${query}`),
    (identity: SessionMutationIdentity) =>
      apiFetch<T>(path, {
        method: 'PATCH',
        body: JSON.stringify({ ...payload, ...identity, ...(profile ? { profile } : {}) }),
      }),
  )
}

export function setSessionUnread(id: string, unread: boolean, profile?: string | null): Promise<{ ok: boolean }> {
  return mutateSessionHttp(id, { unread }, profile)
}
