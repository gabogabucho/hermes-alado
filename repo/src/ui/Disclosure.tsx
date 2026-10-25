import { useState, type ReactNode } from 'react'

/**
 * A collapsible "Detalles técnicos" block: chevron + animated height. The
 * height animation uses the CSS grid `0fr → 1fr` trick so it works without
 * measuring content.
 */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`disclosure${open ? ' disclosure--open' : ''}`}>
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="disclosure-title">{title}</span>
        <svg
          className="disclosure-chevron"
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      <div className="disclosure-body" aria-hidden={!open}>
        <div className="disclosure-inner">{children}</div>
      </div>
    </div>
  )
}
