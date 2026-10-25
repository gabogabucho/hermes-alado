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
import { activeProfile, loadActiveProfile } from '../home/store'

export const envVars = atom<Record<string, EnvVarInfo> | null>(null)
export const envLoading = atom<boolean>(true)
export const envError = atom<string>('')

export const pool = atom<CredentialPoolResponse | null>(null)
export const poolLoading = atom<boolean>(true)
export const poolError = atom<string>('')

export function vaultProfile(): string {
  return activeProfile.get() || 'default'
}

export async function loadEnvVars(): Promise<void> {
  envLoading.set(true)
  envError.set('')
  try {
    const res = await getEnvVars(vaultProfile())
    envVars.set(res)
  } catch (e) {
    envError.set(e instanceof Error ? e.message : 'No se pudieron cargar las credenciales')
  } finally {
    envLoading.set(false)
  }
}

export async function loadPool(): Promise<void> {
  poolLoading.set(true)
  poolError.set('')
  try {
    const res = await getCredentialPool(vaultProfile())
    pool.set(res)
  } catch (e) {
    poolError.set(e instanceof Error ? e.message : 'No se pudo cargar el grupo de credenciales')
  } finally {
    poolLoading.set(false)
  }
}

export async function loadVault(): Promise<void> {
  await loadActiveProfile()
  await Promise.all([loadEnvVars(), loadPool()])
}

export async function saveVar(key: string, value: string): Promise<void> {
  await setEnvVar(key, value, vaultProfile())
  await loadEnvVars()
}

export async function removeVar(key: string): Promise<void> {
  await deleteEnvVar(key, vaultProfile())
  await loadEnvVars()
}

export async function addPoolEntry(provider: string, apiKey: string, label: string): Promise<void> {
  await addCredentialPoolEntry(provider, apiKey, label, vaultProfile())
  await loadPool()
}

export async function removePoolEntry(provider: string, index: number): Promise<void> {
  await removeCredentialPoolEntry(provider, index, vaultProfile())
  await loadPool()
}
