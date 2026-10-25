import { useState, type ReactNode, type UIEvent } from 'react'
import { IconButton } from './IconButton'

/**
 * One header for every sub-screen: safe-area top padding, 16px side gutters,
 * back `IconButton` (glass), title, optional trailing actions. Becomes a
 * compact blurred bar once the content scrolls.
 */
export function PageHeader({
  title,
  onBack,
  actions,
  compact,
}: {
  title: ReactNode
  onBack?: () => void
  actions?: ReactNode
  compact: boolean
}) {
  return (
    <header className={`page-header${compact ? ' page-header--compact' : ''}`}>
      {onBack && <IconButton icon="back" variant="glass" label="Volver" onClick={onBack} />}
      <h1 className="page-header-title">{title}</h1>
      {actions && <span className="page-header-actions">{actions}</span>}
    </header>
  )
}

/**
 * The standard sub-screen frame: sticky header + a scrollable, safe-area-padded
 * body with 16px gutters. Replaces every ad-hoc header + `.settings-page`/bare
 * `<div>` scroll idiom (several sub-pages had no scroll container at all and
 * were clipped at the viewport).
 */
export function PageShell({
  title,
  onBack,
  actions,
  children,
}: {
  title: ReactNode
  onBack?: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  const [compact, setCompact] = useState(false)

  function onScroll(e: UIEvent<HTMLDivElement>) {
    setCompact(e.currentTarget.scrollTop > 8)
  }

  return (
    <div className="page-shell">
      <PageHeader title={title} onBack={onBack} actions={actions} compact={compact} />
      <div className="page-shell-scroll" onScroll={onScroll}>
        {children}
      </div>
    </div>
  )
}
