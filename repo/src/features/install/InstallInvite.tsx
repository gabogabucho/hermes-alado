import { useEffect, useState } from 'react'
import { InstallSheet } from './InstallSheet'
import {
  canNativeInstall,
  captureInstallPrompt,
  isIOS,
  onInstallPromptCaptured,
  shouldOfferInstall,
} from './install-prompt'

/**
 * Mounted inside the authed shell: captures `beforeinstallprompt` and offers
 * the install sheet shortly after the first login of a run (the shell only
 * renders once authed, so this is exactly the "after login on first run" slot).
 *
 * iOS shows the manual steps right away; Android waits for the browser's
 * install event (it arrives asynchronously) and falls back to the steps sheet
 * if it never does.
 */
export function InstallInvite() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    captureInstallPrompt()
    if (!shouldOfferInstall()) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = () => {
      if (!cancelled) setOpen(true)
    }

    if (isIOS()) {
      timer = setTimeout(show, 1200)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }

    if (canNativeInstall()) {
      timer = setTimeout(show, 1200)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }

    const unsubscribe = onInstallPromptCaptured(show)
    timer = setTimeout(() => {
      unsubscribe()
      show()
    }, 6000)
    return () => {
      cancelled = true
      unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  return <InstallSheet open={open} onClose={() => setOpen(false)} />
}
