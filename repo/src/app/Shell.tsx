import { Route, Routes } from 'react-router-dom'
import { ChatPage } from '../features/chat/ChatPage'
import { CatalogPage } from '../features/connectors/CatalogPage'
import { ConnectorDetailPage } from '../features/connectors/ConnectorDetailPage'
import { ControlPage } from '../features/control/ControlPage'
import { GroupChatPage } from '../features/groups/GroupChatPage'
import { NewGroupPage } from '../features/groups/NewGroupPage'
import { HomePage } from '../features/home/HomePage'
import { LibraryPage } from '../features/library/LibraryPage'
import { RoutineDetailPage } from '../features/routines/RoutineDetailPage'
import { RoutinesPage } from '../features/routines/RoutinesPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { VaultKeyPage } from '../features/vault/VaultKeyPage'
import { VaultPage } from '../features/vault/VaultPage'
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
          <Route path="/group/:roomId" element={<GroupChatPage />} />
          <Route path="/groups/new" element={<NewGroupPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/vault" element={<VaultPage />} />
          <Route path="/settings/vault/:key" element={<VaultKeyPage />} />
          <Route path="/settings/control" element={<ControlPage />} />
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
