import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
// Mono: JetBrains Mono (OFL), latin 400/700 only.
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-700.css'
// Wordmark candidates (all OFL), latin + single weight each so the PWA stays
// small. The chosen face is applied via --font-display; the other two load
// only for the /__ui picker.
import '@fontsource/bodoni-moda/latin-700.css'
import '@fontsource/playfair-display/latin-700.css'
import '@fontsource/dm-serif-display/latin-400.css'
import './index.css'
import { App } from './app/App.tsx'
import { captureInstallPrompt } from './features/install/install-prompt'

// Chromium fires `beforeinstallprompt` right after load — long before the
// invite mounts (after login). Listen from the very first tick or it's lost.
captureInstallPrompt()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
