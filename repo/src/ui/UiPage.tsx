import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { setTheme, theme, type ThemeChoice } from '../features/settings/store'
import { Avatar, AvatarStack, type AvatarMood, type AvatarShape } from './Avatar'
import { Icon, type IconName } from './Icon'
import { IconButton } from './IconButton'
import { ListRow } from './ListRow'
import { Pill } from './Pill'
import { Sheet } from './Sheet'
import { Skeleton } from './Skeleton'
import { Toggle } from './Toggle'

const SHAPES: AvatarShape[] = ['blob', 'drop', 'bean', 'square', 'ghost', 'star']
const MOODS: AvatarMood[] = ['idle', 'thinking', 'happy', 'sleeping']
const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'hermes', label: 'Hermes' },
  { value: 'clean', label: 'Clean' },
]
const ICONS: IconName[] = [
  'back', 'plus', 'more', 'search', 'grid', 'mic', 'send', 'stop', 'settings',
  'chevron-right', 'check', 'arrow-down', 'paperclip', 'close', 'bolt',
  'calendar', 'folder', 'monitor', 'bell',
]

export function UiPage() {
  const [on, setOn] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const currentTheme = useStore(theme)

  return (
    <div>
      <h1 className="page-title">Design system</h1>

      <section className="ui-section">
        <h2>Tema</h2>
        <div className="ui-grid">
          {THEME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`btn${currentTheme === opt.value ? ' btn-primary' : ''}`}
              onClick={() => setTheme(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="ui-section">
        <h2>IconButton</h2>
        <div className="ui-grid">
          <IconButton icon="back" label="Volver" />
          <IconButton icon="plus" variant="solid" label="Agregar" />
          <IconButton icon="close" variant="ghost" label="Cerrar" />
        </div>
      </section>

      <section className="ui-section">
        <h2>Pill</h2>
        <div className="ui-grid">
          <Pill>3 conectados</Pill>
          <Pill leading={<Avatar name="Pill" size="xs" />}>Con avatar</Pill>
        </div>
      </section>

      <section className="ui-section">
        <h2>ListRow</h2>
        <div className="list">
          <ListRow leading={<Avatar name="Fila" size="sm" />} title="Bot de ventas" subtitle="Última vez ayer" trailing="19:42" />
          <ListRow leading={<Avatar name="Otra" size="sm" />} title="Bot de soporte" subtitle="Mensaje de Agentes AI…" trailing={<Icon name="chevron-right" />} />
        </div>
      </section>

      <section className="ui-section">
        <h2>Toggle</h2>
        <div className="ui-grid">
          <Toggle checked={on} onChange={setOn} label="Notificaciones" />
          <span className="muted">{on ? 'on' : 'off'}</span>
        </div>
      </section>

      <section className="ui-section">
        <h2>Sheet</h2>
        <button className="btn" onClick={() => setSheetOpen(true)}>Abrir sheet</button>
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Un sheet">
          <p className="muted">Contenido del bottom sheet.</p>
        </Sheet>
      </section>

      <section className="ui-section">
        <h2>Avatar — formas × estados</h2>
        {SHAPES.map(shape => (
          <div key={shape} className="ui-grid" style={{ marginBottom: 8 }}>
            {MOODS.map(mood => (
              <Avatar key={mood} name={shape} shape={shape} mood={mood} />
            ))}
            <Avatar name={shape} shape={shape} ring badge />
          </div>
        ))}
      </section>

      <section className="ui-section">
        <h2>Avatar sizes + stack</h2>
        <div className="ui-grid">
          <Avatar name="xs" size="xs" />
          <Avatar name="sm" size="sm" />
          <Avatar name="md" size="md" />
          <Avatar name="lg" size="lg" />
          <Avatar name="xl" size="xl" />
        </div>
        <div className="ui-grid" style={{ marginTop: 8 }}>
          <AvatarStack names={['uno', 'dos', 'tres', 'cuatro', 'cinco']} size="sm" />
        </div>
      </section>

      <section className="ui-section">
        <h2>Skeleton</h2>
        <div className="list">
          <Skeleton width={220} />
          <Skeleton variant="circle" width={40} height={40} />
        </div>
      </section>

      <section className="ui-section">
        <h2>Icon</h2>
        <div className="ui-grid">
          {ICONS.map(name => (
            <span key={name} title={name} className="row" style={{ gap: 6 }}>
              <Icon name={name} />
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
