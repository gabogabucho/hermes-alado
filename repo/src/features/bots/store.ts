import { atom } from 'nanostores'
import { apiFetch } from '../../lib/api'
import type { Profile } from '../../lib/types'

export const profiles = atom<Profile[]>([])
export const profilesLoading = atom<boolean>(false)
export const profilesError = atom<string>('')

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

export async function createProfile(name: string, description?: string): Promise<void> {
  await apiFetch('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  })
}
