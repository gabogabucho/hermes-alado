export function ConnectorIcon({ name, size = 40 }: { name: string; size?: number }) {
  const letter = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <span className="connector-icon" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {letter}
    </span>
  )
}
