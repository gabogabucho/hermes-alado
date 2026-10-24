import { useEffect, useRef, type ReactElement } from 'react'

const SHAPES = ['circle', 'squircle', 'pill', 'triangle', 'hexagon'] as const
type Shape = (typeof SHAPES)[number]
type Mood = 'idle' | 'work'

const PRIMARY_COLOR = '#8b5cf6'

function hash(str: string): number {
  let h = 0
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

function defaultShape(name: string): Shape {
  return SHAPES[hash(name) % SHAPES.length]
}

/** Deterministic, name-derived color — mirrors Hermes' `profileColor`. */
function nameColor(name: string): string {
  const hue = hash(name) % 360
  return `hsl(${hue} 55% 52%)`
}

function isDarkColor(color: string): boolean {
  if (!color.startsWith('#')) return false
  const n = parseInt(color.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110
}

function body(shape: Shape, color: string): ReactElement {
  switch (shape) {
    case 'squircle':
      return <rect x={3} y={3} width={34} height={34} rx={11} fill={color} />
    case 'pill':
      return <rect x={2} y={7} width={36} height={26} rx={13} fill={color} />
    case 'triangle':
      return <path d="M20 5.5 L36 33.5 L4 33.5 Z" fill={color} stroke={color} strokeWidth={7} strokeLinejoin="round" />
    case 'hexagon':
      return (
        <path
          d="M20 3.5 L34.5 11.75 L34.5 28.25 L20 36.5 L5.5 28.25 L5.5 11.75 Z"
          fill={color}
          stroke={color}
          strokeWidth={7}
          strokeLinejoin="round"
        />
      )
    default:
      return <circle cx={20} cy={20} r={17.5} fill={color} />
  }
}

interface Pose {
  tilt: number
  gazeX: number
  gazeY: number
  blink: boolean
  dots: [number, number, number]
}

/** Idle: gentle sway + a slow occasional blink, eyes drifting slightly. */
function idlePose(t: number): Pose {
  return {
    tilt: Math.sin(t * 0.5) * 1.5,
    gazeX: Math.sin(t * 0.25) * 0.8,
    gazeY: Math.sin(t * 0.4) * 0.5,
    blink: (t % 3.4) > 3.22,
    dots: [0, 0, 0],
  }
}

/** Working: lean and sway, look around, faster blink, pulsing dots. */
function workPose(t: number): Pose {
  return {
    tilt: Math.sin(t * 0.5) * 2.5 + Math.sin(t * 1.1) * 0.6,
    gazeX: Math.sin(t * 0.55) * 2.2,
    gazeY: -1 + Math.sin(t * 0.38) * 1.4,
    blink: (t % 1.6) > 1.4,
    dots: [
      0.25 + 0.75 * Math.max(0, Math.sin(t * 2.6)),
      0.25 + 0.75 * Math.max(0, Math.sin(t * 2.6 - 0.7)),
      0.25 + 0.75 * Math.max(0, Math.sin(t * 2.6 - 1.4)),
    ],
  }
}

/**
 * A bot's face: a colored shape + two eyes, matching Hermes' bot avatars
 * (the "default" profile wears the friendly violet squircle). Lightly
 * animated — blinks and sways when idle, looks around and pulses its
 * working dots when busy.
 */
export function BotAvatar({
  name,
  size = 42,
  mood = 'idle',
}: {
  name: string
  size?: number
  mood?: Mood
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const moodRef = useRef<Mood>(mood)

  useEffect(() => {
    moodRef.current = mood
  }, [mood])

  const isPrimary = name === 'default'
  const shape: Shape = isPrimary ? 'squircle' : defaultShape(name)
  const color = isPrimary ? PRIMARY_COLOR : nameColor(name)
  const eyeFill = isDarkColor(color) ? 'rgba(232,220,195,0.95)' : 'rgba(0,0,0,0.85)'
  const hlFill = isDarkColor(color) ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.85)'

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const bodyEl = svg.querySelector<SVGElement>('[data-body]')
    const open = svg.querySelector<SVGElement>('[data-open]')
    const el = svg.querySelector<SVGElement>('[data-el]')
    const er = svg.querySelector<SVGElement>('[data-er]')
    const hlL = svg.querySelector<SVGElement>('[data-hl-l]')
    const hlR = svg.querySelector<SVGElement>('[data-hl-r]')
    const shutL = svg.querySelector<SVGElement>('[data-shut-l]')
    const shutR = svg.querySelector<SVGElement>('[data-shut-r]')
    const dots = Array.from(svg.querySelectorAll<SVGElement>('[data-dot]'))

    let raf = 0
    const t0 = performance.now()

    const tick = (now: number) => {
      const t = (now - t0) / 1000
      const pose = moodRef.current === 'work' ? workPose(t) : idlePose(t)

      const eyeL = 15.4 + pose.gazeX
      const eyeR = 24.6 + pose.gazeX
      const eyeY = 17.2 + pose.gazeY

      bodyEl?.setAttribute('transform', `rotate(${pose.tilt.toFixed(2)} 20 20)`)
      el?.setAttribute('cx', eyeL.toFixed(2))
      el?.setAttribute('cy', eyeY.toFixed(2))
      er?.setAttribute('cx', eyeR.toFixed(2))
      er?.setAttribute('cy', eyeY.toFixed(2))
      hlL?.setAttribute('cx', (eyeL - 0.6).toFixed(2))
      hlL?.setAttribute('cy', (eyeY - 0.7).toFixed(2))
      hlR?.setAttribute('cx', (eyeR - 0.6).toFixed(2))
      hlR?.setAttribute('cy', (eyeY - 0.7).toFixed(2))
      open?.setAttribute('opacity', pose.blink ? '0' : '1')
      shutL?.setAttribute('d', `M${(eyeL - 2.6).toFixed(2)} ${eyeY.toFixed(2)} L${(eyeL + 2.6).toFixed(2)} ${eyeY.toFixed(2)}`)
      shutR?.setAttribute('d', `M${(eyeR - 2.6).toFixed(2)} ${eyeY.toFixed(2)} L${(eyeR + 2.6).toFixed(2)} ${eyeY.toFixed(2)}`)
      dots.forEach((d, i) => d.setAttribute('opacity', pose.dots[i].toFixed(2)))

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg ref={svgRef} width={size} height={size} viewBox="0 0 40 44" aria-hidden="true" style={{ flexShrink: 0 }}>
      <g data-body>{body(shape, color)}</g>
      <g data-open>
        <ellipse data-el cx={15.4} cy={17.2} rx={2.2} ry={2.3} fill={eyeFill} />
        <ellipse data-er cx={24.6} cy={17.2} rx={2.2} ry={2.3} fill={eyeFill} />
        <circle data-hl-l cx={14.8} cy={16.5} r={0.65} fill={hlFill} />
        <circle data-hl-r cx={24} cy={16.5} r={0.65} fill={hlFill} />
      </g>
      <g data-shut fill="none" stroke={eyeFill} strokeWidth={2} strokeLinecap="round" opacity={0}>
        <path data-shut-l d="M12.8 17.2 L18 17.2" />
        <path data-shut-r d="M22 17.2 L27.2 17.2" />
      </g>
      <g data-dots>
        <circle data-dot cx={16.4} cy={41.2} r={1.15} fill={color} opacity={0} />
        <circle data-dot cx={20} cy={41.2} r={1.15} fill={color} opacity={0} />
        <circle data-dot cx={23.6} cy={41.2} r={1.15} fill={color} opacity={0} />
      </g>
    </svg>
  )
}
