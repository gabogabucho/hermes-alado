import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { setTheme, theme, type ThemeChoice } from '../features/settings/store'
import { Avatar, AvatarStack, type AvatarMood } from './Avatar'
import type { AvatarAppearance } from './avatar/appearance'
import { Icon, type IconName } from './Icon'
import { IconButton } from './IconButton'
import { ListRow } from './ListRow'
import { Pill } from './Pill'
import { Sheet } from './Sheet'
import { Skeleton } from './Skeleton'
import { Toggle } from './Toggle'

const SHAPES = ['circle', 'squircle', 'pill', 'triangle', 'hexagon', 'cloud', 'drop']
const SOLIDS = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron']
const SIGILS = ['sigil-1', 'sigil-2', 'sigil-3']
const BLOB_FACES: AvatarAppearance[] = [
  { shape: 'blobatar:alpha:round', color: null, image: null },
  { shape: 'blobatar:beta:cloud', color: null, image: null },
  { shape: 'blobatar:gamma:triangle', color: null, image: null },
  { shape: 'blobatar:delta:droplet', color: null, image: null },
]
const MOODS: AvatarMood[] = ['idle', 'thinking', 'working']
const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Automático' },
  { value: 'hermes', label: 'Hermes' },
  { value: 'clean', label: 'Clean' },
]
const ICONS: IconName[] = [
  'back', 'plus', 'more', 'search', 'grid', 'mic', 'send', 'stop', 'settings',
  'chevron-right', 'check', 'arrow-down', 'paperclip', 'close', 'bolt',
  'calendar', 'folder', 'monitor', 'bell',
]

// Wordmark candidates (all SIL OFL 1.1). Bodoni Moda is the default — the
// sharpest, most condensed of the three, closest to the desktop's Collapse.
const WORDMARK_CANDIDATES: { name: string; family: string; note: string }[] = [
  { name: 'Bodoni Moda 700', family: "'Bodoni Moda', serif", note: 'default · OFL 1.1' },
  { name: 'Playfair Display 700', family: "'Playfair Display', serif", note: 'OFL 1.1' },
  { name: 'DM Serif Display 400', family: "'DM Serif Display', serif", note: 'OFL 1.1' },
]

// 1×1 dark-gray PNG — a stand-in uploaded photo (renders with the desktop's
// 22% radius + cover crop).
const PHOTO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg=='

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
        <h2>Wordmark — candidatos (elegir uno)</h2>
        <div className="list">
          {WORDMARK_CANDIDATES.map(c => (
            <div key={c.name} className="card">
              <span className="label-mono">
                {c.name} · {c.note}
              </span>
              <p className="wordmark" style={{ fontFamily: c.family, fontSize: '2.6rem' }}>
                HERMES AGENT
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="ui-section">
        <h2>Tipografía de estado</h2>
        <div className="ui-grid">
          <span className="label-mono">SESSIONS · BOTS</span>
          <span className="connect-glyphs">CONNECT</span>
        </div>
      </section>

      <section className="ui-section">
        <h2>Textura de fondo</h2>
        <div
          className="card"
          style={{ position: 'relative', isolation: 'isolate', overflow: 'hidden', padding: '32px 14px', textAlign: 'center' }}
        >
          <span className="backdrop-texture" aria-hidden="true" />
          <span className="wordmark" style={{ fontSize: '2rem' }}>
            HERMES
          </span>
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
        <h2>Avatar — formas × estados (desktop)</h2>
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
        <h2>Avatar — sólidos platónicos y sigils</h2>
        <div className="ui-grid">
          {SOLIDS.map(s => (
            <Avatar key={s} name={s} shape={s} />
          ))}
          {SIGILS.map(s => (
            <Avatar key={s} name={`sigil-bot-${s}`} shape={s} />
          ))}
        </div>
      </section>

      <section className="ui-section">
        <h2>Avatar — blobatar (nombre → cara)</h2>
        <div className="ui-grid">
          {BLOB_FACES.map(a => (
            <Avatar key={a.shape} name={a.shape} appearance={a} />
          ))}
          <Avatar name="blob-default" appearance={{ shape: 'blobatar', color: null, image: null }} />
        </div>
      </section>

      <section className="ui-section">
        <h2>Avatar — foto (subida)</h2>
        <div className="ui-grid">
          <Avatar name="foto" appearance={{ shape: 'circle', color: null, image: PHOTO }} />
          <Avatar name="foto" appearance={{ shape: 'circle', color: null, image: PHOTO }} ring badge />
        </div>
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
