import { atom } from 'nanostores'
import { apiFetch } from '../lib/api'
import type { Session } from '../lib/types'

export const sessions = atom<Session[]>([])
export const sessionsLoading = atom<boolean>(false)

export async function loadSessions(profile?: string): Promise<void> {
  sessionsLoading.set(true)
  try {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : ''
    const res = await apiFetch<{ sessions: Session[] }>(`/api/sessions${q}`)
    sessions.set(res.sessions ?? [])
  } finally {
    sessionsLoading.set(false)
  }
}
