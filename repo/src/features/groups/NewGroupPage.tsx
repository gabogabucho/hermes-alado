import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useSlideNavigate } from '../../app/transition'
import { groupEngine } from '../../lib/hermes/groups'
import { Avatar } from '../../ui/Avatar'
import { IconButton } from '../../ui/IconButton'
import { Skeleton } from '../../ui/Skeleton'
import { ensureAppearances, useBotAppearance } from '../bots/appearance-store'
import { homeLoading, homeProfiles } from '../home/store'
import { ensureGroupsCapability, groupsAvailable } from './store'

const MIN_MEMBERS = 2
const MAX_MEMBERS = 6
const RESERVED_HANDLES = new Set(['all', 'everyone'])

function PickAvatar({ name }: { name: string }) {
  const appearance = useBotAppearance(name)
  return <Avatar name={name} size="md" appearance={appearance} />
}

export function NewGroupPage() {
  const { back, forward } = useSlideNavigate()
  const profiles = useStore(homeProfiles)
  const loading = useStore(homeLoading)
  const available = useStore(groupsAvailable)
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [seatable, setSeatable] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    ensureAppearances()
    void ensureGroupsCapability()
    void groupEngine
      .capabilities()
      .then(caps => {
        // Absent on gateways that predate it (and on the /api/ws surface the
        // VPS serves): no seatable filter, every local profile may be seated.
        if (caps.seatable_profiles?.length) setSeatable(new Set(caps.seatable_profiles))
      })
      .catch(() => undefined)
  }, [])

  const candidates = profiles.filter(p => !seatable || seatable.has(p.name))

  function toggle(name: string): void {
    setError('')
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else if (next.size < MAX_MEMBERS) {
        next.add(name)
      }
      return next
    })
  }

  async function create(): Promise<void> {
    const trimmed = name.trim()
    const members = candidates.filter(p => selected.has(p.name))
    if (!trimmed || members.length < MIN_MEMBERS || members.length > MAX_MEMBERS || busy) return
    for (const profile of members) {
      if (RESERVED_HANDLES.has(profile.name.toLowerCase())) {
        setError(`El perfil "${profile.name}" tiene un handle reservado y no puede entrar al grupo`)
        return
      }
    }
    setBusy(true)
    setError('')
    try {
      const { room } = await groupEngine.create(
        trimmed,
        members.map(p => ({ profile: p.name, ...(p.display_name ? { displayName: p.display_name } : {}) })),
      )
      forward(`/group/${encodeURIComponent(room.room_id)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el grupo')
    } finally {
      setBusy(false)
    }
  }

  const selectedCount = selected.size
  const valid = name.trim().length > 0 && selectedCount >= MIN_MEMBERS

  return (
    <div className="new-group-page">
      <header className="new-group-header">
        <IconButton icon="back" variant="ghost" label="Volver" onClick={back} />
        <span className="new-group-title">Nuevo grupo</span>
      </header>

      <div className="new-group-scroll">
        {available === false ? (
          <div className="empty">
            <p className="muted">Grupos no disponibles en este Hermes.</p>
          </div>
        ) : (
          <>
            <input
              className="input"
              placeholder="Nombre del grupo"
              value={name}
              onChange={e => setName(e.target.value)}
            />

            <div className="new-group-counter">
              <span className="muted">
                Elegí entre {MIN_MEMBERS} y {MAX_MEMBERS} bots
              </span>
              <span className={`chip${valid ? ' ok' : ''}`}>{selectedCount}/{MAX_MEMBERS}</span>
            </div>

            {loading ? (
              <div className="new-group-picker">
                <Skeleton variant="circle" width={44} height={44} />
                <Skeleton variant="circle" width={44} height={44} />
                <Skeleton variant="circle" width={44} height={44} />
              </div>
            ) : (
              <div className="new-group-picker">
                {candidates.map(profile => (
                  <button
                    key={profile.name}
                    type="button"
                    className={`new-group-member${selected.has(profile.name) ? ' new-group-member--selected' : ''}`}
                    onClick={() => toggle(profile.name)}
                  >
                    <PickAvatar name={profile.name} />
                    <span className="new-group-member-name">{profile.display_name || profile.name}</span>
                    <span className={`new-group-member-check${selected.has(profile.name) ? ' new-group-member-check--on' : ''}`} aria-hidden="true">
                      ✓
                    </span>
                  </button>
                ))}
              </div>
            )}

            {error && <p className="error-text">{error}</p>}

            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              disabled={!valid || busy || loading}
              onClick={() => void create()}
            >
              {busy ? 'Creando…' : 'Crear grupo'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
