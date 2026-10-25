import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APP_DESCRIPTION, APP_NAME } from './src/app/brand.ts'

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
      // Custom service worker (src/sw.ts): generateSW cannot carry the push /
      // notificationclick handlers that Web Push needs.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // El registro inyectado usa type:'classic' (register.js de
        // vite-plugin-pwa), así que el SW se compila como script clásico.
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        // Precache manifests can grow past workbox's 2 MiB default with fonts.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      includeAssets: ['favicon.svg', 'icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: APP_NAME,
        short_name: APP_NAME,
        description: APP_DESCRIPTION,
        theme_color: '#0d1117',
        background_color: '#0d1117',
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
