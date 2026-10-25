import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ProfilesPage } from '../features/bots/ProfilesPage'
import { ChatPage } from '../features/chat/ChatPage'
import { ConnectorsPage } from '../features/connectors/ConnectorsPage'
import { LibraryPage } from '../features/library/LibraryPage'
import { RoutineDetailPage } from '../features/routines/RoutineDetailPage'
import { RoutinesPage } from '../features/routines/RoutinesPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { WorkingPage } from '../features/working/WorkingPage'
import { BottomNav } from './BottomNav'
import { ReconnectBanner } from './ReconnectBanner'

export function Shell() {
  const location = useLocation()
  const isChat = location.pathname.startsWith('/chat/')
  const isSubScreen = location.pathname.startsWith('/bots/')

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
          <Route path="/bots/:profile/routines" element={<RoutinesPage />} />
          <Route path="/bots/:profile/routines/:id" element={<RoutineDetailPage />} />
          <Route path="/bots/:profile/library" element={<LibraryPage />} />
          <Route path="/bots/:profile/working" element={<WorkingPage />} />
        </Routes>
      </div>
      {!isChat && !isSubScreen && <BottomNav />}
    </>
  )
}
