import { atom } from 'nanostores'
import { on } from '../../lib/hermes/connection'
import { displayStatus } from '../../lib/hermes/display'
import type { DisplayStatus } from '../../lib/hermes/vendor/gateway-contract.generated'

/**
 * Computadora (Bot Desktop) state for one profile at a time: the
 * `display.status` snapshot plus pushed `display.status` / `display.lease`
 * events. Events are global on the gateway socket, so they are accepted only
 * for the profile currently being watched (same `profile_key` filter the
 * desktop's screen-state uses). The lease is part of every snapshot; the
 * live viewer page and the bot-profile row both read from here.
 */

export type ComputerRowStatus = 'active' | 'inactive' | 'not-installed'

export const computerDetail = atom<DisplayStatus | null>(null)
export const computerLoading = atom<boolean>(false)
export const computerError = atom<string>('')

let watchKey: string | null = null

/** The bot-profile row label: Activo / Inactivo / Sin instalar. */
export function computerRowStatus(detail: DisplayStatus | null): ComputerRowStatus | null {
  if (!detail) return null
  if (!detail.installed) return 'not-installed'
  return detail.running ? 'active' : 'inactive'
}

function eventMatches(key: string | null | undefined): boolean {
  if (!key) return false
  if (!watchKey) return true
  return key === watchKey
}

/** Adopt a snapshot from a call result (status/start/observe) or a pushed
 *  `display.status` event, keeping the watch pinned to its profile. */
export function applyDisplayStatus(status: DisplayStatus): void {
  if (status.profile_key) watchKey = status.profile_key
  computerDetail.set(status)
}

export async function loadComputer(profile: string): Promise<void> {
  computerLoading.set(true)
  computerError.set('')
  try {
    applyDisplayStatus(await displayStatus(profile))
  } catch (e) {
    computerError.set(e instanceof Error ? e.message : 'No se pudo cargar la computadora')
    computerDetail.set(null)
  } finally {
    computerLoading.set(false)
  }
}

// A start/stop made elsewhere (CLI, gateway auto-start, the desktop app) is
// pushed by the serve-side runtime watcher; a lease flip is broadcast to
// every connected client. Both repaint the row and the viewer.
on('display.status', event => {
  const payload = event.payload
  if (!payload || !eventMatches(payload.profile_key)) return
  applyDisplayStatus(payload)
})

on('display.lease', event => {
  const payload = event.payload
  if (!payload || !eventMatches(payload.profile_key)) return
  const current = computerDetail.get()
  if (!current) return
  computerDetail.set({ ...current, lease: payload.lease })
})
