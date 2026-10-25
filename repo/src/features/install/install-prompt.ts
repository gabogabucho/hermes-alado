/**
 * Install invite plumbing: capture the Chromium `beforeinstallprompt` event,
 * detect standalone/iOS, and remember dismissals in localStorage (per device).
 *
 * Rules (phase 9 brief):
 * - Never show when already standalone (`display-mode: standalone` or
 *   `navigator.standalone`).
 * - Remember the dismissal per device; re-offer after 14 days AT MOST ONCE
 *   (a second dismissal is final).
 * - iOS Safari never fires `beforeinstallprompt`: the sheet shows manual steps.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = false

type PromptListener = () => void
const promptListeners = new Set<PromptListener>()

function notifyPromptListeners(): void {
  for (const listener of [...promptListeners]) listener()
}

/** Subscribe to `beforeinstallprompt` arrivals (Android — fires asynchronously). */
export function onInstallPromptCaptured(listener: PromptListener): () => void {
  promptListeners.add(listener)
  return () => promptListeners.delete(listener)
}

const DISMISSED_AT_KEY = 'droidbot.installDismissedAt'
const DISMISS_COUNT_KEY = 'droidbot.installDismissCount'
const RE_OFFER_MS = 14 * 24 * 60 * 60 * 1000
const MAX_OFFERS = 2

/** Register the listeners once (idempotent). Call from the app shell. */
export function captureInstallPrompt(): void {
  if ((window as unknown as { __installPromptCaptured?: boolean }).__installPromptCaptured) return
  ;(window as unknown as { __installPromptCaptured?: boolean }).__installPromptCaptured = true

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    notifyPromptListeners()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferredPrompt = null
  })
}

/** Whether the PWA is already running as an installed app. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const standaloneNav = (navigator as unknown as { standalone?: boolean }).standalone === true
  return standaloneNav || window.matchMedia('(display-mode: standalone)').matches
}

/** iOS Safari (no install event — manual steps only). */
export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** Android/Chromium where `beforeinstallprompt` can fire. */
export function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent)
}

/** A platform we can offer the invite for at all. */
export function installablePlatform(): boolean {
  return isIOS() || isAndroid()
}

function readDismissals(): { at: number; count: number } {
  try {
    const at = Number(localStorage.getItem(DISMISSED_AT_KEY) ?? 0)
    const count = Number(localStorage.getItem(DISMISS_COUNT_KEY) ?? 0)
    return { at: Number.isFinite(at) ? at : 0, count: Number.isFinite(count) ? count : 0 }
  } catch {
    return { at: 0, count: 0 }
  }
}

/** Whether the first-run invite should appear right now. */
export function shouldOfferInstall(): boolean {
  if (isStandalone() || installed || !installablePlatform()) return false
  const { at, count } = readDismissals()
  if (count === 0) return true
  if (count >= MAX_OFFERS) return false
  return at > 0 && Date.now() - at >= RE_OFFER_MS
}

/** The user said "Ahora no": remember, re-offer once after 14 days. */
export function dismissInstall(): void {
  try {
    const { count } = readDismissals()
    localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()))
    localStorage.setItem(DISMISS_COUNT_KEY, String(count + 1))
  } catch {
    // storage unavailable; the invite may reappear next load — acceptable
  }
}

/** True when this device can install via the captured native prompt. */
export function canNativeInstall(): boolean {
  return deferredPrompt !== null
}

/** Fire the native install prompt; false when unavailable (iOS/edge cases). */
export async function triggerInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  const promptEvent = deferredPrompt
  deferredPrompt = null
  await promptEvent.prompt()
  const choice = await promptEvent.userChoice
  if (choice.outcome === 'accepted') installed = true
  return choice.outcome === 'accepted'
}
