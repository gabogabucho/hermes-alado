import { useEffect, useState } from 'react'
import {
  getToolsetConfig,
  getToolsetModels,
  postToolsetSetup,
  setToolsetEnabled,
  setToolsetEnv,
  setToolsetModel,
  setToolsetProvider,
  toolsetConfigFields,
  type ToolsetConfig,
  type ToolsetModels,
  type ToolsetProvider,
} from '../../../lib/hermes/connectors'
import { Skeleton } from '../../../ui/Skeleton'
import { Toggle } from '../../../ui/Toggle'
import { ConfigForm } from './ConfigForm'

const activeProviderOf = (config: ToolsetConfig): ToolsetProvider | undefined =>
  config.providers.find(p => p.is_active) ??
  (config.active_provider ? config.providers.find(p => p.name === config.active_provider) : undefined) ??
  config.providers[0]

export function ToolsetSection({
  name,
  profile,
  enabled,
  onChanged,
}: {
  name: string
  profile?: string
  enabled: boolean
  onChanged: () => Promise<void> | void
}) {
  const [config, setConfig] = useState<ToolsetConfig | null>(null)
  const [models, setModels] = useState<ToolsetModels | null>(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [providerKey, setProviderKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const c = await getToolsetConfig(name, profile)
        if (cancelled) return
        setConfig(c)
        const p = activeProviderOf(c)
        if (p) {
          const m = await getToolsetModels(name, p.name, profile).catch(() => null)
          if (!cancelled && m?.has_models) setModels(m)
        }
      } catch {
        if (!cancelled) setError('No se pudo cargar la configuración.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [name, profile, providerKey])

  const provider = config ? activeProviderOf(config) : undefined

  const toggle = async (next: boolean) => {
    setBusy('toggle')
    setError('')
    setNote('')
    try {
      const res = await setToolsetEnabled(name, next, profile)
      if (res.post_setup_started) setNote('La activación inició la instalación guiada en el servidor.')
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setBusy('')
    }
  }

  const pickProvider = async (providerName: string) => {
    setBusy('provider')
    setError('')
    try {
      await setToolsetProvider(name, providerName, profile)
      setProviderKey(k => k + 1)
      setNote('Proveedor cambiado.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el proveedor.')
    } finally {
      setBusy('')
    }
  }

  const pickModel = async (model: string) => {
    setBusy('model')
    setError('')
    try {
      await setToolsetModel(name, model, profile)
      setNote('Modelo cambiado.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el modelo.')
    } finally {
      setBusy('')
    }
  }

  const runPostSetup = async () => {
    if (!provider?.post_setup) return
    setBusy('postsetup')
    setError('')
    try {
      await postToolsetSetup(name, provider.post_setup, profile)
      setNote('Configuración guiada iniciada en el servidor.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la configuración.')
    } finally {
      setBusy('')
    }
  }

  if (!config) {
    return (
      <div className="list">
        <Skeleton />
        <Skeleton width={180} />
      </div>
    )
  }

  return (
    <>
      <div className="ui-section">
        <h2>Estado</h2>
        <div className="list-row">
          <span className="list-row-body">
            <span className="list-row-title">Habilitado</span>
            <span className="list-row-subtitle">{config.name}</span>
          </span>
          <span className="list-row-trailing">
            <Toggle checked={enabled} onChange={v => void toggle(v)} label="Habilitado" />
          </span>
        </div>
      </div>

      {config.providers.length > 0 && (
        <div className="ui-section">
          <h2>Proveedor</h2>
          <select
            className="input"
            value={provider?.name ?? ''}
            disabled={busy === 'provider'}
            onChange={e => void pickProvider(e.target.value)}
          >
            {config.providers.map(p => (
              <option key={p.name} value={p.name}>
                {p.badge || p.name}
              </option>
            ))}
          </select>
          {provider?.requires_nous_auth && <p className="faint">Requiere autenticación de Nous.</p>}
          {provider?.post_setup && (
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 10 }}
              disabled={busy === 'postsetup'}
              onClick={() => void runPostSetup()}
            >
              {busy === 'postsetup' ? '…' : 'Configuración guiada'}
            </button>
          )}
        </div>
      )}

      {provider && provider.env_vars.length > 0 && (
        <div className="ui-section">
          <h2>Claves</h2>
          <ConfigForm
            key={`${config.name}:${provider.name}`}
            fields={toolsetConfigFields(provider)}
            busy={busy === 'env'}
            submitLabel="Guardar claves"
            onSubmit={async ({ values }) => {
              setBusy('env')
              setError('')
              try {
                await setToolsetEnv(name, values, profile)
                setNote('Claves guardadas.')
                setProviderKey(k => k + 1)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'No se pudieron guardar las claves.')
              } finally {
                setBusy('')
              }
            }}
          />
        </div>
      )}

      {models?.has_models && models.models.length > 0 && (
        <div className="ui-section">
          <h2>Modelo</h2>
          <select
            className="input"
            value={models.current ?? ''}
            disabled={busy === 'model'}
            onChange={e => void pickModel(e.target.value)}
          >
            {models.models.map(m => (
              <option key={m.id} value={m.id}>
                {m.display || m.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {note && <p className="muted">{note}</p>}
      {error && <p className="error-text">{error}</p>}
    </>
  )
}
