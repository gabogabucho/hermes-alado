import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useParams } from 'react-router-dom'
import { useBack } from '../../app/transition'
import { vaultLabel } from '../../lib/hermes/vault-labels'
import { vaultBrandName } from './vault-brand'
import { BrandIcon } from '../../ui/BrandIcon'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import { StatusDot } from '../../ui/StatusDot'
import { ConfirmSheet } from './ConfirmSheet'
import { envError, envLoading, envVars, loadEnvVars, removeVar, saveVar } from './store'
import './vault.css'

export function VaultKeyPage() {
  const back = useBack('/settings/vault')
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
  const label = info ? vaultLabel(key, info) : key

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
    <PageShell title={label} onBack={back}>
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
          <Section>
            <Row
              leading={
                <BrandIcon
                  name={vaultBrandName(key, info) ?? info.provider_label ?? info.provider ?? key}
                  size={28}
                />
              }
              title={info.description || 'Variable de entorno'}
              trailing={
                <StatusDot tone={info.is_set ? 'ok' : 'neutral'} label={info.is_set ? 'Configurada' : 'Sin configurar'} />
              }
            >
              <span className="row-key">{key}</span>
            </Row>
          </Section>

          {info.is_set && info.redacted_value && (
            <Section>
              <div className="card" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                <div className="vault-key-redacted mono">{info.redacted_value}</div>
              </div>
            </Section>
          )}

          {info.url && (
            <Section>
              <a
                className="btn btn-block"
                href={info.url}
                target="_blank"
                rel="noreferrer"
              >
                Conseguir clave
              </a>
            </Section>
          )}

          {info.tools.length > 0 && (
            <Section label="La usan">
              <div className="card" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                <div className="vault-tools">
                  {info.tools.map(tool => (
                    <span key={tool} className="chip">
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            </Section>
          )}

          <Section label={info.is_set ? 'Reemplazar valor' : 'Guardar valor'}>
            <div className="card">
              <input
                className="input"
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
          </Section>

          {info.is_set && (
            <Section>
              <button
                className="btn btn-danger btn-block"
                style={{ minHeight: 44 }}
                onClick={() => setConfirmOpen(true)}
              >
                Borrar esta credencial
              </button>
              {removeError && <p className="error-text">{removeError}</p>}
            </Section>
          )}

          <p className="faint" style={{ padding: '0 var(--space-1)' }}>
            Sin tarjetas de pago: la Bóveda solo guarda claves, tokens y logins de servicio. El valor
            actual nunca se muestra.
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
    </PageShell>
  )
}
