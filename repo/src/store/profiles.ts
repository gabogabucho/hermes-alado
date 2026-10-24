import { atom } from 'nanostores'
import { apiFetch } from '../lib/api'
import type { Profile } from '../lib/types'

export const profiles = atom<Profile[]>([])
export const profilesLoading = atom<boolean>(false)
export const profilesError = atom<string>('')
export const activeProfile = atom<string>('default')

export async function loadProfiles(): Promise<void> {
  profilesLoading.set(true)
  profilesError.set('')
  try {
    const res = await apiFetch<{ profiles: Profile[] }>('/api/profiles')
    profiles.set(res.profiles ?? [])
  } catch (e) {
    profilesError.set(e instanceof Error ? e.message : 'No se pudieron cargar los perfiles')
  } finally {
    profilesLoading.set(false)
  }
}

export async function loadActiveProfile(): Promise<void> {
  try {
    const res = await apiFetch<{ active: string; current: string }>('/api/profiles/active')
    activeProfile.set(res.active || 'default')
  } catch {
    // non-fatal: default to "default"
  }
}

export async function setActiveProfile(name: string): Promise<void> {
  await apiFetch('/api/profiles/active', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  activeProfile.set(name)
}

export async function createProfile(name: string, description?: string): Promise<void> {
  await apiFetch('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  })
}
