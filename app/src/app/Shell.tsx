import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ErrorBoundary, ScreenCrash } from '../ui/ErrorBoundary'
import { BotBrainPage } from '../features/bot-profile/BotBrainPage'
import { BotMemoryPage } from '../features/bot-profile/BotMemoryPage'
import { BotSkillsPage } from '../features/bot-profile/BotSkillsPage'
import { BotProfileEditPage } from '../features/bot-profile/BotProfileEditPage'
import { BotProfilePage } from '../features/bot-profile/BotProfilePage'
import { ChatPage } from '../features/chat/ChatPage'
import { SecurePromptHost } from '../features/chat/SecurePromptSheet'
import { ToastHost } from '../ui/Toast'
import { ComputerPage } from '../features/computer/ComputerPage'
import { CatalogPage } from '../features/connectors/CatalogPage'
import { ConnectorDetailPage } from '../features/connectors/ConnectorDetailPage'
import { ApprovalsPage } from '../features/control/ApprovalsPage'
import { ToolsPage } from '../features/control/ToolsPage'
import { GroupChatPage } from '../features/groups/GroupChatPage'
import { NewGroupPage } from '../features/groups/NewGroupPage'
import { HealthPage } from '../features/health/HealthPage'
import { HomePage } from '../features/home/HomePage'
import { activeProfile, featuredBotName } from '../features/home/store'
import { ImportPage } from '../features/import/ImportPage'
import { InstallInvite } from '../features/install/InstallInvite'
import { LibraryPage } from '../features/library/LibraryPage'
import { RoutineDetailPage } from '../features/routines/RoutineDetailPage'
import { RoutinesPage } from '../features/routines/RoutinesPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { VaultKeyPage } from '../features/vault/VaultKeyPage'
import { VaultPage } from '../features/vault/VaultPage'
import { WorkingPage } from '../features/working/WorkingPage'
import { useT } from '../i18n'
import { ReconnectBanner } from './ReconnectBanner'

// Lazy so @novnc/novnc never reaches the main bundle (MPL-2.0; ~half the
// live-viewer chunk is the library).
const ComputerLivePage = lazy(() => import('../features/computer/ComputerLivePage'))

/** The bot the legacy Settings/root routes fall back to: featured, else active. */
function principalProfile(): string {
  return encodeURIComponent(featuredBotName() ?? activeProfile.get() ?? 'default')
}

/** Redirect a legacy global route to the featured bot's per-bot equivalent. */
function FeaturedBotRedirect({ to }: { to: (profile: string) => string }) {
  return <Navigate to={to(principalProfile())} replace />
}

/** `/settings/vault/:key` needs the route param preserved. */
function VaultKeyRedirect() {
  const { key } = useParams()
  return (
    <Navigate
      to={`/bots/${principalProfile()}/vault/${encodeURIComponent(key ?? '')}`}
      replace
    />
  )
}

/** `/connectors/:family/:id` needs both params preserved. */
function ConnectorRedirect() {
  const { family, id } = useParams()
  return (
    <Navigate
      to={`/bots/${principalProfile()}/connectors/${encodeURIComponent(family ?? '')}/${encodeURIComponent(id ?? '')}`}
      replace
    />
  )
}

export function Shell() {
  const t = useT()
  const { pathname } = useLocation()
  return (
    <>
      <ReconnectBanner />
      <div className="app-main">
        <ErrorBoundary fallback={<ScreenCrash />} resetKey={pathname}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat/:profile" element={<ChatPage />} />
          <Route path="/group/:roomId" element={<GroupChatPage />} />
          <Route path="/groups/new" element={<NewGroupPage />} />

          {/* Bot profile owns everything of THAT bot (per-bot scoping). */}
          <Route path="/bots/:profile" element={<BotProfilePage />} />
          <Route path="/bots/:profile/edit" element={<BotProfileEditPage />} />
          <Route path="/bots/:profile/approvals" element={<ApprovalsPage />} />
          <Route path="/bots/:profile/skills" element={<BotSkillsPage />} />
          <Route path="/bots/:profile/memory" element={<BotMemoryPage />} />
          <Route path="/bots/:profile/brain" element={<BotBrainPage />} />
          <Route path="/bots/:profile/tools" element={<ToolsPage />} />
          <Route path="/bots/:profile/connectors" element={<CatalogPage />} />
          <Route path="/bots/:profile/connectors/:family/:id" element={<ConnectorDetailPage />} />
          <Route path="/bots/:profile/vault" element={<VaultPage />} />
          <Route path="/bots/:profile/vault/:key" element={<VaultKeyPage />} />
          <Route path="/bots/:profile/routines" element={<RoutinesPage />} />
          <Route path="/bots/:profile/routines/:id" element={<RoutineDetailPage />} />
          <Route path="/bots/:profile/library" element={<LibraryPage />} />
          <Route path="/bots/:profile/working" element={<WorkingPage />} />
          <Route path="/bots/:profile/computer" element={<ComputerPage />} />
          <Route
            path="/bots/:profile/computer/live"
            element={
              <Suspense
                fallback={
                  <div className="app-main centered">
                    <span className="muted">{t('common.loading')}</span>
                  </div>
                }
              >
                <ComputerLivePage />
              </Suspense>
            }
          />

          {/* App + server only. */}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/health" element={<HealthPage />} />

          {/* Legacy global routes → the featured bot's equivalent. */}
          <Route path="/settings/vault" element={<FeaturedBotRedirect to={p => `/bots/${p}/vault`} />} />
          <Route path="/settings/vault/:key" element={<VaultKeyRedirect />} />
          <Route path="/settings/control" element={<FeaturedBotRedirect to={p => `/bots/${p}/approvals`} />} />
          <Route path="/connectors" element={<FeaturedBotRedirect to={p => `/bots/${p}/connectors`} />} />
          <Route path="/connectors/:family/:id" element={<ConnectorRedirect />} />

          <Route path="/import" element={<ImportPage />} />
        </Routes>
        </ErrorBoundary>
      </div>
      <InstallInvite />
      <SecurePromptHost />
      <ToastHost />
    </>
  )
}
