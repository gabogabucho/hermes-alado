import { Route, Routes } from 'react-router-dom'
import { ChatPage } from '../features/chat/ChatPage'
import { CatalogPage } from '../features/connectors/CatalogPage'
import { ConnectorDetailPage } from '../features/connectors/ConnectorDetailPage'
import { HomePage } from '../features/home/HomePage'
import { LibraryPage } from '../features/library/LibraryPage'
import { RoutineDetailPage } from '../features/routines/RoutineDetailPage'
import { RoutinesPage } from '../features/routines/RoutinesPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { WorkingPage } from '../features/working/WorkingPage'
import { ReconnectBanner } from './ReconnectBanner'

export function Shell() {
  return (
    <>
      <ReconnectBanner />
      <div className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat/:profile" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/connectors" element={<CatalogPage />} />
          <Route path="/connectors/:family/:id" element={<ConnectorDetailPage />} />
          <Route path="/bots/:profile/routines" element={<RoutinesPage />} />
          <Route path="/bots/:profile/routines/:id" element={<RoutineDetailPage />} />
          <Route path="/bots/:profile/library" element={<LibraryPage />} />
          <Route path="/bots/:profile/working" element={<WorkingPage />} />
        </Routes>
      </div>
    </>
  )
}
