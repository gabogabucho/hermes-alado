import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useSlideNavigate } from '../../app/transition'
import { apiFetch } from '../../lib/api'
import { previewSubtitle } from '../../lib/hermes/bot-to-bot'
import { createProfile } from '../bots/store'
import { useBotAppearance } from '../bots/appearance-store'
import { user } from '../auth/store'
import { profileForSession, requests } from '../chat/requests'
import { Avatar, type AvatarMood, type AvatarSize } from '../../ui/Avatar'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { ListRow } from '../../ui/ListRow'
import { Sheet } from '../../ui/Sheet'
import { Skeleton } from '../../ui/Skeleton'
import {
  activeProfile,
  homeBots,
  homeError,
  homeLoading,
  loadHome,
  type HomeBot,
} from './store'

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function relativeTime(ts: number): string {
  const date = new Date(ts * 1000)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.floor((startToday - startOfDay) / 86400000)
  if (diffDays === 0) return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return WEEKDAYS[date.getDay()]
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

interface SearchHit {
  id?: string
  title?: string
  profile?: string
  preview?: string
  snippet?: string
}

/** Avatar resolved from the appearance store (profile's stored look, photo
 *  included) — the desktop's exact face for this bot. */
function BotAvatar({
  name,
  size = 'md',
  mood = 'idle',
  ring = false,
  badge = false,
}: {
  name: string
  size?: AvatarSize
  mood?: AvatarMood
  ring?: boolean
  badge?: boolean
}) {
  const appearance = useBotAppearance(name)
  return <Avatar name={name} size={size} mood={mood} ring={ring} badge={badge} appearance={appearance} />
}

export function HomePage() {
  const { forward } = useSlideNavigate()
  const bots = useStore(homeBots)
  const loading = useStore(homeLoading)
  const error = useStore(homeError)
  const active = useStore(activeProfile)
  const me = useStore(user)
  const pending = useStore(requests)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<{ q: string; hits: SearchHit[] }>({ q: '', hits: [] })

  useEffect(() => {
    void loadHome()
  }, [])

  const principal = bots.find(b => b.name === active) ?? bots[0]
  const others = bots.filter(b => b.name !== principal?.name)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return others
    return others.filter(b => (b.displayName + ' ' + b.name).toLowerCase().includes(q))
  }, [others, query])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) return
    let live = true
    apiFetch<{ results: SearchHit[] }>(`/api/sessions/search?q=${encodeURIComponent(q)}&limit=20`)
      .then(res => {
        if (live) setSearch({ q, hits: res.results ?? [] })
      })
      .catch(() => {
        if (live) setSearch({ q, hits: [] })
      })
    return () => {
      live = false
    }
  }, [query])

  const searchQ = query.trim()
  const searching = searchQ.length >= 2 && search.q !== searchQ
  const hits = search.q === searchQ ? search.hits : []

  async function onCreate() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      await createProfile(name)
      setNewName('')
      setSheetOpen(false)
      await loadHome()
    } finally {
      setCreating(false)
    }
  }

  function openBot(b: HomeBot) {
    forward(`/chat/${encodeURIComponent(b.name)}`)
  }

  return (
    <div className="home-page">
      <header className="home-topbar glass">
        <IconButton
          icon="settings"
          variant="glass"
          label="Ajustes"
          onClick={() => forward('/settings')}
        />
        <span className="home-user" title={me?.display_name ?? me?.email ?? ''}>
          {(me?.display_name ?? me?.email ?? 'H').charAt(0).toUpperCase()}
        </span>
        <span className="label-mono">DroidBot</span>
        <span className="spacer" />
        <IconButton icon="plus" variant="glass" label="Nuevo" onClick={() => setSheetOpen(true)} />
      </header>

      <div className="home-scroll">
        {pending.length > 0 && (
          <div className="home-banners">
            {pending.map(c => {
              const bot = profileForSession(c.sessionId)
              const label = c.kind === 'approval' ? 'necesita tu aprobación' : 'tiene preguntas'
              return (
                <button
                  key={c.id}
                  className="home-banner"
                  onClick={() => {
                    if (bot) forward(`/chat/${encodeURIComponent(bot)}`)
                  }}
                >
                  {bot ? `${bot} ${label}` : `Un bot ${label}`}
                </button>
              )
            })}
          </div>
        )}

        {loading ? (
          <div className="home-hero">
            <Skeleton variant="circle" width={112} height={112} />
            <Skeleton width={160} />
            <Skeleton width={120} />
          </div>
        ) : error ? (
          <div className="empty">
            <p className="error-text">{error}</p>
            <button className="btn" onClick={() => void loadHome()}>
              Reintentar
            </button>
          </div>
        ) : bots.length === 0 ? (
          <div className="empty">
            <p className="muted">No hay bots. Tocá + para crear el primero.</p>
          </div>
        ) : (
          <>
            {principal && (
              <button className="home-hero" onClick={() => openBot(principal)}>
                <span className="backdrop-texture" aria-hidden="true" />
                <BotAvatar
                  name={principal.name}
                  size="xl"
                  ring
                  badge
                  mood={principal.working ? 'working' : 'idle'}
                />
                <span className="home-hero-name">{principal.displayName}</span>
                <span className="home-hero-sub">
                  {principal.model || principal.description || 'Bot principal'}
                </span>
              </button>
            )}

            <div className="list">
              {filtered.map(b => (
                <ListRow
                  key={b.name}
                  leading={<BotAvatar name={b.name} size="md" mood={b.working ? 'working' : 'idle'} />}
                  title={b.displayName}
                  subtitle={
                    b.canonical?.preview
                      ? previewSubtitle(b.canonical.preview) || 'Sin mensajes todavía'
                      : 'Sin mensajes todavía'
                  }
                  trailing={
                    <span className="list-row-trailing">
                      {b.canonical ? <span className="faint">{relativeTime(b.canonical.lastActive)}</span> : null}
                      {b.unread && <span className="unread-dot" aria-label="No leído" />}
                    </span>
                  }
                  onClick={() => openBot(b)}
                />
              ))}
            </div>

            {query.trim().length >= 2 && (
              <div className="search-section">
                <h2 className="search-heading">En conversaciones</h2>
                {searching ? (
                  <p className="muted">Buscando…</p>
                ) : hits.length === 0 ? (
                  <p className="muted">Sin resultados.</p>
                ) : (
                  <div className="list">
                    {hits.map(hit => (
                      <ListRow
                        key={hit.id ?? hit.title ?? hit.snippet}
                        title={hit.title ?? 'Conversación'}
                        subtitle={hit.snippet ?? hit.preview ?? ''}
                        trailing={<Icon name="chevron-right" />}
                        onClick={() =>
                          hit.profile ? forward(`/chat/${encodeURIComponent(hit.profile)}`) : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="home-search glass">
        <Icon name="search" size={20} />
        <input
          className="home-search-input"
          placeholder="Buscar bots…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Nuevo">
        <label className="label-mono">Nuevo bot</label>
        <input
          className="input"
          style={{ marginTop: 6 }}
          placeholder="Nombre del bot"
          value={newName}
          onChange={e => setNewName(e.target.value)}
        />
        <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} disabled={creating} onClick={() => void onCreate()}>
          {creating ? 'Creando…' : 'Crear'}
        </button>
        <div className="sheet-divider" />
        <button className="btn btn-block" disabled>
          Nuevo grupo · Próximamente
        </button>
      </Sheet>
    </div>
  )
}
