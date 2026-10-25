// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Ported from apps/desktop/src/plugins/hermes-bots/avatar.tsx and types.ts (commit bf0203a).

import { profileColor } from './profile-color'

/**
 * The avatar appearance model: shapes, blobatar shape strings, the `BotMeta`
 * fields used for looks, and the deterministic resolution of
 * `profile name + ui_meta['hermes-bots'] + photo asset → AvatarAppearance`
 * (`botAppearance` / `avatarColor`). Render-only — DroidBot does not write
 * `ui_meta` in this phase.
 */

export type AvatarShape = 'circle' | 'cloud' | 'drop' | 'hexagon' | 'pill' | 'squircle' | 'triangle'

export type BlobKind =
  'boxy' | 'capsule' | 'cloud' | 'droplet' | 'hexagon' | 'nub' | 'organic' | 'round' | 'sun' | 'triangle'

export type FaceMood = 'idle' | 'think' | 'work'

/** The `ui_meta['hermes-bots']` fields used for looks. */
export interface BotMeta {
  color?: string
  /** Set when the user has customized the avatar, so defaults stop applying. */
  custom?: boolean
  /** Data URL. Stripped before `profiles.configure`; travels via `set_asset`. */
  image?: null | string
  imageKind?: 'photo' | 'shape'
  shape?: string
}

export interface AvatarAppearance {
  /** `null` when nothing is picked — the name's deterministic hue stands in. */
  color: null | string
  image: null | string
  /** Free-form: a bare shape, `sigil-<n>`, a platonic solid, or `blobatar:<seed>:<kind>`. */
  shape: string
}

// The original flat shapes. Sigils ('sigil-N') and platonic solids remain
// render-only so any bot that picked one during the experiments keeps its look.
const AVATAR_SHAPES: AvatarShape[] = ['circle', 'squircle', 'pill', 'triangle', 'hexagon', 'cloud', 'drop']

export function defaultShapeFor(name: string): AvatarShape {
  let hash = 0

  for (const ch of name) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  }

  return AVATAR_SHAPES[hash % AVATAR_SHAPES.length]
}

// ── blobatar shapes (default for new agents) ─────────────────────────────────
// Deterministic soft-body faces drawn from a string. Shape strings:
//   'blobatar'                — the face follows the bot's NAME
//   'blobatar:<seed>'         — seed locked
//   'blobatar:<seed>:<kind>'  — plus one of the ten silhouettes pinned
//   'blobatar::<kind>'        — silhouette pinned, seed still follows the name

export const BLOB_KINDS = [
  'round',
  'organic',
  'boxy',
  'capsule',
  'nub',
  'cloud',
  'droplet',
  'hexagon',
  'sun',
  'triangle'
]

// Trait positions at the center of each silhouette band. Band thresholds are
// frozen per blobatar major (gen2: 0.22 / 0.48 / 0.60 / 0.70 / 0.79 / 0.86 /
// 0.915 / 0.95 / 0.98).
export const BLOB_KIND_TRAIT: Record<string, number> = {
  round: 0.11,
  organic: 0.35,
  boxy: 0.54,
  capsule: 0.65,
  nub: 0.745,
  cloud: 0.825,
  droplet: 0.8875,
  hexagon: 0.9325,
  sun: 0.965,
  triangle: 0.99
}

export function isBlobShape(shape: null | string | undefined) {
  return shape === 'blobatar' || (typeof shape === 'string' && shape.startsWith('blobatar:'))
}

export interface ParsedBlobShape {
  /** A BlobKind when the silhouette is pinned, else empty. */
  kind: string
  /** The seed actually rendered — the pinned one, else the bot's name. */
  seed: string
  /** The pinned seed alone, empty when the face follows the name. */
  seedPart: string
}

export function parseBlobShape(shape: null | string | undefined, name: string | undefined): ParsedBlobShape {
  const parts = typeof shape === 'string' ? shape.split(':') : []
  const seedPart = parts[1] || ''
  const kind = BLOB_KINDS.includes(parts[2]) ? parts[2] : ''

  return {
    seed: seedPart || name || 'agent',
    seedPart,
    kind
  }
}

export function blobShapeString(seedPart: string, kind: string) {
  if (kind) {
    return `blobatar:${seedPart}:${kind}`
  }

  return seedPart ? `blobatar:${seedPart}` : 'blobatar'
}

/** The friendly violet the primary profile has always worn, and the last
 *  resort for a draft that has no name to derive a hue from yet. */
const PRIMARY_AVATAR_COLOR = '#8b5cf6'

/** A picked color wins; with none, fall back to the name's deterministic hue —
 *  the same one `botAppearance` seeds — so "no choice" means the app's color
 *  rather than an arbitrary constant. */
export function avatarColor(color: null | string | undefined, name: string): string {
  return color || profileColor(name) || PRIMARY_AVATAR_COLOR
}

export function botAppearance(name: string, meta: BotMeta | null | undefined): AvatarAppearance {
  // The primary profile is literally named "default"; the profileColor can
  // hand it a near-black that renders as an ugly black square, and any
  // auto-seeded color would otherwise stick. Give the primary a nice fixed
  // generic look (a friendly violet squircle). A user's EXPLICIT customization
  // still wins: an uploaded/generated image, or a shape/color they set via the
  // editor (tracked by meta.custom === true).
  const isPrimary = (name || '').trim().toLowerCase() === 'default'
  const userCustomized = Boolean(meta?.custom)

  if (isPrimary && !userCustomized) {
    return {
      shape: 'squircle',
      color: PRIMARY_AVATAR_COLOR,
      image: meta?.image || null
    }
  }

  return {
    shape: meta?.shape || defaultShapeFor(name),
    color: meta?.color || profileColor(name),
    image: meta?.image || null
  }
}

/** The roster backfill draws the live SVG at 160x160. Pets are 96x104
 *  and uploads are 256. Use that to tell a still face-copy from a real picture. */
export function isBackfilledFacePng(dataUrl: null | string | undefined) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
    return false
  }

  try {
    const bin = atob(dataUrl.slice('data:image/png;base64,'.length).slice(0, 48))

    if (bin.length < 24) {
      return false
    }

    const w = (bin.charCodeAt(16) << 24) | (bin.charCodeAt(17) << 16) | (bin.charCodeAt(18) << 8) | bin.charCodeAt(19)
    const h = (bin.charCodeAt(20) << 24) | (bin.charCodeAt(21) << 16) | (bin.charCodeAt(22) << 8) | bin.charCodeAt(23)

    return w === 160 && h === 160
  } catch {
    return false
  }
}
