import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useBack, useSlideNavigate } from '../../app/transition'
import {
  CONNECTOR_FAMILIES,
  FAMILY_LABELS,
  HUB_ID_PREFIX,
  TOOLSET_ESSENTIALS,
  type Connector,
  type ConnectorFamily,
  type FamilyData,
} from '../../lib/hermes/connectors'
import { activeProfile, loadActiveProfile } from '../home/store'
import { Badge } from '../../ui/StatusDot'
import { BrandIcon } from '../../ui/BrandIcon'
import { Icon } from '../../ui/Icon'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import { catalogLoading, connectors, familyData, familyErrors, loadCatalogData, loadFamilyData } from './store'
import './connectors.css'

type ChipSelection = { kind: 'all' } | { kind: 'family'; family: ConnectorFamily } | { kind: 'category'; category: string }

/** Best-effort brand URL for a connector, from the family data the desktop
 *  would derive a hostname from (MCP entry url/install_url, messaging docs_url). */
function connectorUrl(c: Connector, data: FamilyData): string | null {
  if (c.family === 'apps') {
    const entry = data.apps?.catalog.find(e => e.name === c.name)
    return entry?.url ?? entry?.install_url ?? null
  }
  if (c.family === 'messaging') {
    const platform = data.messaging?.payload.platforms.find(p => p.name === c.name)
    return platform?.docs_url ?? null
  }
  return null
}

export function CatalogPage() {
  const back = useBack('/settings')
  const { forward } = useSlideNavigate()
  const list = useStore(connectors)
  const loading = useStore(catalogLoading)
  const data = useStore(familyData)
  const errors = useStore(familyErrors)
  const profile = useStore(activeProfile)
  const [query, setQuery] = useState('')
  const [chip, setChip] = useState<ChipSelection>({ kind: 'all' })

  useEffect(() => {
    void loadActiveProfile()
  }, [])

  useEffect(() => {
    void loadCatalogData(profile)
  }, [profile])

  const categories = useMemo(() => {
    const seen = new Set<string>()
    for (const c of list) if (c.category) seen.add(c.category)
    return [...seen].sort((a, b) => a.localeCompare(b))
  }, [list])

  const featuredIds = useMemo(() => {
    const ids = new Set<string>()
    for (const meta of data.skills?.featured ?? []) ids.add(HUB_ID_PREFIX + meta.identifier)
    for (const t of data.tools?.toolsets ?? []) if (TOOLSET_ESSENTIALS.includes(t.name)) ids.add(t.name)
    return ids
  }, [data])

  const q = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    return list.filter(c => {
      if (chip.kind === 'family' && c.family !== chip.family) return false
      if (chip.kind === 'category' && c.category !== chip.category) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.category ?? '').toLowerCase().includes(q)
      )
    })
  }, [list, chip, q])

  const connected = filtered.filter(c => c.status === 'connected')
  const featured = filtered.filter(c => c.status !== 'connected' && featuredIds.has(c.id))
  const available = filtered.filter(c => c.status !== 'connected' && !featuredIds.has(c.id))

  // "activos" = connected items of the current filter; skills are merely
  // enabled, so they don't inflate the Apps count.
  const activeCount = filtered.filter(c => c.status === 'connected' && c.family !== 'skills').length

  const renderRow = (c: Connector) => (
    <Row
      key={c.id}
      leading={<BrandIcon name={c.name} url={connectorUrl(c, data)} size={28} />}
      title={c.name}
      subtitle={c.description || c.category || FAMILY_LABELS[c.family]}
      trailing={
        c.status === 'connected' ? (
          <span className="connect-state">
            <Icon name="check" size={14} />
            Conectado
          </span>
        ) : (
          <span className="connect-btn">Conectar</span>
        )
      }
      onClick={() => forward(`/connectors/${c.family}/${encodeURIComponent(c.id)}`)}
    />
  )

  const section = (title: string, items: Connector[]) =>
    items.length > 0 && (
      <Section label={title}>
        {items.map(renderRow)}
      </Section>
    )

  const familyErrorRows = CONNECTOR_FAMILIES.filter(
    f => errors[f] && list.filter(c => c.family === f).length === 0,
  )

  return (
    <PageShell
      title="Conectar aplicaciones"
      onBack={back}
      actions={<Badge>{activeCount} activos</Badge>}
    >
      <input
        className="input catalog-search"
        type="search"
        placeholder="Buscar aplicaciones y habilidades"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      <div className="chips-scroll">
        <button
          type="button"
          className={`chip${chip.kind === 'all' ? ' chip-active' : ''}`}
          onClick={() => setChip({ kind: 'all' })}
        >
          Todos
        </button>
        {CONNECTOR_FAMILIES.map(f => (
          <button
            key={f}
            type="button"
            className={`chip${chip.kind === 'family' && chip.family === f ? ' chip-active' : ''}`}
            onClick={() => setChip({ kind: 'family', family: f })}
          >
            {FAMILY_LABELS[f]}
          </button>
        ))}
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            className={`chip${chip.kind === 'category' && chip.category === cat ? ' chip-active' : ''}`}
            onClick={() => setChip({ kind: 'category', category: cat })}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading && list.length === 0 && (
        <div className="list" style={{ marginTop: 12 }}>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="list-row">
              <Skeleton variant="circle" width={40} height={40} />
              <span className="list-row-body">
                <Skeleton width={160} />
                <Skeleton width="80%" height={10} />
              </span>
            </div>
          ))}
        </div>
      )}

      {!loading && familyErrorRows.length > 0 && (
        <div className="list" style={{ marginTop: 12 }}>
          {familyErrorRows.map(f => (
            <div key={f} className="list-row">
              <span className="list-row-body">
                <span className="list-row-title">{FAMILY_LABELS[f]}</span>
                <span className="list-row-subtitle error-text" style={{ margin: 0 }}>
                  {errors[f]}
                </span>
              </span>
              <span className="list-row-trailing">
                <button type="button" className="btn" onClick={() => void loadFamilyData(f, profile)}>
                  Reintentar
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {q
        ? section('Resultados', filtered)
        : !loading && (
            <>
              {section('Conectados', connected)}
              {section('Recomendados', featured)}
              {section('Disponibles', available)}
              {filtered.length === 0 && familyErrorRows.length === 0 && (
                <p className="empty">No hay conectores en este perfil.</p>
              )}
            </>
          )}
    </PageShell>
  )
}
