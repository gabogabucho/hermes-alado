import { atom } from 'nanostores'
import {
  getComputerUseStatus,
  getConfig,
  getToolsets,
  interruptSession,
  listActiveSessions,
  readApprovalMode,
  setApprovalMode,
  toggleToolset,
  type ApprovalMode,
  type ComputerUseStatus,
  type ToolsetRow,
} from '../../lib/hermes/agent-control'
import type { SessionActiveItem } from '../../lib/hermes/vendor/gateway-contract.generated'

/**
 * Per-bot agent controls (Aprobaciones + Herramientas screens). EVERY call
 * takes the profile as an argument: these screens act on the bot they were
 * opened for (the route's `:profile`), never on the server's active profile.
 */

export const approvalMode = atom<ApprovalMode | undefined>(undefined)
export const approvalLoading = atom<boolean>(true)
export const approvalSaving = atom<boolean>(false)
export const approvalError = atom<string>('')

export const computerUse = atom<ComputerUseStatus | null>(null)
export const computerUseLoading = atom<boolean>(true)
export const computerUseError = atom<string>('')

export const toolsets = atom<ToolsetRow[]>([])
export const toolsetsLoading = atom<boolean>(true)
export const toolsetBusy = atom<string>('')
export const toolsetError = atom<string>('')

export const activeSessions = atom<SessionActiveItem[]>([])
export const sessionsLoading = atom<boolean>(true)
export const sessionsError = atom<string>('')
export const interruptBusy = atom<string>('')

export async function loadApproval(profile: string): Promise<void> {
  approvalLoading.set(true)
  approvalError.set('')
  try {
    const config = await getConfig(profile)
    approvalMode.set(readApprovalMode(config) ?? 'smart')
  } catch (e) {
    approvalError.set(e instanceof Error ? e.message : 'No se pudo leer la configuración')
  } finally {
    approvalLoading.set(false)
  }
}

/** `approvals.mode`: manual (always ask) | smart (ask only when risky) | off (never ask). */
export async function saveApproval(profile: string, mode: ApprovalMode): Promise<void> {
  approvalSaving.set(true)
  try {
    await setApprovalMode(mode, profile)
    approvalMode.set(mode)
  } finally {
    approvalSaving.set(false)
  }
}

export async function loadComputerUse(profile: string): Promise<void> {
  computerUseLoading.set(true)
  computerUseError.set('')
  try {
    computerUse.set(await getComputerUseStatus(profile))
  } catch (e) {
    computerUseError.set(e instanceof Error ? e.message : 'No se pudo consultar computer use')
  } finally {
    computerUseLoading.set(false)
  }
}

export async function loadToolsets(profile: string): Promise<void> {
  toolsetsLoading.set(true)
  toolsetError.set('')
  try {
    const rows = await getToolsets(profile)
    toolsets.set(rows.filter(row => row.name === 'computer_use' || row.name === 'browser'))
  } catch (e) {
    toolsetError.set(e instanceof Error ? e.message : 'No se pudieron cargar los toolsets')
  } finally {
    toolsetsLoading.set(false)
  }
}

export async function setToolset(profile: string, name: string, enabled: boolean): Promise<void> {
  toolsetBusy.set(name)
  try {
    await toggleToolset(name, enabled, profile)
    await loadToolsets(profile)
    if (name === 'computer_use') await loadComputerUse(profile)
  } finally {
    toolsetBusy.set('')
  }
}

export async function loadActiveSessions(profile: string): Promise<void> {
  sessionsLoading.set(true)
  sessionsError.set('')
  try {
    activeSessions.set(await listActiveSessions(profile))
  } catch (e) {
    sessionsError.set(e instanceof Error ? e.message : 'No se pudieron listar las tareas en curso')
  } finally {
    sessionsLoading.set(false)
  }
}

export async function stopSession(profile: string, sessionId: string): Promise<void> {
  interruptBusy.set(sessionId)
  let message = ''
  try {
    await interruptSession(sessionId, profile)
  } catch (e) {
    message = e instanceof Error ? e.message : 'No se pudo detener la tarea'
  } finally {
    interruptBusy.set('')
    await loadActiveSessions(profile)
  }
  if (message) sessionsError.set(message)
}
