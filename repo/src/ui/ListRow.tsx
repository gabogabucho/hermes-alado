import type { ReactNode } from 'react'

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
}) {
  const inner = (
    <>
      {leading && <span className="list-row-leading">{leading}</span>}
      <span className="list-row-body">
        <span className="list-row-title">{title}</span>
        {subtitle && <span className="list-row-subtitle">{subtitle}</span>}
      </span>
      {trailing && <span className="list-row-trailing">{trailing}</span>}
    </>
  )

  if (onClick) {
    return (
      <button className="list-row" type="button" onClick={onClick}>
        {inner}
      </button>
    )
  }

  return <div className="list-row">{inner}</div>
}
