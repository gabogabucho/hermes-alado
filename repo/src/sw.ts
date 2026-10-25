/// <reference lib="webworker" />
// Service worker de DroidBot (injectManifest). Mantiene el precache de la PWA,
// el fallback de navegación SPA (con el denylist de rutas de Hermes) y agrega
// los handlers de Web Push: `push` (mostrar) y `notificationclick` (abrir la
// URL profunda: /chat/<perfil> o /group/<sala>).

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

// Lo inyecta workbox (vite-plugin-pwa injectManifest).
declare const __WB_MANIFEST: Array<{ url: string; revision: string | null }>

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Mismo comportamiento que el generateSW anterior: la SPA responde las
// navegaciones, pero nunca las rutas que Hermes posee (login, OAuth, API).
const denylist = [/^\/api\//, /^\/auth\//, /^\/login/, /^\/dashboard-plugins\//]
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist }))

type PushPayload = {
  title?: string
  body?: string
  url?: string
  tag?: string
}

function safeUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value, self.location.origin)
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : null
  } catch {
    return null
  }
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {}
  try {
    payload = (event.data?.json() ?? {}) as PushPayload
  } catch {
    payload = {}
  }
  const title = payload.title ?? 'DroidBot'
  const url = safeUrl(payload.url)
  const options: NotificationOptions & { data?: { url: string | null } } = {
    body: payload.body ?? '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag ?? 'droidbot',
    data: { url },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = safeUrl((event.notification.data as { url?: string } | null)?.url) ?? '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = all.find(client => client.url.startsWith(self.location.origin))
      if (open) {
        await open.focus()
        try {
          await open.navigate(url)
        } catch {
          await self.clients.openWindow(url)
        }
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})

self.addEventListener('pushsubscriptionchange', (event: ExtendableEvent) => {
  // VAPID rotó / el navegador cambió la suscripción: avisarle al servidor.
  event.waitUntil(
    (async () => {
      const sub = await self.registration.pushManager.getSubscription()
      if (!sub) return
      const raw = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      await fetch('/api/plugins/droidbot-push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: raw.endpoint,
          p256dh: raw.keys?.p256dh,
          auth: raw.keys?.auth,
        }),
      })
    })(),
  )
})

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
