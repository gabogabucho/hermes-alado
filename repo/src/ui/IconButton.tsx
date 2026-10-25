import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'

type Variant = 'glass' | 'solid' | 'ghost'

export function IconButton({
  icon,
  variant = 'glass',
  label,
  ...rest
}: {
  icon: IconName
  variant?: Variant
  label: string
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`icon-button icon-button--${variant}`}
      aria-label={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
}
