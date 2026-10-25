import { NavLink } from 'react-router-dom'

const items = [
  { to: '/profiles', label: 'Bots', icon: '◉' },
  { to: '/connectors', label: 'Conectores', icon: '⇄' },
  { to: '/settings', label: 'Ajustes', icon: '⚙' },
]

export function BottomNav() {
  return (
    <nav className="navbar">
      {items.map(it => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) => `navbar-item${isActive ? ' active' : ''}`}
        >
          <span className="navbar-icon">{it.icon}</span>
          <span className="navbar-label">{it.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
