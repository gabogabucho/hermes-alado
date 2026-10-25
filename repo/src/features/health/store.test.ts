import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getComputerUseStatus,
  getConfig,
  getToolsets,
} from '../../lib/hermes/agent-control'
import { getEnvVars } from '../../lib/hermes/credentials'
import { parseDoctorOutput } from '../../lib/hermes/doctor-output'
import { getActionStatus, spawnDoctor } from '../../lib/hermes/health'
import { probeRemediations } from '../../lib/hermes/remediation'
import { loadProbes, runDoctor, switchHealthProfile } from './store'

vi.mock('../../lib/hermes/agent-control', () => ({
  getComputerUseStatus: vi.fn(),
  getConfig: vi.fn(),
  getToolsets: vi.fn(),
  toggleToolset: vi.fn(),
}))

vi.mock('../../lib/hermes/credentials', () => ({
  getEnvVars: vi.fn(),
}))

vi.mock('../../lib/hermes/doctor-output', () => ({
  parseDoctorOutput: vi.fn(),
}))

vi.mock('../../lib/hermes/health', () => ({
  getActionStatus: vi.fn(),
  runToolsetPostSetup: vi.fn(),
  spawnDoctor: vi.fn(),
}))

vi.mock('../../lib/hermes/remediation', () => ({
  doctorRemediation: vi.fn(),
  probeRemediations: vi.fn(),
}))

const cuStatus = {
  platform: 'linux',
  platform_supported: true,
  installed: true,
  version: '1',
  ready: true,
  can_grant: true,
  checks: [],
  accessibility: null,
  screen_recording: null,
  screen_recording_capturable: null,
  source: null,
  error: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getComputerUseStatus).mockResolvedValue(cuStatus)
  vi.mocked(getConfig).mockResolvedValue({})
  vi.mocked(getToolsets).mockResolvedValue([])
  vi.mocked(getEnvVars).mockResolvedValue({})
  vi.mocked(probeRemediations).mockReturnValue([])
})

describe('health store scoping', () => {
  it('loadProbes passes the profile it was given to every probe', async () => {
    await loadProbes('prueba')
    expect(getComputerUseStatus).toHaveBeenCalledWith('prueba')
    expect(getToolsets).toHaveBeenCalledWith('prueba')
    expect(getEnvVars).toHaveBeenCalledWith('prueba')
    expect(getConfig).toHaveBeenCalledWith('prueba')
    expect(getEnvVars).not.toHaveBeenCalledWith('default')
    expect(getConfig).not.toHaveBeenCalledWith('default')
  })

  it('runDoctor passes the profile to spawnDoctor', async () => {
    vi.useFakeTimers()
    vi.mocked(spawnDoctor).mockResolvedValue({ ok: true, pid: 1, name: 'doctor' })
    vi.mocked(getActionStatus).mockResolvedValue({
      name: 'doctor',
      running: false,
      exit_code: 0,
      pid: 1,
      lines: [],
    })
    vi.mocked(parseDoctorOutput).mockReturnValue({ sections: [], issues: [], fixed: 0, passed: true })
    const done = runDoctor('prueba')
    await vi.advanceTimersByTimeAsync(1500)
    await done
    expect(spawnDoctor).toHaveBeenCalledWith('prueba')
    vi.useRealTimers()
  })

  it('switchHealthProfile reloads the probes for the given profile', async () => {
    switchHealthProfile('otro')
    await vi.waitFor(() => expect(getToolsets).toHaveBeenCalledWith('otro'))
    expect(getComputerUseStatus).toHaveBeenCalledWith('otro')
  })
})
