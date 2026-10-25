import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import {
  FAMILY_LABELS,
  isConnectorFamily,
  isHubId,
  type Connector,
} from '../../lib/hermes/connectors'
import { activeProfile, loadActiveProfile } from '../home/store'
import { Skeleton } from '../../ui/Skeleton'
import { ConnectorIcon } from './components/ConnectorIcon'
import { McpSection } from './components/McpSection'
import { MessagingSection } from './components/MessagingSection'
import { PluginSection } from './components/PluginSection'
import { SkillSection } from './components/SkillSection'
import { ToolsetSection } from './components/ToolsetSection'
import { familyData, loadFamilyData, findConnector } from './store'
import './connectors.css'

const STATUS_LABELS: Record<Connector['status'], string> = {
  connected: 'Conectado',
  available: 'Disponible',
  needs_setup: 'Requiere configuración',
  error: 'Con error',
}

export function ConnectorDetailPage() {
  const { family, id } = useParams()
  const navigate = useNavigate()
  const profile = useStore(activeProfile)
  const data = useStore(familyData)

  const connector = isConnectorFamily(family) ? findConnector(id) : undefined

  useEffect(() => {
    void loadActiveProfile()
  }, [])

  useEffect(() => {
    if (!id) return
    if (!isConnectorFamily(family)) return
    if (!connector) void loadFamilyData(family, profile)
  }, [family, id, connector, profile])

  const refresh = async () => {
    if (!isConnectorFamily(family)) return
    await loadFamilyData(family, profile)
  }

  if (!isConnectorFamily(family) || !id) {
    return (
      <div>
        <div className="page-header">
          <button className="btn ghost" onClick={() => navigate('/connectors')}>
            ‹
          </button>
        </div>
        <p className="muted">Conector no encontrado.</p>
      </div>
    )
  }

  if (!connector) {
    return (
      <div>
        <div className="page-header">
          <button className="btn ghost" onClick={() => navigate('/connectors')}>
            ‹
          </button>
        </div>
        {data[family] === undefined ? (
          <div className="list">
            <Skeleton />
            <Skeleton width={200} />
            <Skeleton width={160} />
          </div>
        ) : (
          <p className="muted">Conector no encontrado.</p>
        )}
      </div>
    )
  }

  const messagingPlatform =
    connector.family === 'messaging' && data.messaging
      ? data.messaging.payload.platforms.find(p => p.id === connector.id)
      : undefined

  return (
    <div className="detail-page">
      <div className="page-header">
        <button className="btn ghost" onClick={() => navigate('/connectors')}>
          ‹
        </button>
        <ConnectorIcon name={connector.name} size={34} />
        <span className="spacer" style={{ textAlign: 'left' }}>
          <span className="detail-title">{connector.name}</span>
          <span className="faint detail-family">{FAMILY_LABELS[connector.family]}</span>
        </span>
        <span className={`chip ${connector.status === 'connected' ? 'ok' : ''}`}>
          {STATUS_LABELS[connector.status]}
        </span>
      </div>

      {connector.description && <p className="detail-description">{connector.description}</p>}

      {connector.family === 'apps' && (
        <McpSection
          name={connector.name}
          profile={profile}
          entry={data.apps?.catalog.find(e => e.name === connector.name)}
          server={data.apps?.servers.find(s => s.name === connector.name)}
          onChanged={refresh}
        />
      )}

      {connector.family === 'tools' && (
        <ToolsetSection
          name={connector.id}
          profile={profile}
          enabled={data.tools?.toolsets.find(t => t.name === connector.id)?.enabled ?? false}
          onChanged={refresh}
        />
      )}

      {connector.family === 'skills' && (
        <SkillSection
          id={connector.id}
          name={connector.name}
          profile={profile}
          enabled={connector.status === 'connected'}
          hubProvenance={
            !isHubId(connector.id) &&
            data.skills?.skills.find(s => s.name === connector.name)?.provenance === 'hub'
          }
          onChanged={refresh}
        />
      )}

      {connector.family === 'plugins' && (
        <PluginSection
          name={connector.id}
          profile={profile}
          row={data.plugins?.hub.plugins.find(p => p.name === connector.id)}
          onChanged={refresh}
        />
      )}

      {connector.family === 'messaging' && messagingPlatform && (
        <MessagingSection platform={messagingPlatform} profile={profile} onChanged={refresh} />
      )}

      {connector.family === 'messaging' && !messagingPlatform && <p className="muted">Sin datos del canal.</p>}
    </div>
  )
}
