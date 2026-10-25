import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useSlideNavigate } from '../../app/transition'
import { isValidEnvVarName, type EnvVarInfo } from '../../lib/hermes/credentials'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { ListRow } from '../../ui/ListRow'
import { Skeleton } from '../../ui/Skeleton'
import { ConfirmSheet } from './ConfirmSheet'
import {
  addPoolEntry,
  envError,
  envLoading,
  envVars,
  loadEnvVars,
  loadPool,
  loadVault,
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

/** Group env rows by category (custom goes to its own section). */
function groupByCategory(vars: Record<string, EnvVarInfo>): Map<string, [string, EnvVarInfo][]> {
  const groups = new Map<string, [string, EnvVarInfo][]>()
  for (const [key, info] of Object.entries(vars)) {
    if (info.category === 'custom') continue
    const bucket = groups.get(info.category) ?? []
    bucket.push([key, info])
    groups.set(info.category, bucket)
  }
  for (const rows of groups.values()) rows.sort(([a], [b]) => a.localeCompare(b))
  return new Map([...groups.entries()].sort(([a], [b]) => categoryLabel(a).localeCompare(categoryLabel(b))))
}

export function VaultPage() {
  const { back, forward } = useSlideNavigate()
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
    void loadVault()
  }, [])

  const groups = vars ? groupByCategory(vars) : new Map<string, [string, EnvVarInfo][]>()
  const customVars = vars ? Object.entries(vars).filter(([, i]) => i.category === 'custom') : []
  const providers = credPool?.providers ?? []

  async function onRemove() {
    if (!removeTarget) return
    setBusyKey(`${removeTarget.provider}/${removeTarget.index}`)
    try {
      await removePoolEntry(removeTarget.provider, removeTarget.index)
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
      await saveVar(key, value)
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
      await addPoolEntry(provider, apiKey, poolLabel.trim())
      setPoolProvider('')
      setPoolKey('')
      setPoolLabel('')
    } catch (e) {
      setPoolAddError(e instanceof Error ? e.message : 'No se pudo guardar la clave.')
    } finally {
      setPoolAddBusy(false)
    }
  }

  return (
    <div className="settings-page">
      <header className="page-header glass">
        <IconButton icon="back" variant="ghost" label="Volver" onClick={back} />
        <h1 className="page-header-title">Bóveda</h1>
      </header>
      <p className="page-subtitle">
        Claves y tokens del bot. Solo se guardan o reemplazan: Hermes nunca muestra el valor real
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
          <button className="btn" onClick={() => void loadEnvVars()}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {groups.size === 0 && customVars.length === 0 ? (
            <div className="empty">
              <p className="muted">No hay credenciales configuradas.</p>
            </div>
          ) : (
            [...groups.entries()].map(([category, rows]) => (
              <section key={category} className="vault-section">
                <h2 className="vault-section-title">{categoryLabel(category)}</h2>
                <div className="list">
                  {rows.map(([key, info]) => (
                    <ListRow
                      key={key}
                      title={key}
                      subtitle={info.description || undefined}
                      trailing={
                        <span className="vault-row-trailing">
                          <span className="faint mono">{info.redacted_value ?? '—'}</span>
                          <span className={`chip${info.is_set ? ' ok' : ''}`}>
                            {info.is_set ? 'Guardada' : 'Sin valor'}
                          </span>
                        </span>
                      }
                      onClick={() => forward(`/settings/vault/${encodeURIComponent(key)}`)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}

          {/* Grupo de credenciales (auth.json credential_pool) */}
          <section className="vault-section">
            <h2 className="vault-section-title">Grupo de credenciales</h2>
            {poolBusy ? (
              <div className="list">
                <Skeleton height={64} />
              </div>
            ) : poolFail ? (
              <div className="empty">
                <p className="error-text">{poolFail}</p>
                <button className="btn" onClick={() => void loadPool()}>
                  Reintentar
                </button>
              </div>
            ) : providers.length === 0 ? (
              <p className="muted">No hay claves agrupadas por proveedor.</p>
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

            <div className="card" style={{ marginTop: 10 }}>
              <label className="faint">Agregar clave al grupo</label>
              <input
                className="input"
                style={{ marginTop: 6 }}
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
          </section>

          {/* Variables personalizadas */}
          <section className="vault-section">
            <h2 className="vault-section-title">Inicios de sesión de servicios</h2>
            {customVars.length === 0 ? (
              <p className="muted">Ninguno todavía. Agregá abajo una variable como KEY=valor.</p>
            ) : (
              <div className="list">
                {customVars
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, info]) => (
                    <ListRow
                      key={key}
                      title={key}
                      subtitle="Variable personalizada"
                      trailing={
                        <span className="vault-row-trailing">
                          <span className="faint mono">{info.redacted_value ?? '—'}</span>
                          <Icon name="chevron-right" />
                        </span>
                      }
                      onClick={() => forward(`/settings/vault/${encodeURIComponent(key)}`)}
                    />
                  ))}
              </div>
            )}

            <div className="card" style={{ marginTop: 10 }}>
              <label className="faint">Nueva variable</label>
              <input
                className="input"
                style={{ marginTop: 6 }}
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
          </section>
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
    </div>
  )
}
