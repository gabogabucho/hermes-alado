import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * iOS-style grouped inset list: a small-caps section label above a single
 * rounded card whose rows are separated by hairlines (inset after the icon).
 */
export function Section({
  label,
  children,
  footer,
}: {
  label?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="section">
      {label && <div className="section-label">{label}</div>}
      <div className="section-card">{children}</div>
      {footer && <div className="section-footer">{footer}</div>}
    </section>
  )
}

export type RowTint = 'accent' | 'ok' | 'danger' | 'warn' | 'neutral'

/** One tappable row inside a `Section` card. */
export function Row({
  icon,
  leading,
  tint = 'neutral',
  title,
  subtitle,
  value,
  trailing,
  chevron = false,
  onClick,
  disabled = false,
  children,
}: {
  icon?: IconName
  leading?: ReactNode
  tint?: RowTint
  title: ReactNode
  subtitle?: ReactNode
  value?: ReactNode
  trailing?: ReactNode
  chevron?: boolean
  onClick?: () => void
  disabled?: boolean
  children?: ReactNode
}) {
  const hasIcon = Boolean(icon || leading)
  const inner = (
    <>
      {leading ? (
        <span className="row-leading">{leading}</span>
      ) : icon ? (
        <span className={`row-icon row-icon--${tint}`}>
          <Icon name={icon} size={18} />
        </span>
      ) : null}
      <span className="row-body">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
        {children}
      </span>
      {trailing ?? (
        value != null ? (
          <span className="row-value">{value}</span>
        ) : null
      )}
      {chevron && (
        <span className="row-chevron">
          <Icon name="chevron-right" size={18} />
        </span>
      )}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={`row${hasIcon ? ' row--icon' : ''}`}
        onClick={onClick}
        disabled={disabled}
      >
        {inner}
      </button>
    )
  }

  return <div className={`row${hasIcon ? ' row--icon' : ''}`}>{inner}</div>
}
