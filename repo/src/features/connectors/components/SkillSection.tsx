import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  hubIdentifier,
  installSkill,
  isHubId,
  previewSkill,
  toggleSkill,
  uninstallSkill,
  updateSkillHub,
  type HubPreview,
} from '../../../lib/hermes/connectors'
import { Sheet } from '../../../ui/Sheet'
import { Toggle } from '../../../ui/Toggle'

export function SkillSection({
  id,
  name,
  profile,
  enabled,
  hubProvenance,
  onChanged,
}: {
  id: string
  name: string
  profile?: string
  enabled: boolean
  hubProvenance: boolean
  onChanged: () => Promise<void> | void
}) {
  const navigate = useNavigate()
  const hub = isHubId(id)
  const [preview, setPreview] = useState<HubPreview | null>(null)
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<'uninstall' | null>(null)

  useEffect(() => {
    if (!hub) return
    let cancelled = false
    void previewSkill(hubIdentifier(id))
      .then(p => {
        if (!cancelled) setPreview(p)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [hub, id])

  const toggle = async (next: boolean) => {
    setBusy('toggle')
    setError('')
    try {
      await toggleSkill(name, next, profile)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setBusy('')
    }
  }

  const install = async () => {
    setBusy('install')
    setError('')
    try {
      await installSkill(hubIdentifier(id), profile)
      setNote('Instalando desde el hub en el servidor…')
      await onChanged()
      navigate(`/connectors/skills/${encodeURIComponent(name)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo instalar.')
    } finally {
      setBusy('')
    }
  }

  const update = async () => {
    setBusy('update')
    setError('')
    try {
      await updateSkillHub(profile)
      setNote('Actualizando habilidades del hub…')
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar.')
    } finally {
      setBusy('')
    }
  }

  const uninstall = async () => {
    setConfirm(null)
    setBusy('uninstall')
    setError('')
    try {
      await uninstallSkill(name, profile)
      navigate('/connectors')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desinstalar.')
      setBusy('')
    }
  }

  if (hub) {
    return (
      <>
        {preview?.skill_md && (
          <div className="ui-section">
            <h2>Instrucciones</h2>
            <pre className="skill-md">{preview.skill_md}</pre>
            {preview.files.length > 0 && <p className="faint">{preview.files.length} archivos incluidos</p>}
          </div>
        )}
        <button type="button" className="btn btn-primary btn-block" disabled={busy === 'install'} onClick={() => void install()}>
          {busy === 'install' ? '…' : 'Instalar habilidad'}
        </button>
        {preview?.trust_level && <p className="faint">Confianza del hub: {preview.trust_level}</p>}
        {note && <p className="muted">{note}</p>}
        {error && <p className="error-text">{error}</p>}
      </>
    )
  }

  return (
    <>
      <div className="ui-section">
        <h2>Estado</h2>
        <div className="list-row">
          <span className="list-row-body">
            <span className="list-row-title">Habilitada</span>
          </span>
          <span className="list-row-trailing">
            <Toggle checked={enabled} onChange={v => void toggle(v)} label="Habilitada" />
          </span>
        </div>
      </div>
      {hubProvenance && (
        <div className="ui-section">
          <h2>Hub</h2>
          <button type="button" className="btn btn-block" disabled={busy === 'update'} onClick={() => void update()}>
            {busy === 'update' ? '…' : 'Actualizar desde el hub'}
          </button>
          <button
            type="button"
            className="btn btn-block"
            style={{ marginTop: 10, color: 'var(--danger)', borderColor: 'var(--danger)' }}
            disabled={busy === 'uninstall'}
            onClick={() => setConfirm('uninstall')}
          >
            Desinstalar
          </button>
          <Sheet open={confirm === 'uninstall'} onClose={() => setConfirm(null)} title="¿Desinstalar?">
            <p className="muted">Se elimina la habilidad "{name}" del perfil.</p>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void uninstall()}>
                Desinstalar
              </button>
            </div>
          </Sheet>
        </div>
      )}
      {note && <p className="muted">{note}</p>}
      {error && <p className="error-text">{error}</p>}
    </>
  )
}
