// Per-bot curated memory over the droidbot-push plugin REST surface.
// The gateway has no profile-scoped memory RPC (learning.* reads the serve
// process home), so the plugin — same host filesystem — reads/writes the
// profile's memories/MEMORY.md + USER.md with the store's exact §-entry
// format. Entry ids are content hashes; a stale id gets 409 and the UI
// refreshes instead of deleting the wrong line.

import { ApiError, apiFetch } from '../api'

export type MemoryTarget = 'memory' | 'user'

export interface MemoryEntry {
  id: string
  text: string
}

export interface BotMemory {
  memory: MemoryEntry[]
  user: MemoryEntry[]
}

export async function readBotMemory(profile: string): Promise<BotMemory> {
  const res = await apiFetch<{ memory?: MemoryEntry[]; user?: MemoryEntry[] }>(
    `/api/plugins/droidbot-push/memory?profile=${encodeURIComponent(profile)}`,
  )
  return { memory: res.memory ?? [], user: res.user ?? [] }
}

/**
 * Delete ONE entry. Throws with the server's detail on 409 (entry changed
 * since the list loaded — the caller should reload) and 404 (profile gone).
 */
export async function deleteBotMemory(
  profile: string,
  target: MemoryTarget,
  id: string,
): Promise<void> {
  try {
    await apiFetch('/api/plugins/droidbot-push/memory', {
      method: 'DELETE',
      body: JSON.stringify({ profile, target, id }),
    })
  } catch (e) {
    if (e instanceof ApiError) throw new Error(e.message)
    throw e
  }
}
