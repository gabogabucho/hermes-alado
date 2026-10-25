import { useNavigate, type NavigateFunction, type NavigateOptions, type To } from 'react-router-dom'

type VtDoc = Document & { startViewTransition?: (cb: () => void) => void }

/**
 * Horizontal slide between routes via the View Transitions API when available,
 * a plain swap otherwise. Respects `prefers-reduced-motion`.
 */
export function startSlide(dir: 'forward' | 'back', update: () => void): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const doc = document as VtDoc
  if (reduced || typeof doc.startViewTransition !== 'function') {
    update()
    return
  }
  document.documentElement.dataset.vtDir = dir
  doc.startViewTransition(update)
}

/** A navigate that slides horizontally (forward by default). */
export function useSlideNavigate(): {
  navigate: NavigateFunction
  forward: (to: To, options?: NavigateOptions) => void
  back: () => void
} {
  const navigate = useNavigate()
  return {
    navigate,
    forward: (to, options) => startSlide('forward', () => navigate(to, options)),
    back: () => startSlide('back', () => navigate(-1)),
  }
}

/**
 * A back button that never strands the user: if there is in-app history it
 * slides back one step, otherwise it navigates to `fallback` (deep links land
 * on the app without any prior entry). Use this in EVERY back button.
 */
export function useBack(fallback: To): () => void {
  const navigate = useNavigate()
  return () => {
    const idx: number | undefined = window.history.state?.idx
    if (typeof idx === 'number' && idx > 0) {
      startSlide('back', () => navigate(-1))
    } else {
      startSlide('back', () => navigate(fallback))
    }
  }
}
