import { Route, Routes } from 'react-router-dom'
import { ChatPage } from '../features/chat/ChatPage'
import { ConnectorsPage } from '../features/connectors/ConnectorsPage'
import { GroupChatPage } from '../features/groups/GroupChatPage'
import { NewGroupPage } from '../features/groups/NewGroupPage'
import { HomePage } from '../features/home/HomePage'
import { SettingsPage } from '../features/settings/SettingsPage'
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
          <Route path="/connectors" element={<ConnectorsPage />} />
        </Routes>
      </div>
    </>
  )
}
