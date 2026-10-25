// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Ported from apps/desktop/src/lib/budgeted-loop.ts (commit bf0203a).

/**
 * Budgeted renderer loop — the one way to run a decorative rAF animation.
 *
 *  - **fps budget** — paints are skipped until `1000 / fps` elapsed; the loop
 *    still rides rAF so Chromium can align and pause it natively.
 *  - **observability pause** — the loop cancels while the window is hidden
 *    (and, optionally, while unfocused) and resumes when visible again.
 *  - **idle dormancy** — when `idleWhen()` returns true after a draw, the loop
 *    parks (zero pending frames, zero timers) until `wake()` is called.
 *  - **teardown** — `dispose()` cancels the frame, detaches listeners, and
 *    makes every later `wake()` a no-op.
 */

export interface BudgetedLoopOptions {
  /** Paint budget in frames per second. Default 15 — visually smooth for
   *  decorative/avatar-scale animation at a quarter of display cadence. */
  fps?: number
  /** Return true when there is nothing worth animating (no visible targets,
   *  animation finished). Checked after every draw; when true the loop parks
   *  until `wake()`. Omit for loops that should run whenever observable. */
  idleWhen?: () => boolean
  /** Pause while the window loses focus, not only while hidden. Default false. */
  pauseWhenUnfocused?: boolean
}

export interface BudgetedLoop {
  /** Cancel everything and detach listeners. Idempotent; wake() after this is
   *  a no-op. Call from effect cleanup. */
  dispose: () => void
  /** True while parked by `idleWhen` (diagnostics/tests). */
  isDormant: () => boolean
  /** Resume a loop parked by `idleWhen` (e.g. a target mounted or scrolled
   *  into view). Safe to call redundantly; no-op while running or disposed. */
  wake: () => void
}

function createPauseController(onChange: () => void, pauseWhenUnfocused: boolean) {
  let windowFocused = document.hasFocus()

  const onVisibilityChange = () => onChange()

  const onBlur = () => {
    if (windowFocused) {
      windowFocused = false
      onChange()
    }
  }

  const onFocus = () => {
    if (!windowFocused) {
      windowFocused = true
      onChange()
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange)

  if (pauseWhenUnfocused) {
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
  }

  return {
    dispose: () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    },
    isPaused: () => document.visibilityState === 'hidden' || (pauseWhenUnfocused && !windowFocused)
  }
}

export function createBudgetedLoop(
  draw: (now: number) => void,
  { fps = 15, idleWhen, pauseWhenUnfocused = false }: BudgetedLoopOptions = {}
): BudgetedLoop {
  const frameInterval = 1000 / fps
  let frame = 0
  let lastDraw = -Infinity
  let dormant = false
  let disposed = false

  const cancelFrame = () => {
    if (frame !== 0) {
      window.cancelAnimationFrame(frame)
      frame = 0
    }
  }

  const scheduleFrame = () => {
    if (disposed || dormant || pauseController.isPaused() || frame !== 0) {
      return
    }

    frame = window.requestAnimationFrame(tick)
  }

  const tick = (now: number) => {
    frame = 0

    if (disposed || pauseController.isPaused()) {
      return
    }

    if (now - lastDraw >= frameInterval) {
      draw(now)
      lastDraw = now
    }

    // Idle dormancy: nothing to animate -> park with zero pending work.
    // The owner wakes us when a target (re)appears.
    if (idleWhen?.()) {
      dormant = true

      return
    }

    scheduleFrame()
  }

  const handlePauseChange = () => {
    cancelFrame()
    scheduleFrame()
  }

  const pauseController = createPauseController(handlePauseChange, pauseWhenUnfocused)

  const wake = () => {
    if (disposed || !dormant) {
      return
    }

    dormant = false
    scheduleFrame()
  }

  scheduleFrame()

  return {
    dispose: () => {
      if (disposed) {
        return
      }

      disposed = true
      cancelFrame()
      pauseController.dispose()
    },
    isDormant: () => dormant,
    wake
  }
}
