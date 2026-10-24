import { atom } from 'nanostores'
import { ApiError, apiFetch } from '../lib/api'
import type { UserInfo } from '../lib/types'

export type AuthStatus = 'checking' | 'authed' | 'anonymous' | 'error'

export const authStatus = atom<AuthStatus>('checking')
export const user = atom<UserInfo | null>(null)
export const authError = atom<string>('')

export async function checkAuth(): Promise<void> {
  try {
    const u = await apiFetch<UserInfo>('/api/auth/me')
    user.set(u)
    authStatus.set('authed')
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      authStatus.set('anonymous')
    } else {
      authStatus.set('error')
      authError.set(e instanceof Error ? e.message : 'Backend no alcanzable')
    }
  }
}
