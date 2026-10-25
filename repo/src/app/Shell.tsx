import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ProfilesPage } from '../features/bots/ProfilesPage'
import { ChatPage } from '../features/chat/ChatPage'
import { CatalogPage } from '../features/connectors/CatalogPage'
import { ConnectorDetailPage } from '../features/connectors/ConnectorDetailPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { BottomNav } from './BottomNav'
import { ReconnectBanner } from './ReconnectBanner'

export function Shell() {
  const location = useLocation()
  const isChat = location.pathname.startsWith('/chat/')

  return (
    <>
      <ReconnectBanner />
      <div className={isChat ? 'app-main chat' : 'app-main'}>
        <Routes>
          <Route path="/" element={<Navigate to="/profiles" replace />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/chat/:name" element={<ChatPage />} />
          <Route path="/connectors" element={<CatalogPage />} />
          <Route path="/connectors/:family/:id" element={<ConnectorDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
      {!isChat && <BottomNav />}
    </>
  )
}
