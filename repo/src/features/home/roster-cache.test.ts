import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProfileRow } from '../../lib/hermes/rpc-types'

vi.mock('../../lib/config', () => ({
  getBackendUrl: () => 'https://backend.example.com',
}))

import { readRosterCache, writeRosterCache } from './roster-cache'

const row: ProfileRow = {
  name: 'lucia',
  path: '/profiles/lucia',
  display_name: 'Lucia',
  model: 'opus',
  has_avatar: true,
  canonical_session: { id: 'stored-1', resolved_id: 'rt-1', preview: 'hola', last_active: 123 },
}

function storageStub() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storageStub(),
    configurable: true,
    writable: true,
  })
})

describe('roster cache', () => {
  it('round-trips rows with a savedAt stamp, never storing message previews', () => {
    writeRosterCache([row])
    const cached = readRosterCache()
    expect(cached).not.toBeNull()
    const { preview: _preview, ...session } = row.canonical_session!
    expect(cached!.rows).toEqual([{ ...row, canonical_session: session }])
    expect(JSON.stringify(cached)).not.toContain('hola')
    expect(typeof cached!.savedAt).toBe('number')
  })

  it('returns null when nothing was cached', () => {
    expect(readRosterCache()).toBeNull()
  })

  it('returns null on corrupt JSON instead of throwing', () => {
    localStorage.setItem('droidbot.roster.https://backend.example.com', '{oops')
    expect(readRosterCache()).toBeNull()
  })

  it('returns null when the payload is not the expected shape', () => {
    localStorage.setItem('droidbot.roster.https://backend.example.com', JSON.stringify({ nope: true }))
    expect(readRosterCache()).toBeNull()
  })

  it('scopes the cache key to the backend origin', () => {
    writeRosterCache([row])
    // A different backend's key is untouched.
    expect(localStorage.getItem('droidbot.roster.https://other.example.com')).toBeNull()
    expect(localStorage.getItem('droidbot.roster.https://backend.example.com')).not.toBeNull()
  })

  it('never throws when storage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => {
          throw new Error('denied')
        },
        setItem: () => {
          throw new Error('denied')
        },
      },
      configurable: true,
    })
    expect(() => writeRosterCache([row])).not.toThrow()
    expect(readRosterCache()).toBeNull()
  })
})
