import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCatalog, loadFamily } from '../../lib/hermes/connectors'
import { loadCatalogData, loadFamilyData } from './store'

vi.mock('../../lib/hermes/connectors', () => ({
  loadCatalog: vi.fn(),
  loadFamily: vi.fn(),
}))

vi.mock('../../lib/hermes/connectors/api', () => ({
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadCatalog).mockResolvedValue({ connectors: [], data: {}, errors: {} })
  vi.mocked(loadFamily).mockResolvedValue({ connectors: [], data: {} })
})

describe('connectors store scoping', () => {
  it('loadCatalogData passes the profile it was given', async () => {
    await loadCatalogData('prueba')
    expect(loadCatalog).toHaveBeenCalledWith('prueba')
    expect(loadCatalog).not.toHaveBeenCalledWith('default')
  })

  it('loadFamilyData passes the profile it was given', async () => {
    await loadFamilyData('apps', 'prueba')
    expect(loadFamily).toHaveBeenCalledWith('apps', 'prueba')
  })

  it('loadFamilyData surfaces a failed family without throwing', async () => {
    vi.mocked(loadFamily).mockRejectedValue(new Error('server down'))
    await loadFamilyData('messaging', 'prueba')
    expect(loadFamily).toHaveBeenCalledWith('messaging', 'prueba')
  })
})
