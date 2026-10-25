/**
 * Web Push para la PWA (cliente del plugin Hermes `droidbot-push`).
 *
 * - Feature-detect de Push API + iOS PWA (Web Push requiere la app instalada
 *   en iOS/iPadOS 16.4+).
 * - `requestNotificationPermission` SOLO se llama en gesto de usuario (el
 *   master switch de Ajustes → Notificaciones).
 * - `subscribeToPush` pide la llave VAPID al plugin, suscribe el PushManager y
 *   registra la suscripción en el backend.
 * - `unsubscribeFromPush` baja la suscripción local y la borra del backend.
 *
 * No hay secretos en storage local: solo el `device_id` anónimo.
 */
import { apiFetch, ApiError } from './api'

const DEVICE_ID_KEY = 'droidbot.deviceId'

export type PushPrefs = { termina: boolean; necesita: boolean }

export type PushPrefMap = Record<string, PushPrefs>

export type PluginInfo = { key: string; installed: boolean }

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'not-installed' | 'not-supported-ios' | 'error'; message: string }

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isIos(): boolean {
  return /iP(hone|ad|od)/.test(navigator.userAgent) || navigator.platform === 'MacIntel'
}

/** iOS Web Push necesita la PWA instalada (display standalone). */
export function isIosStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

export function iosNeedsInstall(): boolean {
  return isIos() && !isIosStandalone()
}

export function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, fresh)
    return fresh
  } catch {
    return crypto.randomUUID()
  }
}

function deviceLabel(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } }
  const ua = nav.userAgentData
  if (ua?.platform) return ua.mobile ? `${ua.platform} móvil` : ua.platform
  return isIos() ? 'iPhone/iPad' : 'Android/desktop'
}

/** Decodifica la llave VAPID base64url (sin padding) a bytes. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const normalized = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  const binary = atob(normalized)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function notificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

/** GET /api/plugins/droidbot-push/vapid-public-key → info del plugin. */
export async function fetchPluginInfo(): Promise<PluginInfo> {
  try {
    const res = await apiFetch<{ key: string }>('/api/plugins/droidbot-push/vapid-public-key')
    return { key: res.key ?? '', installed: true }
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 503)) {
      return { key: '', installed: false }
    }
    throw err
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/**
 * Pide permiso y suscribe. Debe llamarse desde un gesto de usuario.
 * El permiso se pide acá mismo (una sola vez); si ya está otorgado no vuelve
 * a preguntar.
 */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!pushSupported()) {
    return { ok: false, reason: 'unsupported', message: 'Este navegador no soporta notificaciones push.' }
  }
  if (iosNeedsInstall()) {
    return { ok: false, reason: 'not-supported-ios', message: 'Instalá la app para recibir notificaciones.' }
  }
  const info = await fetchPluginInfo()
  if (!info.installed) {
    return { ok: false, reason: 'not-installed', message: 'Las notificaciones requieren el complemento del servidor.' }
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied', message: 'Permiso de notificaciones denegado.' }
  }
  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(info.key),
      })
    }
    await registerSubscription(subscription)
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'No se pudo suscribir a las notificaciones.',
    }
  }
}

export async function registerSubscription(subscription: PushSubscription): Promise<void> {
  const raw = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  await apiFetch('/api/plugins/droidbot-push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: raw.endpoint,
      p256dh: raw.keys?.p256dh,
      auth: raw.keys?.auth,
      device_id: deviceId(),
      device_label: deviceLabel(),
    }),
  })
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getCurrentSubscription()
  if (subscription) {
    const raw = subscription.toJSON() as { endpoint?: string }
    await subscription.unsubscribe()
    if (raw.endpoint) {
      try {
        await apiFetch('/api/plugins/droidbot-push/subscribe', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: raw.endpoint }),
        })
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err
      }
    }
  }
}

export async function sendTestPush(): Promise<void> {
  await apiFetch('/api/plugins/droidbot-push/test', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId() }),
  })
}

export async function fetchPrefs(): Promise<PushPrefMap> {
  const res = await apiFetch<{ prefs?: PushPrefMap }>('/api/plugins/droidbot-push/prefs')
  return res.prefs ?? {}
}

export async function saveProfilePrefs(profile: string, prefs: Partial<PushPrefs>): Promise<void> {
  await apiFetch('/api/plugins/droidbot-push/prefs', {
    method: 'PUT',
    body: JSON.stringify({ profile, ...prefs }),
  })
}

export function defaultPrefs(): PushPrefs {
  return { termina: true, necesita: true }
}
