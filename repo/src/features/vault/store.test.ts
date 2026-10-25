import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addCredentialPoolEntry,
  deleteEnvVar,
  getCredentialPool,
  getEnvVars,
  removeCredentialPoolEntry,
  setEnvVar,
} from '../../lib/hermes/credentials'
import {
  addPoolEntry,
  loadEnvVars,
  loadPool,
  removePoolEntry,
  removeVar,
  saveVar,
} from './store'

vi.mock('../../lib/hermes/credentials', () => ({
  addCredentialPoolEntry: vi.fn(),
  deleteEnvVar: vi.fn(),
  getCredentialPool: vi.fn(),
  getEnvVars: vi.fn(),
  removeCredentialPoolEntry: vi.fn(),
  setEnvVar: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getEnvVars).mockResolvedValue({})
  vi.mocked(getCredentialPool).mockResolvedValue({ providers: [] })
  vi.mocked(setEnvVar).mockResolvedValue({})
  vi.mocked(deleteEnvVar).mockResolvedValue({})
  vi.mocked(addCredentialPoolEntry).mockResolvedValue({})
  vi.mocked(removeCredentialPoolEntry).mockResolvedValue({})
})

describe('vault store scoping', () => {
  it('loadEnvVars passes the profile it was given', async () => {
    await loadEnvVars('prueba')
    expect(getEnvVars).toHaveBeenCalledWith('prueba')
    expect(getEnvVars).not.toHaveBeenCalledWith('default')
  })

  it('loadPool passes the profile it was given', async () => {
    await loadPool('prueba')
    expect(getCredentialPool).toHaveBeenCalledWith('prueba')
  })

  it('saveVar passes the profile and reloads with the same profile', async () => {
    await saveVar('prueba', 'GITHUB_TOKEN', 'abc')
    expect(setEnvVar).toHaveBeenCalledWith('GITHUB_TOKEN', 'abc', 'prueba')
    expect(getEnvVars).toHaveBeenCalledWith('prueba')
  })

  it('removeVar passes the profile and reloads with the same profile', async () => {
    await removeVar('prueba', 'GITHUB_TOKEN')
    expect(deleteEnvVar).toHaveBeenCalledWith('GITHUB_TOKEN', 'prueba')
    expect(getEnvVars).toHaveBeenCalledWith('prueba')
  })

  it('addPoolEntry passes the profile', async () => {
    await addPoolEntry('prueba', 'openai', 'key', 'trabajo')
    expect(addCredentialPoolEntry).toHaveBeenCalledWith('openai', 'key', 'trabajo', 'prueba')
    expect(getCredentialPool).toHaveBeenCalledWith('prueba')
  })

  it('removePoolEntry passes the profile', async () => {
    await removePoolEntry('prueba', 'openai', 2)
    expect(removeCredentialPoolEntry).toHaveBeenCalledWith('openai', 2, 'prueba')
    expect(getCredentialPool).toHaveBeenCalledWith('prueba')
  })

  it('never falls back to the active profile: every call uses the given profile', async () => {
    await Promise.all([loadEnvVars('otro'), loadPool('otro')])
    expect(getEnvVars).toHaveBeenCalledWith('otro')
    expect(getCredentialPool).toHaveBeenCalledWith('otro')
    expect(getEnvVars).not.toHaveBeenCalledWith('default')
    expect(getCredentialPool).not.toHaveBeenCalledWith('default')
  })
})
