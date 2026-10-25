import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { useSlideNavigate } from '../../app/transition'
import { isValidEnvVarName, type EnvVarInfo } from '../../lib/hermes/credentials'
import { vaultLabel } from '../../lib/hermes/vault-labels'
import { vaultBrandName } from './vault-brand'
import { BrandIcon } from '../../ui/BrandIcon'
import { BotScopedScreen } from '../bot-profile/BotScopedScreen'
import { Disclosure } from '../../ui/Disclosure'
import { Row, Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import { StatusDot } from '../../ui/StatusDot'
import { ConfirmSheet } from './ConfirmSheet'
import {
  addPoolEntry,
  envError,
  envLoading,
  envVars,
  loadEnvVars,
  loadPool,
  pool,
  poolError,
  poolLoading,
  removePoolEntry,
  saveVar,
} from './store'
import './vault.css'

const CATEGORY_LABELS: Record<string, string> = {
  provider: 'Proveedores',
  tool: 'Herramientas',
  skill: 'Skills',
  messaging: 'Mensajería',
  setting: 'Configuración',
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)
}

export function VaultPage() {
  const { profile = 'default' } = useParams()
  const { forward } = useSlideNavigate()
  const vars = useStore(envVars)
  const loading = useStore(envLoading)
  const error = useStore(envError)
  const credPool = useStore(pool)
  const poolBusy = useStore(poolLoading)
  const poolFail = useStore(poolError)

  const [busyKey, setBusyKey] = useState('')
  const [removeTarget, setRemoveTarget] = useState<{ provider: string; index: number } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Custom "KEY=value" form
  const [customKey, setCustomKey] = useState('')
  const [customValue, setCustomValue] = useState('')
  const [customError, setCustomError] = useState('')
  const [customBusy, setCustomBusy] = useState(false)

  // Pool add form
  const [poolProvider, setPoolProvider] = useState('')
  const [poolLabel, setPoolLabel] = useState('')
  const [poolKey, setPoolKey] = useState('')
  const [poolAddError, setPoolAddError] = useState('')
  const [poolAddBusy, setPoolAddBusy] = useState(false)

  useEffect(() => {
    void Promise.all([loadEnvVars(profile), loadPool(profile)])
  }, [profile])

  const { groups, advancedVars, customVars } = useMemo(() => {
    const byCat = new Map<string, [string, EnvVarInfo][]>()
    const advanced: [string, EnvVarInfo][] = []
    const custom: [string, EnvVarInfo][] = []
    for (const [key, info] of Object.entries(vars ?? {})) {
      if (info.category === 'custom' || info.custom) {
        custom.push([key, info])
        continue
      }
      if (info.advanced || info.channel_managed) {
        advanced.push([key, info])
        continue
      }
      const bucket = byCat.get(info.category) ?? []
      bucket.push([key, info])
      byCat.set(info.category, bucket)
    }
    for (const rows of byCat.values()) rows.sort(([a], [b]) => a.localeCompare(b))
    advanced.sort(([a], [b]) => a.localeCompare(b))
    custom.sort(([a], [b]) => a.localeCompare(b))
    const sorted = new Map([...byCat.entries()].sort(([a], [b]) => categoryLabel(a).localeCompare(categoryLabel(b))))
    return { groups: sorted, advancedVars: advanced, customVars: custom }
  }, [vars])

  const providers = credPool?.providers ?? []
  const enc = encodeURIComponent(profile)

  async function onRemove() {
    if (!removeTarget) return
    setBusyKey(`${removeTarget.provider}/${removeTarget.index}`)
    try {
      await removePoolEntry(profile, removeTarget.provider, removeTarget.index)
    } finally {
      setBusyKey('')
      setRemoveTarget(null)
      setConfirmOpen(false)
    }
  }

  async function onAddCustom() {
    const key = customKey.trim()
    const value = customValue
    if (!key) {
      setCustomError('Escribí el nombre de la variable.')
      return
    }
    if (!isValidEnvVarName(key)) {
      setCustomError('El nombre solo puede tener letras, números y guiones bajos (ej: MI_SERVICIO_TOKEN).')
      return
    }
    if (!value) {
      setCustomError('Escribí el valor.')
      return
    }
    setCustomError('')
    setCustomBusy(true)
    try {
      await saveVar(profile, key, value)
      setCustomKey('')
      setCustomValue('')
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setCustomBusy(false)
    }
  }

  async function onAddPoolEntry() {
    const provider = poolProvider.trim()
    const apiKey = poolKey
    if (!provider || !apiKey) {
      setPoolAddError('Completá el proveedor y la clave.')
      return
    }
    setPoolAddError('')
    setPoolAddBusy(true)
    try {
      await addPoolEntry(profile, provider, apiKey, poolLabel.trim())
      setPoolProvider('')
      setPoolKey('')
      setPoolLabel('')
    } catch (e) {
      setPoolAddError(e instanceof Error ? e.message : 'No se pudo guardar la clave.')
    } finally {
      setPoolAddBusy(false)
    }
  }

  function renderVarRow(key: string, info: EnvVarInfo) {
    const label = vaultLabel(key, info)
    const brand = vaultBrandName(key, info)
    return (
      <Row
        key={key}
        leading={<BrandIcon name={brand ?? info.provider_label ?? info.provider ?? key} size={28} />}
        title={<span className="vault-title">{label}</span>}
        trailing={
          <StatusDot
            tone={info.is_set ? 'ok' : 'neutral'}
            ariaLabel={info.is_set ? 'Configurada' : 'Sin configurar'}
          />
        }
        onClick={() => forward(`/bots/${enc}/vault/${encodeURIComponent(key)}`)}
      >
        <span className="row-key mono">{key}</span>
      </Row>
    )
  }

  return (
    <BotScopedScreen profile={profile} title="Bóveda">
      <p className="page-subtitle">
        Claves y tokens de este bot. Solo se guardan o reemplazan: Hermes nunca muestra el valor real
        en un teléfono.
      </p>

      {loading ? (
        <div className="list">
          <Skeleton width="60%" />
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      ) : error ? (
        <div className="empty">
          <p className="error-text">{error}</p>
          <button className="btn" onClick={() => void loadEnvVars(profile)}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {groups.size === 0 && advancedVars.length === 0 && customVars.length === 0 ? (
            <div className="empty">
              <p className="muted">No hay credenciales configuradas.</p>
            </div>
          ) : (
            [...groups.entries()].map(([category, rows]) => (
              <Section key={category} label={categoryLabel(category)}>
                {rows.map(([key, info]) => renderVarRow(key, info))}
              </Section>
            ))
          )}

          {advancedVars.length > 0 && (
            <div className="advanced-block">
              <Disclosure title={`Mostrar avanzadas (${advancedVars.length})`}>
                <Section>{advancedVars.map(([key, info]) => renderVarRow(key, info))}</Section>
              </Disclosure>
            </div>
          )}

          {/* Grupo de credenciales (auth.json credential_pool) */}
          <Section label="Grupo de credenciales">
            {poolBusy ? (
              <div className="list">
                <Skeleton height={64} />
              </div>
            ) : poolFail ? (
              <div className="empty">
                <p className="error-text">{poolFail}</p>
                <button className="btn" onClick={() => void loadPool(profile)}>
                  Reintentar
                </button>
              </div>
            ) : providers.length === 0 ? (
              <p className="muted" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                No hay claves agrupadas por proveedor.
              </p>
            ) : (
              providers.map(p => (
                <div key={p.provider} className="vault-pool">
                  <div className="vault-pool-provider">{p.provider}</div>
                  {p.entries.map(entry => (
                    <div key={`${p.provider}-${entry.index}`} className="vault-pool-row">
                      <div className="vault-pool-info">
                        <span>{entry.label}</span>
                        <span className="faint mono">{entry.token_preview}</span>
                        <span className="faint">
                          {entry.has_refresh ? 'Renovación automática' : 'Sin renovación'}
                          {entry.last_status ? ` · ${entry.last_status}` : ''}
                        </span>
                      </div>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={busyKey === `${p.provider}/${entry.index}`}
                        onClick={() => {
                          setRemoveTarget({ provider: p.provider, index: entry.index })
                          setConfirmOpen(true)
                        }}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
          </Section>

          {/* Variables personalizadas */}
          <Section label="Inicios de sesión de servicios">
            {customVars.length === 0 ? (
              <p className="muted" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                Ninguno todavía. Agregá abajo una variable como KEY=valor.
              </p>
            ) : (
              customVars.map(([key, info]) => renderVarRow(key, info))
            )}
          </Section>

          <Section label="Nueva variable">
            <div className="card">
              <input
                className="input"
                placeholder="NOMBRE (ej: MI_SERVICIO_TOKEN)"
                autoCapitalize="characters"
                spellCheck={false}
                value={customKey}
                onChange={e => setCustomKey(e.target.value)}
              />
              <input
                className="input"
                style={{ marginTop: 8 }}
                type="password"
                placeholder="Valor"
                value={customValue}
                onChange={e => setCustomValue(e.target.value)}
              />
              {customError && <p className="error-text">{customError}</p>}
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 10 }}
                disabled={customBusy}
                onClick={() => void onAddCustom()}
              >
                {customBusy ? 'Guardando…' : 'Guardar variable'}
              </button>
            </div>
          </Section>

          <Section label="Clave de proveedor">
            <div className="card">
              <input
                className="input"
                placeholder="Proveedor (ej: openai)"
                value={poolProvider}
                onChange={e => setPoolProvider(e.target.value)}
              />
              <input
                className="input"
                style={{ marginTop: 8 }}
                placeholder="Etiqueta (opcional)"
                value={poolLabel}
                onChange={e => setPoolLabel(e.target.value)}
              />
              <input
                className="input"
                style={{ marginTop: 8 }}
                type="password"
                placeholder="Clave"
                value={poolKey}
                onChange={e => setPoolKey(e.target.value)}
              />
              {poolAddError && <p className="error-text">{poolAddError}</p>}
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 10 }}
                disabled={poolAddBusy}
                onClick={() => void onAddPoolEntry()}
              >
                {poolAddBusy ? 'Guardando…' : 'Guardar clave'}
              </button>
            </div>
          </Section>
        </>
      )}

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Quitar clave"
        body="¿Quitás esta clave del grupo? El bot deja de usarla."
        confirmLabel="Quitar"
        busy={busyKey !== ''}
        onConfirm={() => void onRemove()}
      />
    </BotScopedScreen>
  )
}
