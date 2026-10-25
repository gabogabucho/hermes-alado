import { Route, Routes } from 'react-router-dom'
import { ChatPage } from '../features/chat/ChatPage'
import { ConnectorsPage } from '../features/connectors/ConnectorsPage'
import { ControlPage } from '../features/control/ControlPage'
import { HomePage } from '../features/home/HomePage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { VaultKeyPage } from '../features/vault/VaultKeyPage'
import { VaultPage } from '../features/vault/VaultPage'
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
          <Route path="/settings/vault" element={<VaultPage />} />
          <Route path="/settings/vault/:key" element={<VaultKeyPage />} />
          <Route path="/settings/control" element={<ControlPage />} />
          <Route path="/connectors" element={<ConnectorsPage />} />
        </Routes>
      </div>
    </>
  )
}
