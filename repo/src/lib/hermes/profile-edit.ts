// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Ported from apps/desktop/src/plugins/hermes-bots/data.ts `saveBotMeta` /
// `persistBotMetaPatch` (commit bf0203a).

import { request } from './connection'
import type { ProfilesConfigureParams } from './vendor/gateway-contract.generated'

/**
 * Server-side bot look persistence: the `hermes-bots` namespace inside the
 * profile's `ui_meta` (profile.yaml), written via `profiles.configure` with a
 * per-key compare-and-swap (`ui_meta_expected_revisions`), plus the avatar
 * image which travels through `profiles.set_asset` because data URLs are
 * stripped from ui_meta (64KB cap, rides every profiles.list).
 *
 * Mirrors the desktop's three-way save outcome so the editor can tell a REAL
 * remote failure from the documented older-gateway fallback:
 *   'persisted'   — gateway confirmed applied.ui_meta === true
 *   'failed'      — gateway speaks the contract and rejected the write
 *   'unsupported' — older gateway: request rejected / no `applied` contract
 */

export interface ProfileLookPatch {
  shape?: string
  color?: null | string
  /** Data URL. Stripped before `profiles.configure`; travels via `set_asset`. */
  image?: null | string
  imageKind?: 'photo' | 'shape'
  custom?: boolean
  title?: string
}

/** The bot's `hermes-bots` namespace as its backend holds it right now. */
export interface ServerProfileMeta {
  meta: Record<string, unknown>
  /** Per-key CAS revision; null on gateways that predate `ui_meta_revisions`. */
  revision: null | number
}

/** Read the current server-side meta + CAS revision for a profile. */
export async function readServerProfileMeta(name: string): Promise<ServerProfileMeta | null> {
  const result = await request('profiles.list', { include_sessions: false })
  const row = (Array.isArray(result?.profiles) ? result.profiles : []).find(
    profile => profile?.name === name,
  )

  if (!row) return null

  const raw = row.ui_meta?.['hermes-bots']
  const meta =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const revisions = row.ui_meta_revisions
  const revision =
    revisions && typeof revisions === 'object'
      ? Math.max(0, Number(revisions['hermes-bots'] ?? 0))
      : null

  return { meta, revision }
}

/** How many times a save re-reads the server after losing a CAS race. */
const CAS_ATTEMPTS = 3

export type ProfileMetaSaveOutcome = 'persisted' | 'failed' | 'unsupported'

export interface ProfileMetaSaveResult {
  serverOutcome: ProfileMetaSaveOutcome
  /** True when the write lost the CAS race on every attempt. */
  conflict: boolean
}

/**
 * Write ONE save's patch onto the server's current namespace. The local cache
 * is never the write base: CAS turns a concurrent writer's newer value into a
 * re-read instead of a silent overwrite. Data-URL fields are stripped from
 * ui_meta; the avatar IMAGE goes to the profile asset store instead — the
 * caller pushes it via `saveProfileAvatarAsset`.
 */
export async function saveProfileMeta(
  name: string,
  patch: ProfileLookPatch,
): Promise<ProfileMetaSaveResult> {
  const { image: _image, ...fields } = patch

  try {
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const server = await readServerProfileMeta(name)

      if (!server) {
        return { serverOutcome: 'unsupported', conflict: false }
      }

      const params: ProfilesConfigureParams = {
        name,
        ui_meta: { 'hermes-bots': { ...server.meta, ...fields } },
      }

      if (server.revision !== null) {
        params.ui_meta_expected_revisions = { 'hermes-bots': server.revision }
      }

      const result = await request('profiles.configure', params)

      if (!result?.applied?.ui_meta_conflicts) {
        if (result?.applied?.ui_meta === true) {
          return { serverOutcome: 'persisted', conflict: false }
        }

        return {
          serverOutcome:
            result && typeof result === 'object' && result.applied && typeof result.applied === 'object'
              ? 'failed'
              : 'unsupported',
          conflict: false,
        }
      }
    }
  } catch {
    // older/unavailable gateway — the caller reports 'unsupported'
    return { serverOutcome: 'unsupported', conflict: false }
  }

  return { serverOutcome: 'failed', conflict: true }
}

/**
 * Push (or clear) the profile avatar asset: `profiles.set_asset` with a
 * PNG/JPEG/WebP data URL (≤ 2 MB, sniffed server-side) or `clear: true`.
 */
export async function saveProfileAvatarAsset(name: string, image: null | string): Promise<void> {
  if (image) {
    await request('profiles.set_asset', { name, asset: 'avatar', data: image })
  } else {
    await request('profiles.set_asset', { name, asset: 'avatar', clear: true })
  }
}
