import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  disablePlugin,
  enablePlugin,
  removePlugin,
  updatePlugin,
  type PluginRow,
} from '../../../lib/hermes/connectors'
import { Sheet } from '../../../ui/Sheet'
import { Toggle } from '../../../ui/Toggle'

export function PluginSection({
  name,
  profile,
  row,
  onChanged,
}: {
  name: string
  profile?: string
  row: PluginRow | undefined
  onChanged: () => Promise<void> | void
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)

  const enabled = row?.runtime_status === 'enabled'

  const toggle = async (next: boolean) => {
    setBusy('toggle')
    setError('')
    setNote('')
    try {
      const res = next ? await enablePlugin(name, profile) : await disablePlugin(name, profile)
      if (res.restart_required) setNote('Puede requerir reiniciar el agente.')
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setBusy('')
    }
  }

  const update = async () => {
    setBusy('update')
    setError('')
    try {
      await updatePlugin(name, profile)
      setNote('Actualizando plugin…')
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar.')
    } finally {
      setBusy('')
    }
  }

  const remove = async () => {
    setConfirmRemove(false)
    setBusy('remove')
    try {
      await removePlugin(name, profile)
      navigate('/connectors')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar.')
      setBusy('')
    }
  }

  return (
    <>
      <div className="ui-section">
        <h2>Estado</h2>
        <div className="list-row">
          <span className="list-row-body">
            <span className="list-row-title">Habilitado</span>
            {row?.version && <span className="list-row-subtitle">v{row.version}</span>}
          </span>
          <span className="list-row-trailing">
            <Toggle checked={enabled} onChange={v => void toggle(v)} label="Habilitado" />
          </span>
        </div>
        {row?.auth_required && row.auth_command && (
          <p className="faint" style={{ marginTop: 8 }}>
            Requiere login: <code>{row.auth_command}</code> (ejecutalo en la máquina de Hermes)
          </p>
        )}
      </div>

      {(row?.can_update_git || row?.can_remove) && (
        <div className="ui-section">
          <h2>Mantenimiento</h2>
          {row?.can_update_git && (
            <button type="button" className="btn btn-block" disabled={busy === 'update'} onClick={() => void update()}>
              {busy === 'update' ? '…' : 'Actualizar'}
            </button>
          )}
          {row?.can_remove && (
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: row?.can_update_git ? 10 : 0, color: 'var(--danger)', borderColor: 'var(--danger)' }}
              disabled={busy === 'remove'}
              onClick={() => setConfirmRemove(true)}
            >
              Eliminar
            </button>
          )}
          <Sheet open={confirmRemove} onClose={() => setConfirmRemove(false)} title="¿Eliminar plugin?">
            <p className="muted">Se elimina el plugin "{name}" de este perfil.</p>
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setConfirmRemove(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void remove()}>
                Eliminar
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
