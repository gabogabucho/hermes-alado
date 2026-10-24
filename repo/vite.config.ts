import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const proxyTarget = process.env.HERMES_URL || 'http://localhost:9119'

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
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: true, ws: true },
      '/auth': { target: proxyTarget, changeOrigin: true },
      '/login': { target: proxyTarget, changeOrigin: true },
    },
  },
})
