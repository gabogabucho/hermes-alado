import type { ReactNode } from 'react'

/** Icon in a soft circle + title + one helpful line + optional primary CTA. */
export function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode
  title: string
  text?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-state-icon">{icon}</span>}
      <h2 className="empty-state-title">{title}</h2>
      {text && <p className="empty-state-text">{text}</p>}
      {actionLabel && onAction && (
        <button type="button" className="btn btn-primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}
