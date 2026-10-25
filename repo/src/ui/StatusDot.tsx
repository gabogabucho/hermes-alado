import type { ReactNode } from 'react'

export type DotTone = 'ok' | 'warn' | 'danger' | 'neutral'

/** A small colored dot + optional short label ("Conectado", "Requiere
 *  configuración") — the quiet alternative to outlined pills full of text. */
export function StatusDot({
  tone = 'neutral',
  label,
}: {
  tone?: DotTone
  label?: ReactNode
}) {
  return (
    <span className={`status-dot status-dot--${tone}`}>
      <span className="status-dot-mark" aria-hidden="true" />
      {label != null && <span className="status-dot-label">{label}</span>}
    </span>
  )
}

/** A tiny count/state badge for a header ("3 activos"). */
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>
}
