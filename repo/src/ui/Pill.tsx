import type { ReactNode } from 'react'

export function Pill({
  children,
  leading,
}: {
  children: ReactNode
  leading?: ReactNode
}) {
  return (
    <span className="pill">
      {leading && <span className="pill-leading">{leading}</span>}
      {children}
    </span>
  )
}
