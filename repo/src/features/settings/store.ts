import { atom } from 'nanostores'
import { getBackendUrl, setBackendUrl } from '../../lib/config'

export type ThemeChoice = 'system' | 'hermes' | 'clean'

const THEME_KEY = 'droidbot.theme'

function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'hermes' || v === 'clean' ? v : 'system'
  } catch {
    return 'system'
  }
}

function resolve(choice: ThemeChoice): 'hermes' | 'clean' {
  if (choice === 'hermes' || choice === 'clean') return choice
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'hermes' : 'clean'
}

function applyTheme(choice: ThemeChoice): void {
  const resolved = resolve(choice)
  document.documentElement.setAttribute('data-theme', resolved)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'hermes' ? '#17120c' : '#f2f2f4')
}

export const backendUrl = atom<string>(getBackendUrl())
export const theme = atom<ThemeChoice>(readTheme())

export function updateBackendUrl(url: string): void {
  setBackendUrl(url)
  backendUrl.set(getBackendUrl())
}

export function setTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_KEY, choice)
  } catch {
    // storage unavailable; the in-memory choice still applies for this session
  }
  applyTheme(choice)
  theme.set(choice)
}

// Follow the OS preference while "system" is selected.
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    if (theme.get() === 'system') applyTheme('system')
  })
