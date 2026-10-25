export type ConnectorFamily = 'apps' | 'tools' | 'skills' | 'plugins' | 'messaging'

export const CONNECTOR_FAMILIES: readonly ConnectorFamily[] = [
  'apps',
  'tools',
  'skills',
  'plugins',
  'messaging',
]

export const FAMILY_LABELS: Record<ConnectorFamily, string> = {
  apps: 'Apps',
  tools: 'Herramientas',
  skills: 'Habilidades',
  plugins: 'Plugins',
  messaging: 'Mensajería',
}

export function isConnectorFamily(v: string | undefined): v is ConnectorFamily {
  return CONNECTOR_FAMILIES.includes(v as ConnectorFamily)
}

export type ConnectorStatus = 'connected' | 'available' | 'needs_setup' | 'error'

export type ConnectorAuth = 'none' | 'oauth' | 'fields'

/** D7 — one normalised row per connector across the five Hermes families. */
export interface Connector {
  id: string
  family: ConnectorFamily
  name: string
  description: string
  icon: string | null
  category: string | null
  status: ConnectorStatus
  configurable: boolean
  auth: ConnectorAuth
}

/**
 * A dynamic config row for the shared detail screen. Secrets are never echoed:
 * a `secret` field only knows `isSet` (and the backend's redacted preview).
 */
export type ConfigField =
  | {
      kind: 'text'
      key: string
      label: string
      value: string
      help?: string
      url?: string
      required?: boolean
      advanced?: boolean
    }
  | {
      kind: 'secret'
      key: string
      label: string
      isSet: boolean
      redacted?: string
      help?: string
      url?: string
      required?: boolean
      advanced?: boolean
    }
  | {
      kind: 'list'
      key: string
      label: string
      value: string
      help?: string
      url?: string
      required?: boolean
      advanced?: boolean
    }
