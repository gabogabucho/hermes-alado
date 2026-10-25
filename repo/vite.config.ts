import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const proxyTarget = process.env.HERMES_URL || 'https://droidbot.gabrielurrutia.com.ar'
const targetOrigin = new URL(proxyTarget).origin

/**
 * Shared proxy behaviour for the Hermes dashboard routes:
 * - `changeOrigin` rewrites `Host`; the explicit `origin` header rewrite covers
 *   the WS-upgrade Origin guard (`_ws_host_origin_reason` in Hermes) and any
 *   non-GET REST check.
 * - Absolute `Location` headers (login redirects) are rewritten back to the dev
 *   origin so the `next=` round-trip lands on `localhost`, not the remote host.
 */
function hermesProxy(options: ProxyOptions = {}): ProxyOptions {
  return {
    target: proxyTarget,
    changeOrigin: true,
    secure: true,
    configure(proxy) {
      proxy.on('proxyReq', (proxyReq, req) => {
        if (req.method && req.method !== 'GET') {
          proxyReq.setHeader('origin', targetOrigin)
        }
      })
      proxy.on('proxyReqWs', proxyReq => {
        proxyReq.setHeader('origin', targetOrigin)
      })
      proxy.on('proxyRes', proxyRes => {
        const loc = proxyRes.headers.location
        if (typeof loc === 'string' && loc.startsWith(targetOrigin)) {
          proxyRes.headers.location = loc.slice(targetOrigin.length)
        }
      })
    },
    ...options,
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'Hermes',
        short_name: 'Hermes',
        description: 'Tu agente Hermes en el bolsillo',
        theme_color: '#17120c',
        background_color: '#17120c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/api': hermesProxy({ ws: true }),
      '/auth': hermesProxy(),
      '/login': hermesProxy(),
      '/__hermes_root': hermesProxy({
        rewrite: p => p.replace(/^\/__hermes_root/, '') || '/',
      }),
    },
  },
})
