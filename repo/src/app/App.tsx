import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { authStatus, checkAuth } from '../store/auth'
import { loadActiveProfile } from '../store/profiles'
import { BottomNav } from '../components/BottomNav'
import { LoginPage } from './pages/LoginPage'
import { ProfilesPage } from './pages/ProfilesPage'
import { ChatPage } from './pages/ChatPage'
import { ConnectorsPage } from './pages/ConnectorsPage'
import { SettingsPage } from './pages/SettingsPage'

function Shell() {
  const location = useLocation()
  const isChat = location.pathname.startsWith('/chat/')

  return (
    <>
      <div className={isChat ? 'app-main chat' : 'app-main'}>
        <Routes>
          <Route path="/" element={<Navigate to="/profiles" replace />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/chat/:name" element={<ChatPage />} />
          <Route path="/connectors" element={<ConnectorsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
      {!isChat && <BottomNav />}
    </>
  )
}

export function App() {
  const status = useStore(authStatus)

  useEffect(() => {
    void checkAuth()
  }, [])

  useEffect(() => {
    if (status === 'authed') void loadActiveProfile()
  }, [status])

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
