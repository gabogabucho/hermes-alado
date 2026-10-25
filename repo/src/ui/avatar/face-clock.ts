// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Ported from apps/desktop/src/plugins/hermes-bots/avatar.tsx (commit bf0203a).

/**
 * The single shared face clock: one budgeted loop (15 fps, parks when nothing
 * is visible, pauses when the tab is hidden) that paints every mounted math
 * face. Static under `prefers-reduced-motion`.
 */

import { createBudgetedLoop } from './budgeted-loop'
import { projectFacePoint, ringToPath, sampleFaceRing } from './shapes'
import type { FaceMood } from './appearance'

/** One frame of the face: head orientation, gaze offset, blink, and the three
 *  working dots' opacities. */
export interface FacePose {
  blink: boolean
  d0: number
  d1: number
  d2: number
  gazeX: number
  gazeY: number
  roll: number
  tilt: number
  turn: number
}

/** Working poses lean and sway; idle stays small. */
export function facePose(mood: FaceMood | string, t: number): FacePose {
  if (mood === 'think') {
    return {
      turn: -18 + Math.sin(t * 0.55) * 14,
      tilt: Math.sin(t * 0.48) * 12 + Math.sin(t * 1.35) * 3,
      roll: Math.sin(t * 0.95) * 10,
      gazeX: Math.sin(t * 0.7) * 3.6,
      gazeY: -2.2 + Math.sin(t * 0.4) * 2.2,
      blink: t % 1.45 > 1.26,
      d0: 0.2 + 0.8 * Math.max(0, Math.sin(t * 2.4)),
      d1: 0.2 + 0.8 * Math.max(0, Math.sin(t * 2.4 - 0.7)),
      d2: 0.2 + 0.8 * Math.max(0, Math.sin(t * 2.4 - 1.4))
    }
  }

  if (mood === 'work') {
    return {
      turn: -11 + Math.sin(t * 0.48) * 8,
      tilt: Math.sin(t * 0.42) * 8 + Math.sin(t * 1.1) * 1.6,
      roll: Math.sin(t * 0.75) * 4.2,
      gazeX: Math.sin(t * 0.55) * 3.6,
      gazeY: -1.6 + Math.sin(t * 0.38) * 2,
      blink: t % 1.45 > 1.26,
      d0: 0.2 + 0.8 * Math.max(0, Math.sin(t * 2.6)),
      d1: 0.2 + 0.8 * Math.max(0, Math.sin(t * 2.6 - 0.7)),
      d2: 0.2 + 0.8 * Math.max(0, Math.sin(t * 2.6 - 1.4))
    }
  }

  return {
    turn: Math.sin(t * 0.5) * 1.5,
    tilt: Math.sin(t * 0.27),
    roll: Math.sin(t * 0.85) * 1.2,
    gazeX: 0,
    gazeY: 0,
    blink: t % 3.2 > 3.02,
    d0: 0,
    d1: 0,
    d2: 0
  }
}

/** The eyes and catchlights are positioned with raw numbers.
 *  `Element.setAttribute` declares a string value and the DOM coerces —
 *  stringifying at each call site would be a behavior change. */
interface NumericAttrNode {
  setAttribute(name: string, value: number | string): void
}

const faceTransitions = new WeakMap<SVGSVGElement, { mood: string; pose: FacePose; from: FacePose; since: number }>()

/** Blend from the last painted pose in elapsed time, even after a paused clock. */
function settlePose(svg: SVGSVGElement, mood: string, target: FacePose, t: number): FacePose {
  let state = faceTransitions.get(svg)

  if (!state) {
    state = { mood, pose: target, from: target, since: t - 0.4 }
    faceTransitions.set(svg, state)
  }

  if (state.mood !== mood) {
    state.mood = mood
    state.from = state.pose
    state.since = t
  }

  const progress = Math.min(1, Math.max(0, (t - state.since) / 0.4))
  const blend = 1 - (1 - progress) ** 2
  const pose = { ...target }
  const keys = ['turn', 'tilt', 'roll', 'gazeX', 'gazeY', 'd0', 'd1', 'd2'] as const

  for (const key of keys) {
    pose[key] = state.from[key] + (target[key] - state.from[key]) * blend
  }

  state.pose = pose

  return pose
}

export function paintMathFace(svg: SVGSVGElement, t: number) {
  const mood = svg.getAttribute('data-hb-mood') || 'idle'
  const shape = svg.getAttribute('data-hb-shape') || 'circle'
  const pose = settlePose(svg, mood, facePose(mood, t), t)
  const body = svg.querySelector('[data-hb-body]')
  const open = svg.querySelector('[data-hb-open]')
  const shut = svg.querySelector('[data-hb-shut]')
  const el: NumericAttrNode | null = svg.querySelector('[data-hb-el]')
  const er: NumericAttrNode | null = svg.querySelector('[data-hb-er]')
  const dots = svg.querySelectorAll('[data-hb-dot]')

  if (body) {
    if (shape === 'cloud') {
      body.setAttribute('d', 'M11 32 a7.5 7.5 0 0 1 -1 -14.9 A9.5 9.5 0 0 1 29 12.5 A7 7 0 0 1 30 32 Z')
    } else {
      const ring = sampleFaceRing(shape).map(([x, y]) => projectFacePoint(x, y, pose.turn, pose.tilt, pose.roll))
      body.setAttribute('d', ringToPath(ring))
    }
  }

  const eyeY = (shape === 'cloud' ? 22 : 17.2) + pose.gazeY
  const eyeL = 15.4 + pose.gazeX
  const eyeR = 24.6 + pose.gazeX

  if (el) {
    el.setAttribute('cx', eyeL)
    el.setAttribute('cy', eyeY)
  }

  if (er) {
    er.setAttribute('cx', eyeR)
    er.setAttribute('cy', eyeY)
  }

  // Catchlights ride the pupils (upper-left offset) — without this they
  // stay at the circle-face position and drift outside e.g. the cloud's
  // lower-set eyes.
  const hl: NumericAttrNode | null = svg.querySelector('[data-hb-hl-l]')
  const hr: NumericAttrNode | null = svg.querySelector('[data-hb-hl-r]')

  if (hl) {
    hl.setAttribute('cx', eyeL - 0.6)
    hl.setAttribute('cy', eyeY - 0.7)
  }

  if (hr) {
    hr.setAttribute('cx', eyeR - 0.6)
    hr.setAttribute('cy', eyeY - 0.7)
  }

  if (open) {
    open.setAttribute('opacity', pose.blink ? '0' : '1')
  }

  if (shut) {
    shut.setAttribute(
      'd',
      `M${eyeL - 2.6} ${eyeY} L${eyeL + 2.6} ${eyeY} M${eyeR - 2.6} ${eyeY} L${eyeR + 2.6} ${eyeY}`
    )
    shut.setAttribute('opacity', pose.blink ? '1' : '0')
  }

  dots.forEach((dot, i) => {
    const o = i === 0 ? pose.d0 : i === 1 ? pose.d1 : pose.d2
    dot.setAttribute('opacity', String(o))
  })
  svg.style.transform = `rotate(${pose.tilt}deg)`
  svg.style.transformOrigin = '50% 70%'
}

function walkMathFaces(root: Document | ShadowRoot | null, acc: SVGSVGElement[]): SVGSVGElement[] {
  if (!root || !root.querySelectorAll) {
    return acc
  }

  root.querySelectorAll<SVGSVGElement>('svg[data-hb-math]').forEach(node => acc.push(node))
  root.querySelectorAll('*').forEach(el => {
    if (el.shadowRoot) {
      walkMathFaces(el.shadowRoot, acc)
    }
  })

  return acc
}

/** The single shared face clock, parked on `window` so a second plugin load
 *  adopts the running one instead of starting a rival rAF loop. */
interface FaceClock {
  stop: () => void
  wake: () => void
}

declare global {
  interface Window {
    __dbFaceClock?: FaceClock
  }
}

export function startFaceClock() {
  if (typeof window === 'undefined') {
    return
  }

  if (window.__dbFaceClock) {
    // Already initialized (possibly parked) — make sure it's awake. BotFace
    // renders route here, so a face mounting is what wakes a dormant clock.
    window.__dbFaceClock.wake()

    return
  }

  // Static faces: the initial paint already shows the resting pose.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }

  const t0 = performance.now()
  // A large roster can mount hundreds of faces. Observe the cached nodes so
  // off-screen cards do not consume a full animation frame by themselves.
  let faces: SVGSVGElement[] = []
  let lastScan = -Infinity
  // Fed from IntersectionObserver entries, whose `target` is a plain Element.
  const visibleFaces = new Set<Element>()
  const observedFaces = new Set<SVGSVGElement>()

  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
          let becameVisible = false

          for (const entry of entries) {
            if (entry.isIntersecting) {
              visibleFaces.add(entry.target)
              becameVisible = true
            } else {
              visibleFaces.delete(entry.target)
            }
          }

          // A parked clock (no visible faces) resumes when one scrolls in.
          if (becameVisible) {
            window.__dbFaceClock?.wake()
          }
        })
      : null

  const scanFaces = () => {
    faces = walkMathFaces(document, [])

    if (!observer) {
      return
    }

    const currentFaces = new Set(faces)

    for (const svg of observedFaces) {
      if (!currentFaces.has(svg)) {
        observer.unobserve(svg)
        observedFaces.delete(svg)
        visibleFaces.delete(svg)
      }
    }

    for (const svg of faces) {
      if (!observedFaces.has(svg)) {
        observedFaces.add(svg)
        observer.observe(svg)
      }
    }
  }

  // Shared painting body: 1Hz document rescans, paint only visible faces
  // (all cached faces when IO is unavailable).
  const paint = (now: number) => {
    if (now - lastScan > 1000) {
      scanFaces()
      lastScan = now
    }

    const t = (now - t0) / 1000
    const facesToPaint = observer ? visibleFaces : faces

    for (const svg of facesToPaint) {
      if (svg.isConnected) {
        // Both caches only ever hold nodes matched by `svg[data-hb-math]`.
        paintMathFace(svg as SVGSVGElement, t)
      }
    }
  }

  // Nothing worth animating: no faces mounted (BotFace wakes us on the next
  // mount) or none visible (the observer wakes us when one scrolls in).
  const idle = () => faces.length === 0 || (observer ? visibleFaces.size === 0 : false)

  const teardownCaches = () => {
    if (observer) {
      observer.disconnect()
    }

    visibleFaces.clear()
    observedFaces.clear()
    faces = []
    delete window.__dbFaceClock
  }

  const loop = createBudgetedLoop(paint, {
    fps: 15,
    idleWhen: idle
  })

  window.__dbFaceClock = {
    stop: () => {
      loop.dispose()
      teardownCaches()
    },
    wake: () => {
      // Faces may have mounted/unmounted while parked — rescan on wake.
      lastScan = -Infinity
      loop.wake()
    }
  }
}

/** Tear the face clock down — cancels the animation frame, disconnects the
 *  visibility observer, and drops all cached nodes. */
export function stopFaceClock() {
  if (typeof window !== 'undefined' && window.__dbFaceClock) {
    window.__dbFaceClock.stop()
  }
}
