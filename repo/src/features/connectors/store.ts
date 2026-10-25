import { atom } from 'nanostores'
import {
  loadCatalog,
  loadFamily,
  type Connector,
  type ConnectorFamily,
  type FamilyData,
} from '../../lib/hermes/connectors'
import { errorMessage } from '../../lib/hermes/connectors/api'

/**
 * Conexiones catalog state. Every call takes the profile as an argument: the
 * catalog answers for the bot it was opened for (the route's `:profile`),
 * never the server's active profile.
 */

export const connectors = atom<Connector[]>([])
export const catalogLoading = atom(false)
export const familyData = atom<FamilyData>({})
export const familyErrors = atom<Partial<Record<ConnectorFamily, string>>>({})

export async function loadCatalogData(profile: string): Promise<void> {
  catalogLoading.set(true)
  try {
    const res = await loadCatalog(profile)
    connectors.set(res.connectors)
    familyData.set(res.data)
    familyErrors.set(res.errors)
  } finally {
    catalogLoading.set(false)
  }
}

export async function loadFamilyData(family: ConnectorFamily, profile: string): Promise<void> {
  try {
    const res = await loadFamily(family, profile)
    const current = connectors.get().filter(c => c.family !== family)
    connectors.set([...current, ...res.connectors])
    familyData.set({ ...familyData.get(), ...res.data })
    const errs = { ...familyErrors.get() }
    delete errs[family]
    familyErrors.set(errs)
  } catch (e) {
    familyErrors.set({ ...familyErrors.get(), [family]: errorMessage(e) })
  }
}

/** Detail-route lookup. Connector ids collide across families (openrouter,
 *  xai, …), so the family from the route must scope the match. */
export const findConnector = (
  family: string | undefined,
  id: string | undefined,
): Connector | undefined =>
  family === undefined || id === undefined
    ? undefined
    : connectors.get().find(c => c.family === family && c.id === id)
