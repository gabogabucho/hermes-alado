import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { LoginPage } from '../features/auth/LoginPage'
import { authStatus, checkAuth } from '../features/auth/store'
import { loadActiveProfile } from '../features/bots/store'
import { close, connect } from '../lib/hermes/connection'
import { verifyContractCommit } from '../lib/hermes/contract-version'
import { UiPage } from '../ui/UiPage'
import { Shell } from './Shell'

export function App() {
  const status = useStore(authStatus)

  useEffect(() => {
    void checkAuth()
  }, [])

  useEffect(() => {
    if (status !== 'authed') return
    void loadActiveProfile()
    void verifyContractCommit()
    void connect()
    return () => close()
  }, [status])

  // Dev-only design-system gallery: reviewable without logging in.
  if (import.meta.env.DEV && window.location.pathname === '/__ui') {
    return (
      <div className="app-shell">
        <UiPage />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        {status === 'checking' ? (
          <div className="app-main centered">
            <p className="muted">Conectando con Hermes…</p>
          </div>
        ) : status === 'authed' ? (
          <Shell />
        ) : (
          <LoginPage />
        )}
      </div>
    </BrowserRouter>
  )
}
