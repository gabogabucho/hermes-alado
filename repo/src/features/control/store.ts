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
import { activeProfile, loadActiveProfile } from '../home/store'

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

export function controlProfile(): string {
  return activeProfile.get() || 'default'
}

export async function loadApproval(): Promise<void> {
  approvalLoading.set(true)
  approvalError.set('')
  try {
    const config = await getConfig(controlProfile())
    approvalMode.set(readApprovalMode(config) ?? 'smart')
  } catch (e) {
    approvalError.set(e instanceof Error ? e.message : 'No se pudo leer la configuración')
  } finally {
    approvalLoading.set(false)
  }
}

/** ON = pedir aprobación (manual); OFF = no pedir (off). */
export async function saveApproval(on: boolean): Promise<void> {
  approvalSaving.set(true)
  try {
    await setApprovalMode(on ? 'manual' : 'off', controlProfile())
    approvalMode.set(on ? 'manual' : 'off')
  } finally {
    approvalSaving.set(false)
  }
}

export async function loadComputerUse(): Promise<void> {
  computerUseLoading.set(true)
  computerUseError.set('')
  try {
    computerUse.set(await getComputerUseStatus(controlProfile()))
  } catch (e) {
    computerUseError.set(e instanceof Error ? e.message : 'No se pudo consultar computer use')
  } finally {
    computerUseLoading.set(false)
  }
}

export async function loadToolsets(): Promise<void> {
  toolsetsLoading.set(true)
  toolsetError.set('')
  try {
    const rows = await getToolsets(controlProfile())
    toolsets.set(rows.filter(row => row.name === 'computer_use' || row.name === 'browser'))
  } catch (e) {
    toolsetError.set(e instanceof Error ? e.message : 'No se pudieron cargar los toolsets')
  } finally {
    toolsetsLoading.set(false)
  }
}

export async function setToolset(name: string, enabled: boolean): Promise<void> {
  toolsetBusy.set(name)
  try {
    await toggleToolset(name, enabled, controlProfile())
    await loadToolsets()
    if (name === 'computer_use') await loadComputerUse()
  } finally {
    toolsetBusy.set('')
  }
}

export async function loadActiveSessions(): Promise<void> {
  sessionsLoading.set(true)
  sessionsError.set('')
  try {
    activeSessions.set(await listActiveSessions(controlProfile()))
  } catch (e) {
    sessionsError.set(e instanceof Error ? e.message : 'No se pudieron listar las tareas en curso')
  } finally {
    sessionsLoading.set(false)
  }
}

export async function stopSession(sessionId: string): Promise<void> {
  interruptBusy.set(sessionId)
  let message = ''
  try {
    await interruptSession(sessionId, controlProfile())
  } catch (e) {
    message = e instanceof Error ? e.message : 'No se pudo detener la tarea'
  } finally {
    interruptBusy.set('')
    await loadActiveSessions()
  }
  if (message) sessionsError.set(message)
}

export async function loadControl(): Promise<void> {
  await loadActiveProfile()
  await Promise.all([loadApproval(), loadComputerUse(), loadToolsets(), loadActiveSessions()])
}
