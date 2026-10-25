import { errorMessage } from './api'
import { listMcp, type McpData } from './mcp'
import { listMessaging, type MessagingData } from './messaging'
import { listPlugins, type PluginsData } from './plugins'
import { listSkills, type SkillsData } from './skills'
import { listToolsets, type ToolsData } from './toolsets'
import type { Connector, ConnectorFamily } from './types'

export * from './types'
export * from './mcp'
export * from './toolsets'
export * from './skills'
export * from './plugins'
export * from './messaging'

export interface FamilyData {
  apps?: McpData
  tools?: ToolsData
  skills?: SkillsData
  plugins?: PluginsData
  messaging?: MessagingData
}

export interface CatalogLoad {
  connectors: Connector[]
  data: FamilyData
  errors: Partial<Record<ConnectorFamily, string>>
}

type FamilyLoader = (profile?: string) => Promise<{ connectors: Connector[]; data: unknown }>

const LOADERS: Record<ConnectorFamily, FamilyLoader> = {
  apps: listMcp,
  tools: listToolsets,
  skills: listSkills,
  plugins: listPlugins,
  messaging: listMessaging,
}

const FAMILIES = Object.keys(LOADERS) as ConnectorFamily[]

function assignFamily(data: FamilyData, family: ConnectorFamily, raw: unknown): void {
  switch (family) {
    case 'apps':
      data.apps = raw as McpData
      break
    case 'tools':
      data.tools = raw as ToolsData
      break
    case 'skills':
      data.skills = raw as SkillsData
      break
    case 'plugins':
      data.plugins = raw as PluginsData
      break
    case 'messaging':
      data.messaging = raw as MessagingData
      break
  }
}

/** Load a single family (detail-screen retry / refresh). */
export async function loadFamily(
  family: ConnectorFamily,
  profile?: string,
): Promise<{ connectors: Connector[]; data: FamilyData }> {
  const res = await LOADERS[family](profile)
  const data: FamilyData = {}
  assignFamily(data, family, res.data)
  return { connectors: res.connectors, data }
}

/** Load all five families in parallel; one failing family must not break the rest. */
export async function loadCatalog(profile?: string): Promise<CatalogLoad> {
  const results = await Promise.allSettled(FAMILIES.map(family => LOADERS[family](profile)))

  const connectors: Connector[] = []
  const data: FamilyData = {}
  const errors: Partial<Record<ConnectorFamily, string>> = {}

  FAMILIES.forEach((family, i) => {
    const res = results[i]
    if (res.status !== 'fulfilled') {
      errors[family] = errorMessage(res.reason)
      return
    }
    connectors.push(...res.value.connectors)
    assignFamily(data, family, res.value.data)
  })

  return { connectors, data, errors }
}
