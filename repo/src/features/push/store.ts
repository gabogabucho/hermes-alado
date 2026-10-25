/**
 * Estado de notificaciones push para la PWA.
 *
 * - `refreshPushStatus`: plugin instalado (GET vapid-public-key), suscripción
 *   del dispositivo (PushManager) y permiso.
 * - `setMasterEnabled`: master switch del dispositivo (Ajustes → Notificaciones).
 * - `loadPrefsForProfile` / `savePrefsForProfile`: per-bot "Cuando termine" /
 *   "Cuando te necesite" (BotProfile).
 *
 * El permiso SOLO se pide dentro de `setMasterEnabled`, que se dispara desde
 * el gesto del usuario sobre el switch.
 */
export { defaultPrefs } from '../../lib/push'
import { atom } from 'nanostores'
import {
  defaultPrefs,
  fetchPluginInfo,
  fetchPrefs,
  getCurrentSubscription,
  iosNeedsInstall,
  notificationPermission,
  pushSupported,
  saveProfilePrefs,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
  type PushPrefMap,
  type PushPrefs,
  type SubscribeResult,
} from '../../lib/push'

export type PushSetup =
  | { state: 'unsupported' }
  | { state: 'ios-install' }
  | { state: 'no-plugin' }
  | { state: 'permission-denied' }
  | { state: 'off' }
  | { state: 'on' }

export const pushSetup = atom<PushSetup | null>(null)
export const pushBusy = atom(false)
export const pushTested = atom(false)
export const pushError = atom('')
export const pushPrefs = atom<PushPrefMap>({})

export async function refreshPushStatus(): Promise<void> {
  if (!pushSupported()) {
    pushSetup.set({ state: 'unsupported' })
    return
  }
  if (iosNeedsInstall()) {
    pushSetup.set({ state: 'ios-install' })
    return
  }
  try {
    const [info, subscription] = await Promise.all([fetchPluginInfo(), getCurrentSubscription()])
    if (!info.installed) {
      pushSetup.set({ state: 'no-plugin' })
      return
    }
    if (notificationPermission() === 'denied') {
      pushSetup.set({ state: 'permission-denied' })
      return
    }
    pushSetup.set(subscription ? { state: 'on' } : { state: 'off' })
  } catch {
    pushSetup.set({ state: 'no-plugin' })
  }
}

export async function setMasterEnabled(enabled: boolean): Promise<void> {
  pushBusy.set(true)
  pushError.set('')
  try {
    if (enabled) {
      const result: SubscribeResult = await subscribeToPush()
      if (result.ok) {
        pushSetup.set({ state: 'on' })
      } else if (result.reason === 'not-installed') {
        pushSetup.set({ state: 'no-plugin' })
        pushError.set(result.message)
      } else if (result.reason === 'denied') {
        pushSetup.set({ state: 'permission-denied' })
        pushError.set(result.message)
      } else if (result.reason === 'not-supported-ios') {
        pushSetup.set({ state: 'ios-install' })
      } else {
        pushSetup.set({ state: 'off' })
        pushError.set(result.message)
      }
    } else {
      await unsubscribeFromPush()
      pushSetup.set({ state: 'off' })
    }
  } finally {
    pushBusy.set(false)
  }
}

export async function testPush(): Promise<void> {
  pushBusy.set(true)
  pushError.set('')
  try {
    await sendTestPush()
    pushTested.set(true)
  } catch (err) {
    pushError.set(err instanceof Error ? err.message : 'No se pudo enviar la prueba.')
  } finally {
    pushBusy.set(false)
  }
}

export function prefsFor(profile: string): PushPrefs {
  return { ...defaultPrefs(), ...(pushPrefs.get()[profile] ?? {}) }
}

export async function loadPrefs(): Promise<void> {
  try {
    pushPrefs.set(await fetchPrefs())
  } catch {
    pushPrefs.set({})
  }
}

export async function savePrefsForProfile(profile: string, prefs: Partial<PushPrefs>): Promise<void> {
  const previous = prefsFor(profile)
  const next = { ...previous, ...prefs }
  pushPrefs.set({ ...pushPrefs.get(), [profile]: next })
  try {
    await saveProfilePrefs(profile, prefs)
  } catch {
    // revert al estado previo si el servidor rechazó
    pushPrefs.set({ ...pushPrefs.get(), [profile]: previous })
    throw new Error('No se pudo guardar la preferencia.')
  }
}
