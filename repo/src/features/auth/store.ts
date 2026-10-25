import { atom } from 'nanostores'
import { resolveAuth, type AuthState } from '../../lib/hermes/auth'
import type { UserInfo } from '../../lib/types'

export type AuthStatus = 'checking' | 'authed' | 'anonymous' | 'error'

export const authStatus = atom<AuthStatus>('checking')
export const authState = atom<AuthState | null>(null)
export const user = atom<UserInfo | null>(null)
export const authError = atom<string>('')

export async function checkAuth(): Promise<AuthState> {
  const state = await resolveAuth()
  authState.set(state)

  if (state.mode === 'loopback') {
    user.set({
      user_id: 'local',
      email: '',
      display_name: 'Local',
      provider: 'loopback',
      expires_at: 0,
    })
    authStatus.set('authed')
  } else if (state.mode === 'gated') {
    user.set(state.user)
    authStatus.set('authed')
  } else if (state.mode === 'gated-anonymous') {
    authStatus.set('anonymous')
  } else {
    authStatus.set('error')
    authError.set(state.error)
  }
  return state
}
