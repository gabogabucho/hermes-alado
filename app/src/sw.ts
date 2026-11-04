/// <reference lib="webworker" />
// Service worker de DroidBot (injectManifest). Mantiene el precache de la PWA,
// el fallback de navegación SPA (con el denylist de rutas de Hermes) y agrega
// los handlers de Web Push: `push` (mostrar) y `notificationclick` (abrir la
// URL profunda: /chat/<perfil> o /group/<sala>).

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { respondApproval, type PushApproval } from './sw-approval'

declare let self: ServiceWorkerGlobalScope

// Lo inyecta workbox (vite-plugin-pwa injectManifest).
declare const __WB_MANIFEST: Array<{ url: string; revision: string | null }>

// A new version takes over as soon as it is installed: an installed Android PWA
// is almost never fully closed, so "wait until every tab is gone" meant a fix
// could sit unused for days. The page reloads itself on the switch (main.tsx).
self.addEventListener('install', () => {
  void self.skipWaiting()
})
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim())
})

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Los chunks lazy excluidos del precache (noVNC + pantalla de computadora en
// vivo, ~1.4 MB) se cachean en runtime al primer uso. CacheFirst: los nombres
// de chunk llevan hash, así que una URL nueva siempre revalida sola.
registerRoute(
  ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
  new CacheFirst({ cacheName: 'runtime-assets' }),
)

// Mismo comportamiento que el generateSW anterior: la SPA responde las
// navegaciones, pero nunca las rutas que Hermes posee (login, OAuth, API).
// Paths that look like files (/demo.mp4, /logo.png…) are real files, never app routes.
const denylist = [/^\/api\//, /^\/auth\//, /^\/login/, /^\/dashboard-plugins\//, /\/[^/]+\.[a-z0-9]{2,5}$/i]
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist }))

type PushPayload = {
  title?: string
  body?: string
  url?: string
  tag?: string
  approval?: PushApproval
  actions?: Array<{ action: string; title: string }>
  confirm?: { approve?: string; reject?: string }
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
  const title = payload.title ?? 'Alado'
  const url = safeUrl(payload.url)
  const options: NotificationOptions & {
    data?: { url: string | null; approval?: PushApproval; confirm?: { approve?: string; reject?: string } }
    actions?: Array<{ action: string; title: string }>
  } = {
    body: payload.body ?? '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag ?? 'droidbot',
    data: { url, approval: payload.approval, confirm: payload.confirm },
  }
  // Aprobaciones: botones Approve/Reject que responde el SW sin abrir la app
  // (Android/Chrome; iOS no soporta actions y el tap abre el chat como siempre).
  if (payload.approval && Array.isArray(payload.actions) && payload.actions.length > 0) {
    options.actions = payload.actions.slice(0, 2)
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

/** Abre (o enfoca) la ventana del app en `url`. */
async function openApp(url: string): Promise<void> {
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
}

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  const data =
    (event.notification.data as
      { url?: string; approval?: PushApproval; confirm?: { approve?: string; reject?: string } }
      | null) ?? {}
  const url = safeUrl(data.url) ?? '/'

  // Botón Approve/Reject: resolver por websocket y avisar el resultado.
  if (event.action === 'approve' || event.action === 'reject') {
    event.notification.close()
    const approval = data.approval
    if (!approval) {
      event.waitUntil(openApp(url))
      return
    }
    const approved = event.action === 'approve'
    const choice = approved ? 'once' : 'deny'
    const confirmBody = approved
      ? (data.confirm?.approve ?? '✓ Approved')
      : (data.confirm?.reject ?? '✗ Rejected')
    event.waitUntil(
      (async () => {
        let resolved = false
        try {
          resolved = await respondApproval(approval, choice)
        } catch {
          resolved = false
        }
        if (resolved) {
          // Confirmación silenciosa: reemplaza la notificación tapeada.
          await self.registration.showNotification(event.notification.title ?? 'Alado', {
            body: confirmBody,
            icon: '/icon-192.png',
            tag: event.notification.tag,
            data: { url },
          })
          return
        }
        // No se pudo resolver sin la app: abrir el chat para responder a mano.
        await openApp(url)
      })(),
    )
    return
  }

  event.notification.close()
  event.waitUntil(openApp(url))
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
