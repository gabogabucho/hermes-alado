import type { ReactElement } from 'react'
import type { AvatarAppearance, FaceMood } from './avatar/appearance'
import { avatarColor, botAppearance } from './avatar/appearance'
import { BotFace } from './avatar/bot-face'

/**
 * A bot avatar — the desktop's exact look (shape, color, face, eyes, moods,
 * custom photo) plus DroidBot's extras (`ring`, `badge` star, size tokens).
 * Pass an `appearance` (from `useBotAppearance`) to render a profile's stored
 * look; without one the name's deterministic default is used, identical to
 * Hermes Desktop.
 */

export type AvatarMood = 'idle' | 'thinking' | 'working' | 'happy' | 'sleeping'
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 44, lg: 72, xl: 112 }

// Our mood vocabulary → desktop FaceMood. 'happy'/'sleeping' are kept for
// backward compatibility; the desktop has no equivalents, so they rest idle.
const MOODS: Record<AvatarMood, FaceMood> = {
  idle: 'idle',
  thinking: 'think',
  working: 'work',
  happy: 'idle',
  sleeping: 'idle',
}

function resolveAppearance(name: string, appearance: AvatarAppearance | null | undefined, shape?: string, color?: string, image?: string | null): {
  shape: string
  color: string
  image: string | null
} {
  const base = appearance ?? botAppearance(name, undefined)
  return {
    shape: shape ?? base.shape,
    color: color ?? avatarColor(base.color, name),
    image: image !== undefined ? image : base.image,
  }
}

export function Avatar({
  name,
  size = 'md',
  mood = 'idle',
  shape,
  color,
  image,
  appearance,
  ring = false,
  badge = false,
}: {
  name: string
  size?: AvatarSize | number
  mood?: AvatarMood
  /** Backward-compatible override of the appearance shape. */
  shape?: string
  /** Backward-compatible override of the appearance color. */
  color?: string
  /** Backward-compatible override of the appearance image (data URL). */
  image?: string | null
  /** The profile's resolved look (features/bots/appearance-store). */
  appearance?: AvatarAppearance | null
  ring?: boolean
  badge?: boolean
}): ReactElement {
  const px = typeof size === 'number' ? size : SIZES[size]
  const resolved = resolveAppearance(name, appearance, shape, color, image)

  return (
    <span className="avatar" style={{ width: px, height: px }}>
      {ring && resolved.image && <span className="avatar-ring" style={{ width: px, height: px }} />}
      {ring && !resolved.image && (
        <svg className="avatar-ring-svg" width={px} height={px} viewBox="0 0 40 44" aria-hidden="true">
          <circle cx={20} cy={21} r={19} fill="none" stroke="var(--bot-accent)" strokeWidth={2.5} />
        </svg>
      )}
      <BotFace
        color={resolved.color}
        image={resolved.image}
        mood={MOODS[mood]}
        name={name}
        shape={resolved.shape}
        size={px}
      />
      {badge && (
        <svg className="avatar-badge" width={px * 0.42} height={px * 0.42} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.5l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="var(--bot-accent)" />
        </svg>
      )}
    </span>
  )
}

export function AvatarStack({
  names,
  size = 'sm',
  max = 3,
}: {
  names: string[]
  size?: AvatarSize | number
  max?: number
}) {
  const shown = names.slice(0, max)
  const extra = names.length - shown.length
  return (
    <span className="avatar-stack">
      {shown.map(name => (
        <Avatar key={name} name={name} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="avatar-stack-more"
          style={{
            width: typeof size === 'number' ? size : SIZES[size],
            height: typeof size === 'number' ? size : SIZES[size],
          }}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}
