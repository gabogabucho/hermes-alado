import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getComputerUseStatus,
  getConfig,
  getToolsets,
  interruptSession,
  listActiveSessions,
  readApprovalMode,
  setApprovalMode,
  toggleToolset,
} from '../../lib/hermes/agent-control'
import {
  loadActiveSessions,
  loadApproval,
  loadComputerUse,
  loadToolsets,
  saveApproval,
  setToolset,
  stopSession,
} from './store'

vi.mock('../../lib/hermes/agent-control', () => ({
  getComputerUseStatus: vi.fn(),
  getConfig: vi.fn(),
  getToolsets: vi.fn(),
  interruptSession: vi.fn(),
  listActiveSessions: vi.fn(),
  readApprovalMode: vi.fn(),
  setApprovalMode: vi.fn(),
  toggleToolset: vi.fn(),
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
  vi.mocked(getConfig).mockResolvedValue({})
  vi.mocked(readApprovalMode).mockReturnValue('smart')
  vi.mocked(getComputerUseStatus).mockResolvedValue(cuStatus)
  vi.mocked(getToolsets).mockResolvedValue([])
  vi.mocked(setApprovalMode).mockResolvedValue({ ok: true })
  vi.mocked(toggleToolset).mockResolvedValue({ ok: true, name: '', enabled: true })
  vi.mocked(listActiveSessions).mockResolvedValue([])
  vi.mocked(interruptSession).mockResolvedValue({ status: 'interrupted' })
})

describe('control store scoping', () => {
  it('loadApproval passes the profile it was given to getConfig', async () => {
    await loadApproval('prueba')
    expect(getConfig).toHaveBeenCalledWith('prueba')
    expect(getConfig).not.toHaveBeenCalledWith('default')
  })

  it('saveApproval passes the profile and the mode', async () => {
    await saveApproval('prueba', 'manual')
    expect(setApprovalMode).toHaveBeenCalledWith('manual', 'prueba')
  })

  it('loadComputerUse passes the profile it was given', async () => {
    await loadComputerUse('prueba')
    expect(getComputerUseStatus).toHaveBeenCalledWith('prueba')
  })

  it('loadToolsets passes the profile it was given', async () => {
    await loadToolsets('prueba')
    expect(getToolsets).toHaveBeenCalledWith('prueba')
  })

  it('setToolset passes the profile, then reloads with the same profile', async () => {
    await setToolset('prueba', 'browser', true)
    expect(toggleToolset).toHaveBeenCalledWith('browser', true, 'prueba')
    expect(getToolsets).toHaveBeenCalledWith('prueba')
  })

  it('loadActiveSessions passes the profile it was given', async () => {
    await loadActiveSessions('prueba')
    expect(listActiveSessions).toHaveBeenCalledWith('prueba')
  })

  it('stopSession passes the profile to interrupt and to the reload', async () => {
    await stopSession('prueba', 'sess-1')
    expect(interruptSession).toHaveBeenCalledWith('sess-1', 'prueba')
    expect(listActiveSessions).toHaveBeenCalledWith('prueba')
  })

  it('never falls back to the active profile: every call uses the given profile', async () => {
    await Promise.all([
      loadApproval('otro'),
      loadComputerUse('otro'),
      loadToolsets('otro'),
      loadActiveSessions('otro'),
    ])
    expect(getConfig).toHaveBeenCalledWith('otro')
    expect(getComputerUseStatus).toHaveBeenCalledWith('otro')
    expect(getToolsets).toHaveBeenCalledWith('otro')
    expect(listActiveSessions).toHaveBeenCalledWith('otro')
    expect(getConfig).not.toHaveBeenCalledWith('default')
    expect(getToolsets).not.toHaveBeenCalledWith('default')
  })
})
