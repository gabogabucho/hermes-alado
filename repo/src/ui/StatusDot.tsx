import type { ReactNode } from 'react'

export type DotTone = 'ok' | 'warn' | 'danger' | 'neutral'

/** A small colored dot + optional short label ("Conectado", "Requiere
 *  configuración") — the quiet alternative to outlined pills full of text.
 *  Pass `ariaLabel` to keep the state accessible when the label is hidden. */
export function StatusDot({
  tone = 'neutral',
  label,
  ariaLabel,
}: {
  tone?: DotTone
  label?: ReactNode
  ariaLabel?: string
}) {
  return (
    <span
      className={`status-dot status-dot--${tone}`}
      {...(ariaLabel !== undefined ? { role: 'img', 'aria-label': ariaLabel } : {})}
    >
      <span className="status-dot-mark" aria-hidden="true" />
      {label != null && <span className="status-dot-label">{label}</span>}
    </span>
  )
}

/** A tiny count/state badge for a header ("3 activos"). */
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>
}
