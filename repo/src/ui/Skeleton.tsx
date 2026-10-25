export function Skeleton({
  variant = 'line',
  width = '100%',
  height,
}: {
  variant?: 'line' | 'circle'
  width?: number | string
  height?: number | string
}) {
  const style = { width, height: height ?? (variant === 'circle' ? width : undefined) }
  return <span className={`skeleton skeleton--${variant}`} style={style} aria-hidden="true" />
}
