import { getBackendUrl } from '../../lib/config'

/**
 * IndexedDB cache for `profiles.get_asset` avatars (the ~120 KB data URL the
 * roster refetches on every boot). The wire result has no content hash
 * (`ProfilesGetAssetResult` = found/mime/size/data,
 * `.hermes-ref/tui_gateway/methods_profiles.py:450-464`), so entries are
 * keyed by profile + backend origin and dropped on explicit invalidation
 * (avatar edits through the profile editor) or after 24 h (self-heal against
 * desktop-side edits). Backend-scoped like the roster cache.
 */

const DB_NAME = 'droidbot'
const STORE = 'avatar-assets'
const TTL_MS = 24 * 60 * 60 * 1000

interface AvatarRecord {
  key: string
  data: string
  savedAt: number
}

function recordKey(name: string): string {
  return `${getBackendUrl() || 'same-origin'}|${name}`
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'key' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** The cached avatar data URL for a profile, or null when absent/stale. */
export async function readCachedAvatar(name: string): Promise<string | null> {
  const db = await openDb()
  if (!db) return null
  try {
    const tx = db.transaction(STORE, 'readonly')
    const rec = await new Promise<AvatarRecord | undefined>((resolve, reject) => {
      const req = tx.objectStore(STORE).get(recordKey(name))
      req.onsuccess = () => resolve(req.result as AvatarRecord | undefined)
      req.onerror = () => reject(req.error)
    })
    if (!rec || typeof rec.data !== 'string') return null
    if (Date.now() - rec.savedAt > TTL_MS) return null
    return rec.data
  } catch {
    return null
  } finally {
    db.close()
  }
}

/** Persist one avatar data URL (fire-and-forget is fine). */
export async function writeCachedAvatar(name: string, data: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ key: recordKey(name), data, savedAt: Date.now() } satisfies AvatarRecord)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // caching nicety only
  } finally {
    db.close()
  }
}

/** Drop one profile's cached avatar (after a profile-editor save). */
export async function deleteCachedAvatar(name: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(recordKey(name))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // caching nicety only
  } finally {
    db.close()
  }
}
