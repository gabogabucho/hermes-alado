import { atom } from 'nanostores'
import { useStore } from '@nanostores/react'
import type { ProfileRow } from '../../lib/hermes/rpc-types'
import { botAppearance, isBackfilledFacePng, type AvatarAppearance, type BotMeta } from '../../ui/avatar/appearance'
import { homeBots, homeProfiles, invalidateBotAvatar, loadHome } from '../home/store'

/**
 * Read-only resolution of `profile name → AvatarAppearance`, mirroring the
 * desktop's `botAppearance(name, meta)` + photo-asset handling:
 *
 *  1. The look lives in `ui_meta['hermes-bots']` on `profiles.list` rows
 *     (`tui_gateway/methods_profiles.py::_profile_ui_meta_fields`), fetched
 *     once by the home store and re-fetched (debounced) on `sessions.changed`
 *     and app visibility — no second `profiles.list` call here.
 *  2. The uploaded photo is NOT in ui_meta (data URLs are stripped before
 *     `profiles.configure`; they travel via `profiles.set_asset`). It arrives
 *     as `has_avatar` → `profiles.get_asset {name, asset:'avatar'}`, which the
 *     home store already fetches into `homeBots[].avatarUrl` (memory-only).
 *  3. The desktop drops the roster's 160×160 SVG backfill so the live math
 *     face can move — mirrored via `isBackfilledFacePng`.
 *
 * Read-only: DroidBot does NOT write `ui_meta` in this phase.
 */

export const appearances = atom<ReadonlyMap<string, AvatarAppearance>>(new Map())

function botMeta(row: ProfileRow): BotMeta | null {
  const raw = row.ui_meta?.['hermes-bots']
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as BotMeta
}

function photoOf(name: string): string | null {
  const url = homeBots.get().find(b => b.name === name)?.avatarUrl ?? null
  return url && !isBackfilledFacePng(url) ? url : null
}

function recompute(): void {
  const map = new Map<string, AvatarAppearance>()
  for (const row of homeProfiles.get()) {
    const base = botAppearance(row.name, botMeta(row))
    map.set(row.name, { ...base, image: photoOf(row.name) ?? base.image })
  }
  appearances.set(map)
}

// Recompute when the profile rows change AND when a photo asset lands
// (photos update homeBots, not homeProfiles).
homeProfiles.listen(recompute)
homeBots.listen(recompute)

let ensured = false

/** Make sure the shared `profiles.list` data is loaded (deep links bypass
 *  Home). Reuses the home store's fetch — never a second call. */
export function ensureAppearances(): void {
  if (ensured) return
  ensured = true
  if (homeProfiles.get().length === 0) void loadHome()
}

/** The resolved appearance for a bot, or the desktop's deterministic default
 *  for its name while the roster has not arrived yet — either way it is
 *  identical to Hermes Desktop. */
export function useBotAppearance(name: string): AvatarAppearance {
  const map = useStore(appearances)
  return map.get(name) ?? botAppearance(name, undefined)
}

/**
 * Drop a bot's cached photo after a profile/avatar save so the new look
 * reloads everywhere (home hero, rows, chat header, group messages). The
 * home store re-pulls the asset and the `homeBots` listener recomputes
 * `appearances` when it lands.
 */
export function invalidateBotAppearance(name: string): void {
  invalidateBotAvatar(name)
}
