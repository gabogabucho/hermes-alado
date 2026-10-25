import { atom } from 'nanostores'
import {
  addCredentialPoolEntry,
  deleteEnvVar,
  getCredentialPool,
  getEnvVars,
  removeCredentialPoolEntry,
  setEnvVar,
  type CredentialPoolResponse,
  type EnvVarInfo,
} from '../../lib/hermes/credentials'

/**
 * Bóveda screen state. EVERY call takes the profile as an argument: the
 * screen acts on the bot it was opened for (the route's `:profile`), never on
 * the server's active profile.
 */

export const envVars = atom<Record<string, EnvVarInfo> | null>(null)
export const envLoading = atom<boolean>(true)
export const envError = atom<string>('')

export const pool = atom<CredentialPoolResponse | null>(null)
export const poolLoading = atom<boolean>(true)
export const poolError = atom<string>('')

export async function loadEnvVars(profile: string): Promise<void> {
  envLoading.set(true)
  envError.set('')
  try {
    const res = await getEnvVars(profile)
    envVars.set(res)
  } catch (e) {
    envError.set(e instanceof Error ? e.message : 'No se pudieron cargar las credenciales')
  } finally {
    envLoading.set(false)
  }
}

export async function loadPool(profile: string): Promise<void> {
  poolLoading.set(true)
  poolError.set('')
  try {
    const res = await getCredentialPool(profile)
    pool.set(res)
  } catch (e) {
    poolError.set(e instanceof Error ? e.message : 'No se pudo cargar el grupo de credenciales')
  } finally {
    poolLoading.set(false)
  }
}

export async function saveVar(profile: string, key: string, value: string): Promise<void> {
  await setEnvVar(key, value, profile)
  await loadEnvVars(profile)
}

export async function removeVar(profile: string, key: string): Promise<void> {
  await deleteEnvVar(key, profile)
  await loadEnvVars(profile)
}

export async function addPoolEntry(
  profile: string,
  provider: string,
  apiKey: string,
  label: string,
): Promise<void> {
  await addCredentialPoolEntry(provider, apiKey, label, profile)
  await loadPool(profile)
}

export async function removePoolEntry(
  profile: string,
  provider: string,
  index: number,
): Promise<void> {
  await removeCredentialPoolEntry(provider, index, profile)
  await loadPool(profile)
}
