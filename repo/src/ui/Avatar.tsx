import { useEffect, useRef, type ReactElement } from 'react'

export type AvatarMood = 'idle' | 'thinking' | 'happy' | 'sleeping'
export type AvatarShape = 'blob' | 'drop' | 'bean' | 'square' | 'ghost' | 'star'
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const SIZES: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 44, lg: 72, xl: 112 }

const SHAPES: AvatarShape[] = ['blob', 'drop', 'bean', 'square', 'ghost', 'star']

// Curated warm/jewel palette — the bot's identity color, not a theme token.
const PALETTE = [
  '#e0b34c', // gold
  '#d5654f', // terracotta
  '#9a6bd0', // violet
  '#3f9d8c', // teal
  '#d98324', // amber
  '#c05b8a', // rose
  '#5b8fb9', // slate
  '#7fbf7f', // sage
  '#8a5a44', // umber
  '#6b6bd6', // indigo
]

function hash(str: string): number {
  let h = 0
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

function defaultShape(name: string): AvatarShape {
  return SHAPES[hash(name) % SHAPES.length]
}

function defaultColor(name: string): string {
  return PALETTE[hash(name) % PALETTE.length]
}

function isDark(color: string): boolean {
  if (!color.startsWith('#')) return false
  const n = parseInt(color.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110
}

function body(shape: AvatarShape, color: string): ReactElement {
  switch (shape) {
    case 'drop':
      return <path d="M20 3.5c6.5 7 9.5 12.5 9.5 17.5a9.5 9.5 0 0 1-19 0c0-5 3-10.5 9.5-17.5Z" fill={color} />
    case 'bean':
      return <path d="M20 3.5c7 3.4 9 10.6 7.6 16.4-1.2 5-5.3 8.1-9.6 7.6-6-.7-10.6-6.4-10.5-12.9.1-6 4.6-11.6 12.5-11.1Z" fill={color} />
    case 'square':
      return <rect x={3.5} y={3.5} width={33} height={33} rx={10} fill={color} />
    case 'ghost':
      return <path d="M20 3.5c8.8 0 16.5 4.8 16.5 13.2 0 6.8-5.4 10.3-8 11.3v6.5l-3-2.5-2.6 2.5-2.9-2.5-2.9 2.5-2.6-2.5-3 2.5V28c-2.6-1-8-4.5-8-11.3C3.5 8.3 11.2 3.5 20 3.5Z" fill={color} />
    case 'star':
      return <path d="M20 3.5l4.4 8.9 9.8 1.4-7.1 6.9 1.7 9.8-8.8-4.6-8.8 4.6 1.7-9.8-7.1-6.9 9.8-1.4Z" fill={color} />
    default:
      return <path d="M20 3.5c8.6 0 16.5 5.2 16.5 14.7 0 7.1-4.8 10.5-7.6 11.3-1.9 4.6-5.4 7-8.9 7s-7-2.4-8.9-7c-2.8-.8-7.6-4.2-7.6-11.3C3.5 8.7 11.4 3.5 20 3.5Z" fill={color} />
  }
}

interface Pose {
  blink: boolean
  gazeX: number
  gazeY: number
  dots: [number, number, number]
}

function poseFor(mood: AvatarMood, t: number): Pose {
  switch (mood) {
    case 'thinking':
      return {
        blink: (t % 1.6) > 1.4,
        gazeX: Math.sin(t * 0.55) * 2.2,
        gazeY: -1 + Math.sin(t * 0.38) * 1.4,
        dots: [
          0.25 + 0.75 * Math.max(0, Math.sin(t * 2.6)),
          0.25 + 0.75 * Math.max(0, Math.sin(t * 2.6 - 0.7)),
          0.25 + 0.75 * Math.max(0, Math.sin(t * 2.6 - 1.4)),
        ],
      }
    case 'happy':
      return { blink: false, gazeX: 0, gazeY: 0, dots: [0, 0, 0] }
    case 'sleeping':
      return { blink: false, gazeX: 0, gazeY: 0, dots: [0, 0, 0] }
    default:
      return {
        blink: (t % 3.4) > 3.22,
        gazeX: Math.sin(t * 0.25) * 0.8,
        gazeY: Math.sin(t * 0.4) * 0.5,
        dots: [0, 0, 0],
      }
  }
}

/**
 * A bot's "creature" avatar: a deterministic shape + color from its name
 * (overridable via `shape`/`color`), two eyes with a `mood`, optional accent
 * `ring` and a `badge` star. Lightly animated (blinks, sways, thinking dots).
 */
export function Avatar({
  name,
  size = 'md',
  mood = 'idle',
  shape,
  color,
  ring = false,
  badge = false,
}: {
  name: string
  size?: AvatarSize | number
  mood?: AvatarMood
  shape?: AvatarShape
  color?: string
  ring?: boolean
  badge?: boolean
}) {
  const px = typeof size === 'number' ? size : SIZES[size]
  const bodyShape = shape ?? defaultShape(name)
  const bodyColor = color ?? defaultColor(name)
  const eyeFill = isDark(bodyColor) ? 'rgba(245,238,225,0.95)' : 'rgba(0,0,0,0.8)'

  const svgRef = useRef<SVGSVGElement>(null)
  const moodRef = useRef<AvatarMood>(mood)

  useEffect(() => {
    moodRef.current = mood
  }, [mood])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const open = svg.querySelector<SVGElement>('[data-open]')
    const happy = svg.querySelector<SVGElement>('[data-happy]')
    const asleep = svg.querySelector<SVGElement>('[data-asleep]')
    const el = svg.querySelector<SVGElement>('[data-el]')
    const er = svg.querySelector<SVGElement>('[data-er]')
    const shutL = svg.querySelector<SVGElement>('[data-shut-l]')
    const shutR = svg.querySelector<SVGElement>('[data-shut-r]')
    const dots = Array.from(svg.querySelectorAll<SVGElement>('[data-dot]'))

    const current = moodRef.current
    open?.setAttribute('opacity', current === 'happy' || current === 'sleeping' ? '0' : '1')
    happy?.setAttribute('opacity', current === 'happy' ? '1' : '0')
    asleep?.setAttribute('opacity', current === 'sleeping' ? '1' : '0')
    if (current !== 'thinking') {
      dots.forEach(d => d.setAttribute('opacity', '0'))
    }

    let raf = 0
    const t0 = performance.now()

    const tick = (now: number) => {
      const t = (now - t0) / 1000
      const m = moodRef.current
      const pose = poseFor(m, t)
      const eyeL = 15.4 + pose.gazeX
      const eyeR = 24.6 + pose.gazeX
      const eyeY = 17.2 + pose.gazeY

      el?.setAttribute('cx', eyeL.toFixed(2))
      el?.setAttribute('cy', eyeY.toFixed(2))
      er?.setAttribute('cx', eyeR.toFixed(2))
      er?.setAttribute('cy', eyeY.toFixed(2))
      if (m === 'idle' || m === 'thinking') {
        open?.setAttribute('opacity', pose.blink ? '0' : '1')
        shutL?.setAttribute('d', `M${(eyeL - 2.6).toFixed(2)} ${eyeY.toFixed(2)} L${(eyeL + 2.6).toFixed(2)} ${eyeY.toFixed(2)}`)
        shutR?.setAttribute('d', `M${(eyeR - 2.6).toFixed(2)} ${eyeY.toFixed(2)} L${(eyeR + 2.6).toFixed(2)} ${eyeY.toFixed(2)}`)
        if (m === 'thinking') {
          dots.forEach((d, i) => d.setAttribute('opacity', pose.dots[i].toFixed(2)))
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mood])

  return (
    <span className="avatar" style={{ width: px, height: px }}>
      <svg ref={svgRef} width={px} height={px} viewBox="0 0 40 44" aria-hidden="true">
        {ring && <circle cx={20} cy={21} r={19} fill="none" stroke="var(--bot-accent)" strokeWidth={2.5} />}
        <g data-body>{body(bodyShape, bodyColor)}</g>
        <g data-open>
          <ellipse data-el cx={15.4} cy={17.2} rx={2.2} ry={2.3} fill={eyeFill} />
          <ellipse data-er cx={24.6} cy={17.2} rx={2.2} ry={2.3} fill={eyeFill} />
        </g>
        <g data-shut fill="none" stroke={eyeFill} strokeWidth={2} strokeLinecap="round" opacity={0}>
          <path data-shut-l d="M12.8 17.2 L18 17.2" />
          <path data-shut-r d="M22 17.2 L27.2 17.2" />
        </g>
        <g data-happy fill="none" stroke={eyeFill} strokeWidth={2} strokeLinecap="round" opacity={0}>
          <path d="M12.6 19.4 Q15.4 15.4 18.2 19.4" />
          <path d="M21.8 19.4 Q24.6 15.4 27.4 19.4" />
        </g>
        <g data-asleep fill="none" stroke={eyeFill} strokeWidth={2} strokeLinecap="round" opacity={0}>
          <path d="M13 17.4 Q15.4 20.4 18 17.4" />
          <path d="M22 17.4 Q24.6 20.4 27 17.4" />
        </g>
        <g data-dots>
          <circle data-dot cx={16.4} cy={41.2} r={1.15} fill={bodyColor} opacity={0} />
          <circle data-dot cx={20} cy={41.2} r={1.15} fill={bodyColor} opacity={0} />
          <circle data-dot cx={23.6} cy={41.2} r={1.15} fill={bodyColor} opacity={0} />
        </g>
      </svg>
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
        <span className="avatar-stack-more" style={{ width: typeof size === 'number' ? size : SIZES[size], height: typeof size === 'number' ? size : SIZES[size] }}>
          +{extra}
        </span>
      )}
    </span>
  )
}
