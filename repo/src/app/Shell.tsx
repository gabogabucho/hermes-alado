import { Route, Routes } from 'react-router-dom'
import { BotProfileEditPage } from '../features/bot-profile/BotProfileEditPage'
import { BotProfilePage } from '../features/bot-profile/BotProfilePage'
import { ChatPage } from '../features/chat/ChatPage'
import { ConnectorsPage } from '../features/connectors/ConnectorsPage'
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
          <Route path="/bots/:profile" element={<BotProfilePage />} />
          <Route path="/bots/:profile/edit" element={<BotProfileEditPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/connectors" element={<ConnectorsPage />} />
        </Routes>
      </div>
    </>
  )
}
