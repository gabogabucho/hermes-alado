import { createElement } from 'react'
import { resolveBrandIcon } from './brand/brand-icon'
import { brandDomainByName } from './brand/brand-domains'

/** Extract a bare hostname (www-stripped) from a URL string, or null. */
function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
    return host || null
  } catch {
    return null
  }
}

/** Deterministic, calm hue for a name (the fallback tile's tint). */
function hueFor(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

/**
 * A connector/provider brand glyph. Resolves the brand the same way the desktop
 * does (`resolveBrandIcon`), from a URL host or a known name; falls back to a
 * tinted tile with the initial so no row is ever bare.
 */
export function BrandIcon({
  name,
  url,
  size = 28,
}: {
  name: string
  url?: string | null
  size?: number
}) {
  const IconComp = resolveBrandIcon(hostnameOf(url) ?? brandDomainByName(name) ?? '')

  if (IconComp) {
    return (
      <span className="brand-icon" style={{ width: size, height: size }} aria-hidden="true">
        {createElement(IconComp, { title: '', width: '100%', height: '100%' })}
      </span>
    )
  }

  const hue = hueFor(name)
  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      className="brand-icon brand-icon--fallback"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.46),
        background: `hsl(${hue} 42% 50% / 0.16)`,
        color: `hsl(${hue} 44% 42%)`,
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}
