import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { APP_NAME } from '../../app/brand'
import { useSlideNavigate } from '../../app/transition'
import { apiFetch } from '../../lib/api'
import { previewSubtitle } from '../../lib/hermes/bot-to-bot'
import { groupEngine } from '../../lib/hermes/groups'
import { createProfile } from '../bots/store'
import { useBotAppearance } from '../bots/appearance-store'
import { user } from '../auth/store'
import { prefetchCanonical } from '../chat/store'
import { profileForSession, requests } from '../chat/requests'
import { refreshGroupRows, useGroupRows, type GroupRow } from '../groups/store'
import { Avatar, type AvatarMood, type AvatarSize } from '../../ui/Avatar'
import { DangerConfirmSheet } from '../../ui/DangerConfirmSheet'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { Row, Section } from '../../ui/Section'
import { Sheet } from '../../ui/Sheet'
import { Skeleton } from '../../ui/Skeleton'
import {
  activeProfile,
  featuredBot,
  featuredBotName,
  homeBots,
  homeError,
  homeLoading,
  loadHome,
  setFeaturedBot,
  type HomeBot,
} from './store'
import { busyProfiles, watchBusy } from './busy-store'

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
  busy = false,
}: {
  name: string
  size?: AvatarSize
  mood?: AvatarMood
  busy?: boolean
}) {
  const appearance = useBotAppearance(name)
  return <Avatar name={name} size={size} mood={mood} appearance={appearance} busy={busy} />
}

/** The tiny "trabajando…" caption shown under a busy bot's name. */
function BusyCaption() {
  return <span className="home-busy-caption">trabajando…</span>
}

function GroupFace({ name }: { name: string }) {
  const appearance = useBotAppearance(name)
  return <Avatar name={name} size="xs" appearance={appearance} />
}

/** The members' stored faces stacked, "+N" overflow — the group row leading. */
function GroupAvatarStack({ names }: { names: string[] }) {
  const shown = names.slice(0, 3)
  const extra = names.length - shown.length
  return (
    <span className="avatar-stack">
      {shown.map(name => (
        <GroupFace key={name} name={name} />
      ))}
      {extra > 0 && (
        <span className="avatar-stack-more" style={{ width: 24, height: 24 }}>
          +{extra}
        </span>
      )}
    </span>
  )
}

type HomeEntry = { kind: 'bot'; bot: HomeBot } | { kind: 'group'; group: GroupRow }

function entryActivity(entry: HomeEntry): number {
  return entry.kind === 'bot' ? (entry.bot.canonical?.lastActive ?? 0) : entry.group.lastActivity
}

export function HomePage() {
  const { forward } = useSlideNavigate()
  const bots = useStore(homeBots)
  const loading = useStore(homeLoading)
  const error = useStore(homeError)
  const active = useStore(activeProfile)
  const me = useStore(user)
  const pending = useStore(requests)
  const busy = useStore(busyProfiles)
  const { rows: groupList, available: groupsAvail } = useGroupRows()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<{ q: string; hits: SearchHit[] }>({ q: '', hits: [] })
  const [menuBot, setMenuBot] = useState<HomeBot | null>(null)
  const [menuGroup, setMenuGroup] = useState<GroupRow | null>(null)
  const [groupDeleteOpen, setGroupDeleteOpen] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState(false)
  const [groupDeleteError, setGroupDeleteError] = useState('')

  useEffect(() => {
    void loadHome()
    return watchBusy()
  }, [])

  const featuredName = useStore(featuredBot)
  const featured = useMemo(() => {
    const name = featuredName
    return (name && bots.find(b => b.name === name)) || bots.find(b => b.name === active) || bots[0]
  }, [bots, active, featuredName])

  const featuredBusy = Boolean(featured && busy.has(featured.name))

  // The canonical chat id lookup is serial in openChat (session.list →
  // resume). Prefetch the featured bot's id while Home is idle so the tap
  // jumps straight to `session.resume`.
  const featuredBotToPrefetch = featured?.name
  useEffect(() => {
    if (featuredBotToPrefetch) void prefetchCanonical(featuredBotToPrefetch)
  }, [featuredBotToPrefetch])

  const others = bots.filter(b => b.name !== featured?.name)

  // One list: bots + groups, sorted together by last activity (bots that never
  // chatted sink to the bottom). Groups vanish entirely when the driver is off.
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matchedBots = others.filter(
      b => !q || (b.displayName + ' ' + b.name).toLowerCase().includes(q),
    )
    const matchedGroups =
      groupsAvail === false
        ? []
        : groupList.filter(g => !q || g.name.toLowerCase().includes(q))
    const merged: HomeEntry[] = [
      ...matchedBots.map(bot => ({ kind: 'bot', bot }) as const),
      ...matchedGroups.map(group => ({ kind: 'group', group }) as const),
    ]
    merged.sort((a, b) => entryActivity(b) - entryActivity(a))
    return merged
  }, [others, groupList, groupsAvail, query])

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

  function onMenu(e: { stopPropagation: () => void; preventDefault: () => void }, b: HomeBot) {
    e.stopPropagation()
    e.preventDefault()
    setMenuBot(b)
  }

  function openProfileFromMenu() {
    if (menuBot) forward(`/bots/${encodeURIComponent(menuBot.name)}`)
    setMenuBot(null)
  }

  function highlightAsPrincipal() {
    if (menuBot) setFeaturedBot(menuBot.name)
    setMenuBot(null)
  }

  function clearFeatured() {
    setFeaturedBot(null)
    setMenuBot(null)
  }

  const doDeleteGroup = async () => {
    if (!menuGroup) return
    setDeletingGroup(true)
    setGroupDeleteError('')
    try {
      await groupEngine.disband(menuGroup.roomId)
      setGroupDeleteOpen(false)
      setMenuGroup(null)
      await refreshGroupRows()
    } catch (e) {
      setGroupDeleteError(e instanceof Error ? e.message : 'No se pudo eliminar el grupo')
    } finally {
      setDeletingGroup(false)
    }
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
        <span className="home-wordmark">{APP_NAME}</span>
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
        ) : error && bots.length === 0 ? (
          <div className="empty">
            <p className="error-text">{error}</p>
            <button className="btn" onClick={() => void loadHome()}>
              Reintentar
            </button>
          </div>
        ) : bots.length === 0 && groupList.length === 0 ? (
          <div className="empty">
            <p className="muted">No hay bots. Tocá + para crear el primero.</p>
          </div>
        ) : (
          <>
            {bots.length === 1 && bots[0].isDefault && (
              <button className="home-import-cta" onClick={() => forward('/import')}>
                <span className="home-import-cta-icon">
                  <Icon name="arrow-down" size={18} />
                </span>
                <span className="home-import-cta-body">
                  <span className="home-import-cta-title">¿Venís de otra app? Traé tus bots</span>
                  <span className="home-import-cta-sub">Importá bots, grupos y rutinas</span>
                </span>
                <Icon name="chevron-right" size={18} />
              </button>
            )}

            {featured && (
              <button className="home-hero" onClick={() => openBot(featured)}>
                <span className="backdrop-texture" aria-hidden="true" />
                <BotAvatar
                  name={featured.name}
                  size="xl"
                  mood={featured.working || featuredBusy ? 'working' : 'idle'}
                  busy={featuredBusy}
                />
                <span className="home-hero-name">{featured.displayName}</span>
                <span className="home-hero-badge">Principal</span>
                {featuredBusy && <BusyCaption />}
                <span className="home-hero-sub">
                  {featured.model || featured.description || 'Bot principal'}
                </span>
              </button>
            )}

            <Section>
              {entries.map(entry =>
                entry.kind === 'group' ? (
                  <Row
                    key={`group:${entry.group.roomId}`}
                    leading={<GroupAvatarStack names={entry.group.members} />}
                    title={entry.group.name}
                    subtitle={
                      entry.group.author
                        ? `${entry.group.author}: ${entry.group.preview}`
                        : entry.group.preview || 'Sin mensajes todavía'
                    }
                    trailing={
                      <span className="list-row-trailing">
                        <span className="faint">{relativeTime(entry.group.lastActivity)}</span>
                        {entry.group.needsYou && <span className="needs-badge">Te necesitan</span>}
                        <span
                          className="row-more"
                          role="button"
                          tabIndex={0}
                          aria-label={`Opciones de ${entry.group.name}`}
                          onClick={e => {
                            e.stopPropagation()
                            e.preventDefault()
                            setMenuGroup(entry.group)
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              setMenuGroup(entry.group)
                            }
                          }}
                        >
                          <Icon name="more" size={18} />
                        </span>
                      </span>
                    }
                    onClick={() => forward(`/group/${encodeURIComponent(entry.group.roomId)}`)}
                  />
                ) : (
                  <Row
                    key={entry.bot.name}
                    leading={
                      <BotAvatar
                        name={entry.bot.name}
                        size="md"
                        mood={entry.bot.working || busy.has(entry.bot.name) ? 'working' : 'idle'}
                        busy={busy.has(entry.bot.name)}
                      />
                    }
                    title={entry.bot.displayName}
                    subtitle={
                      entry.bot.canonical?.preview
                        ? previewSubtitle(entry.bot.canonical.preview) || 'Sin mensajes todavía'
                        : 'Sin mensajes todavía'
                    }
                    trailing={
                      <span className="list-row-trailing">
                        {entry.bot.canonical ? (
                          <span className="faint">{relativeTime(entry.bot.canonical.lastActive)}</span>
                        ) : null}
                        {entry.bot.unread && <span className="unread-dot" aria-label="No leído" />}
                        <span
                          className="row-more"
                          role="button"
                          tabIndex={0}
                          aria-label={`Opciones de ${entry.bot.displayName}`}
                          onClick={e => onMenu(e, entry.bot)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              setMenuBot(entry.bot)
                            }
                          }}
                        >
                          <Icon name="more" size={18} />
                        </span>
                      </span>
                    }
                    onClick={() => openBot(entry.bot)}
                  >
                    {busy.has(entry.bot.name) && <BusyCaption />}
                  </Row>
                ),
              )}
            </Section>

            {query.trim().length >= 2 && (
              <Section label="En conversaciones">
                {searching ? (
                  <p className="muted" style={{ padding: 'var(--space-3)' }}>
                    Buscando…
                  </p>
                ) : hits.length === 0 ? (
                  <p className="muted" style={{ padding: 'var(--space-3)' }}>
                    Sin resultados.
                  </p>
                ) : (
                  hits.map(hit => (
                    <Row
                      key={hit.id ?? hit.title ?? hit.snippet}
                      title={hit.title ?? 'Conversación'}
                      subtitle={hit.snippet ?? hit.preview ?? ''}
                      chevron
                      onClick={() =>
                        hit.profile ? forward(`/chat/${encodeURIComponent(hit.profile)}`) : undefined
                      }
                    />
                  ))
                )}
              </Section>
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
        <button
          className="btn btn-block"
          disabled={groupsAvail === false}
          onClick={() => {
            setSheetOpen(false)
            forward('/groups/new')
          }}
        >
          {groupsAvail === false ? 'Nuevo grupo · No disponible' : 'Nuevo grupo'}
        </button>
        {groupsAvail === false && (
          <p className="faint" style={{ marginTop: 10 }}>
            El motor de grupos no está disponible en este Hermes.
          </p>
        )}
        <div className="sheet-divider" />
        <button
          className="btn btn-block"
          onClick={() => {
            setSheetOpen(false)
            forward('/import')
          }}
        >
          Importar bots
        </button>
      </Sheet>

      <Sheet open={menuBot !== null} onClose={() => setMenuBot(null)} title={menuBot?.displayName ?? ''}>
        <div className="list">
          <button className="btn btn-block" onClick={openProfileFromMenu}>
            Ver perfil
          </button>
          <button className="btn btn-block" onClick={highlightAsPrincipal}>
            Destacar como principal
          </button>
          {menuBot && menuBot.name === featuredBotName() && (
            <button className="btn btn-block" onClick={clearFeatured}>
              Quitar como principal
            </button>
          )}
        </div>
      </Sheet>

      <Sheet open={menuGroup !== null} onClose={() => setMenuGroup(null)} title={menuGroup?.name ?? ''}>
        <div className="list">
          <button
            className="btn btn-block"
            onClick={() => {
              if (menuGroup) forward(`/group/${encodeURIComponent(menuGroup.roomId)}`)
              setMenuGroup(null)
            }}
          >
            Abrir grupo
          </button>
          <button
            className="btn btn-block btn-danger"
            onClick={() => {
              setGroupDeleteOpen(true)
            }}
          >
            Eliminar grupo
          </button>
        </div>
      </Sheet>

      {groupDeleteOpen && (
        <DangerConfirmSheet
          onClose={() => setGroupDeleteOpen(false)}
          title="Eliminar grupo"
          nameToType={menuGroup?.name ?? ''}
          body={
            <>
              Se elimina <b>{menuGroup?.name}</b> y toda su conversación. Los bots que lo forman
              siguen existiendo. No se puede deshacer.
            </>
          }
          confirmLabel="Eliminar grupo"
          busy={deletingGroup}
          error={groupDeleteError}
          onConfirm={() => void doDeleteGroup()}
        />
      )}
    </div>
  )
}
