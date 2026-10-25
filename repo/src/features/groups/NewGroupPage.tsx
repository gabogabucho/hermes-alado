import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useBack, useSlideNavigate } from '../../app/transition'
import { groupEngine } from '../../lib/hermes/groups'
import { Avatar } from '../../ui/Avatar'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/Icon'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import { ensureAppearances, useBotAppearance } from '../bots/appearance-store'
import { homeLoading, homeProfiles } from '../home/store'
import { ensureGroupsCapability, groupsAvailable } from './store'
import { botDisplayName } from '../home/store'

const MIN_MEMBERS = 2
const MAX_MEMBERS = 6
const RESERVED_HANDLES = new Set(['all', 'everyone'])

function PickAvatar({ name }: { name: string }) {
  const appearance = useBotAppearance(name)
  return <Avatar name={name} size="md" appearance={appearance} />
}

export function NewGroupPage() {
  const back = useBack('/')
  const { forward } = useSlideNavigate()
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
        members.map(p => ({ profile: p.name, displayName: botDisplayName(p) })),
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
    <PageShell title="Nuevo grupo" onBack={back}>
      {available === false ? (
        <EmptyState
          icon={<Icon name="grid" size={30} />}
          title="Grupos no disponibles"
          text="El motor de grupos no está activo en este Hermes."
        />
      ) : (
        <>
          <Section label="Nombre">
            <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
              <input
                className="input"
                placeholder="Nombre del grupo"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          </Section>

          <Section
            label={`Miembros · ${selectedCount}/${MAX_MEMBERS}`}
            footer={`Elegí entre ${MIN_MEMBERS} y ${MAX_MEMBERS} bots.`}
          >
            {loading ? (
              <div style={{ padding: 'var(--space-4)' }}>
                <Skeleton height={52} />
                <Skeleton height={52} />
                <Skeleton height={52} />
              </div>
            ) : candidates.length === 0 ? (
              <div style={{ padding: 'var(--space-4)' }}>
                <p className="muted">No hay bots para agregar.</p>
              </div>
            ) : (
              candidates.map(profile => {
                const on = selected.has(profile.name)
                return (
                  <Row
                    key={profile.name}
                    leading={<PickAvatar name={profile.name} />}
                    title={botDisplayName(profile)}
                    subtitle={on ? 'En el grupo' : 'Tocá para agregar'}
                    trailing={
                      <span
                        className={`new-group-member-check${on ? ' new-group-member-check--on' : ''}`}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    }
                    onClick={() => toggle(profile.name)}
                  />
                )
              })
            )}
          </Section>

          {error && <p className="error-text">{error}</p>}

          <button
            className="btn btn-primary btn-block"
            disabled={!valid || busy || loading}
            onClick={() => void create()}
          >
            {busy ? 'Creando…' : 'Crear grupo'}
          </button>
        </>
      )}
    </PageShell>
  )
}
