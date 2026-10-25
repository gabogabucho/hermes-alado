// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Ported from apps/desktop/src/plugins/hermes-bots/avatar.tsx (commit bf0203a).

/**
 * `BotFace` — the one component that renders a bot: photos, deterministic
 * blobatar faces, static sigil line art, and the live math faces driven by
 * the shared face clock.
 */

import { blobatar } from 'blobatar/blob'
import { BLOB_KIND_TRAIT, defaultShapeFor, isBlobShape, parseBlobShape, type FaceMood } from './appearance'
import { facePose, startFaceClock } from './face-clock'
import { isDarkColor, ringToPath, sampleFaceRing, shapeNode } from './shapes'

/** Static SVG markup for a blob face, tagged data-bot-face so rasterizers
 *  still find it. */
function blobMarkup(shape: null | string | undefined, name: string, size: number) {
  const { seed, kind } = parseBlobShape(shape, name)

  const opts: { size: number; traits?: Record<string, number> } = {
    size
  }

  if (kind) {
    opts.traits = {
      shape: BLOB_KIND_TRAIT[kind]
    }
  }

  try {
    return blobatar(seed, opts).replace('<svg ', '<svg data-bot-face=' + JSON.stringify(name) + ' ')
  } catch {
    return null
  }
}

interface BotFaceProps {
  color: string
  image?: null | string
  mood?: FaceMood
  name?: string
  /** Free-form appearance string, not just AvatarShape: also `sigil-<n>`,
   *  a platonic solid, or `blobatar[:seed[:kind]]`. */
  shape: string
  size?: number
}

/**
 * Live math face. Photos still use <img>. Shape avatars stay SVG so
 * the clock can move them (a baked PNG cannot).
 */
export function BotFace({ shape, color, image, size = 36, name = 'agent', mood = 'idle' }: BotFaceProps) {
  startFaceClock()

  if (image) {
    return (
      <img
        alt=""
        aria-hidden
        src={image}
        style={{
          width: size,
          height: size,
          borderRadius: '22%',
          objectFit: 'cover',
          display: 'block'
        }}
      />
    )
  }

  // Blobatar shapes: the library draws the whole face (body + eyes + its own
  // name-derived palette). Inline SVG via innerHTML; the math clock ignores it
  // (no data-hb-math).
  if (isBlobShape(shape)) {
    const markup = blobMarkup(shape, name, size)

    if (markup) {
      return (
        <span
          aria-hidden
          dangerouslySetInnerHTML={{
            __html: markup
          }}
          style={{
            width: size,
            height: size,
            display: 'block',
            lineHeight: 0
          }}
        />
      )
    }

    shape = defaultShapeFor(name)
  }

  // Sigils are line art (no filled body) — the math clock rebuilds filled
  // outlines, which would turn a stored sigil pick into a blank circle.
  // Keep the legacy static render for them so old picks still draw.
  if (shape.startsWith('sigil-')) {
    const eyes = (
      <g>
        <circle cx={16} cy={14} fill={color} r={2.4} />
        <circle cx={24} cy={14} fill={color} r={2.4} />
      </g>
    )

    return (
      <svg aria-hidden data-bot-face={name} height={size} viewBox="0 0 40 40" width={size}>
        {shapeNode(shape, color, name)}
        {eyes}
      </svg>
    )
  }

  const working = mood === 'work' || mood === 'think'
  const eyeFill = isDarkColor(color) ? 'rgba(232,220,195,0.95)' : 'rgba(0,0,0,0.85)'
  // Catchlight contrast follows the pupil, not the body: dark pupils get the
  // white sparkle, light (cream) pupils on dark bodies get a dark one.
  const hlFill = isDarkColor(color) ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)'
  const ring = sampleFaceRing(shape)
  const rest = facePose(mood, 0)
  // Shape-aware initial eye line — the cloud body sits lower, so its eyes
  // (and their catchlights) start at the cloud position instead of jumping
  // there on the first clock paint.
  const eyeY0 = shape === 'cloud' ? 22 : 17.2

  return (
    <svg
      aria-hidden
      className="bot-face"
      data-bot-face={name}
      data-hb-math="1"
      data-hb-mood={mood}
      data-hb-shape={shape || 'circle'}
      height={size}
      viewBox="0 0 40 44"
      width={size}
    >
      <path
        d={
          shape === 'cloud'
            ? 'M11 32 a7.5 7.5 0 0 1 -1 -14.9 A9.5 9.5 0 0 1 29 12.5 A7 7 0 0 1 30 32 Z'
            : ringToPath(ring)
        }
        data-hb-body="1"
        fill={color}
      />
      <g data-hb-open="1">
        <ellipse cx={15.4} cy={eyeY0} data-hb-el="1" fill={eyeFill} rx={2.2} ry={working ? 2.6 : 2.3} />
        <ellipse cx={24.6} cy={eyeY0} data-hb-er="1" fill={eyeFill} rx={2.2} ry={working ? 2.6 : 2.3} />
        <circle cx={14.8} cy={eyeY0 - 0.7} data-hb-hl-l="1" fill={hlFill} r={0.65} />
        <circle cx={24} cy={eyeY0 - 0.7} data-hb-hl-r="1" fill={hlFill} r={0.65} />
      </g>
      <path
        d={`M12.8 ${eyeY0} L18 ${eyeY0} M22 ${eyeY0} L27.2 ${eyeY0}`}
        data-hb-shut="1"
        fill="none"
        opacity={0}
        stroke={eyeFill}
        strokeLinecap="round"
        strokeWidth={2}
      />
      <g>
        <circle cx={16.4} cy={41.2} data-hb-dot="1" fill={color} opacity={rest.d0} r={1.15} />
        <circle cx={20} cy={41.2} data-hb-dot="1" fill={color} opacity={rest.d1} r={1.15} />
        <circle cx={23.6} cy={41.2} data-hb-dot="1" fill={color} opacity={rest.d2} r={1.15} />
      </g>
    </svg>
  )
}
