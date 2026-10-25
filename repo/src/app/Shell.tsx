import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ProfilesPage } from '../features/bots/ProfilesPage'
import { ChatPage } from '../features/chat/ChatPage'
import { ConnectorsPage } from '../features/connectors/ConnectorsPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { BottomNav } from './BottomNav'
import { ReconnectBanner } from './ReconnectBanner'
import { UiPage } from '../ui/UiPage'

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
          <Route path="/connectors" element={<ConnectorsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {import.meta.env.DEV && <Route path="/__ui" element={<UiPage />} />}
        </Routes>
      </div>
      {!isChat && <BottomNav />}
    </>
  )
}
