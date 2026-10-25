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

/**
 * Create a bot. Like the desktop's create dialog, it clones `cloneFrom` by default
 * (Hermes copies config.yaml, .env and SOUL.md — hermes_cli/profiles.py `_CLONE_CONFIG_FILES`),
 * so the new bot inherits a working model + credentials. Pass `cloneFrom: null` for a blank bot.
 */
export async function createProfile(
  name: string,
  { description, cloneFrom = 'default' }: { description?: string; cloneFrom?: string | null } = {},
): Promise<void> {
  await apiFetch('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ name, description, clone_from: cloneFrom }),
  })
}
