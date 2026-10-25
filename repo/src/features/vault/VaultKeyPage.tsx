import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useParams } from 'react-router-dom'
import { useSlideNavigate } from '../../app/transition'
import { IconButton } from '../../ui/IconButton'
import { Skeleton } from '../../ui/Skeleton'
import { ConfirmSheet } from './ConfirmSheet'
import { envError, envLoading, envVars, loadEnvVars, removeVar, saveVar } from './store'
import './vault.css'

export function VaultKeyPage() {
  const { back } = useSlideNavigate()
  const { key = '' } = useParams()
  const vars = useStore(envVars)
  const loading = useStore(envLoading)
  const error = useStore(envError)

  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')

  useEffect(() => {
    void loadEnvVars()
  }, [])

  const info = useMemo(() => vars?.[key], [vars, key])

  async function onSave() {
    if (!value) {
      setSaveError('Escribí el nuevo valor.')
      return
    }
    setSaveError('')
    setSaving(true)
    try {
      await saveVar(key, value)
      setValue('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'No se pudo guardar el valor.')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    setRemoving(true)
    try {
      await removeVar(key)
      back()
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'No se pudo borrar la variable.')
      setRemoving(false)
      setConfirmOpen(false)
    }
  }

  return (
    <div className="settings-page">
      <header className="page-header glass">
        <IconButton icon="back" variant="ghost" label="Volver" onClick={back} />
        <h1 className="page-header-title">Credencial</h1>
      </header>

      {loading ? (
        <div className="list">
          <Skeleton width="50%" />
          <Skeleton height={56} />
          <Skeleton height={96} />
        </div>
      ) : error ? (
        <div className="empty">
          <p className="error-text">{error}</p>
          <button className="btn" onClick={() => void loadEnvVars()}>
            Reintentar
          </button>
        </div>
      ) : !info ? (
        <div className="empty">
          <p className="muted">No existe la variable {key} en el perfil actual.</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="row">
              <div className="spacer">
                <div className="vault-key-name">{key}</div>
                <div className="faint">{info.description || 'Variable de entorno'}</div>
              </div>
              <span className={`chip${info.is_set ? ' ok' : ''}`}>
                {info.is_set ? 'Guardada' : 'Sin valor'}
              </span>
            </div>
            {info.is_set && info.redacted_value && (
              <div className="vault-key-redacted mono">{info.redacted_value}</div>
            )}
            {info.url && (
              <a
                className="btn btn-block"
                style={{ marginTop: 12, minHeight: 44 }}
                href={info.url}
                target="_blank"
                rel="noreferrer"
              >
                Conseguir clave
              </a>
            )}
          </div>

          {info.tools.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <label className="faint">La usan</label>
              <div className="vault-tools">
                {info.tools.map(tool => (
                  <span key={tool} className="chip">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <label className="faint">
              {info.is_set ? 'Reemplazar valor' : 'Guardar valor'} (el valor actual nunca se muestra)
            </label>
            <input
              className="input"
              style={{ marginTop: 6 }}
              type={info.is_password ? 'password' : 'text'}
              autoComplete="off"
              placeholder={info.is_password ? 'Nuevo valor…' : 'Valor…'}
              value={value}
              onChange={e => setValue(e.target.value)}
            />
            {saveError && <p className="error-text">{saveError}</p>}
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 10, minHeight: 44 }}
              disabled={saving || !value}
              onClick={() => void onSave()}
            >
              {saving ? 'Guardando…' : saved ? 'Guardado ✓' : 'Guardar'}
            </button>
          </div>

          {info.is_set && (
            <div className="card" style={{ marginTop: 14 }}>
              <label className="faint">Peligro</label>
              <button
                className="btn btn-danger btn-block"
                style={{ marginTop: 8, minHeight: 44 }}
                onClick={() => setConfirmOpen(true)}
              >
                Borrar esta credencial
              </button>
              {removeError && <p className="error-text">{removeError}</p>}
            </div>
          )}

          <p className="faint" style={{ marginTop: 16 }}>
            Sin tarjetas de pago: la Bóveda solo guarda claves, tokens y logins de servicio.
          </p>

          <ConfirmSheet
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            title="Borrar credencial"
            body={`¿Borrás ${key}? Las herramientas que la usan dejan de funcionar hasta que cargues otra.`}
            confirmLabel="Borrar"
            busy={removing}
            onConfirm={() => void onDelete()}
          />
        </>
      )}
    </div>
  )
}
