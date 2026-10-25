import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deleteMcpServer,
  installMcpEntry,
  mcpInstallFields,
  setMcpServerEnabled,
  testMcpServer,
  type McpCatalogEntry,
  type McpServerSummary,
} from '../../../lib/hermes/connectors'
import { Sheet } from '../../../ui/Sheet'
import { Toggle } from '../../../ui/Toggle'
import { ConfigForm } from './ConfigForm'
import { OAuthButton } from './OAuthButton'

export function McpSection({
  name,
  profile,
  entry,
  server,
  onChanged,
}: {
  name: string
  profile?: string
  entry: McpCatalogEntry | undefined
  server: McpServerSummary | undefined
  onChanged: () => Promise<void> | void
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; tools: { name: string; description: string }[] } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!server) {
    if (!entry) return <p className="muted">Este conector no existe en el catálogo de tu backend.</p>
    const installFields = mcpInstallFields(entry)
    const run = async ({ values }: { values: Record<string, string>; clears: string[] }) => {
      setBusy('install')
      setError('')
      try {
        const res = await installMcpEntry(entry.name, values, profile)
        if (res.background) setError('Instalando en segundo plano en el servidor…')
        else setError('Instalado.')
        await onChanged()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo instalar.')
      } finally {
        setBusy('')
      }
    }
    return (
      <>
        {installFields.length > 0 && (
          <div className="ui-section">
            <h2>Configuración</h2>
            <ConfigForm
              key={entry.name}
              fields={installFields}
              busy={busy === 'install'}
              submitLabel="Instalar y conectar"
              onSubmit={run}
            />
          </div>
        )}
        {installFields.length === 0 && (
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy === 'install'}
            onClick={() =>
              void (async () => {
                setBusy('install')
                setError('')
                try {
                  await installMcpEntry(entry.name, {}, profile)
                  await onChanged()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'No se pudo instalar.')
                } finally {
                  setBusy('')
                }
              })()
            }
          >
            {busy === 'install' ? '…' : 'Instalar y conectar'}
          </button>
        )}
        {error && <p className="error-text">{error}</p>}
      </>
    )
  }

  const oauth = entry?.auth_type === 'oauth' || server.auth === 'oauth'

  const test = async () => {
    setBusy('test')
    setTestResult(null)
    try {
      setTestResult(await testMcpServer(name, profile))
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : 'No se pudo probar.', tools: [] })
    } finally {
      setBusy('')
    }
  }

  const toggle = async (enabled: boolean) => {
    setBusy('toggle')
    try {
      await setMcpServerEnabled(name, enabled, profile)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setBusy('')
    }
  }

  const remove = async () => {
    setConfirmDelete(false)
    setBusy('delete')
    try {
      await deleteMcpServer(name, profile)
      navigate(`/bots/${encodeURIComponent(profile ?? 'default')}/connectors`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desconectar.')
      setBusy('')
    }
  }

  return (
    <>
      <div className="ui-section">
        <h2>Estado</h2>
        <div className="list">
          <div className="list-row">
            <span className="list-row-body">
              <span className="list-row-title">Habilitado</span>
              <span className="list-row-subtitle">{server.transport === 'stdio' ? 'stdio' : server.url ?? ''}</span>
            </span>
            <span className="list-row-trailing">
              <Toggle checked={server.enabled} onChange={v => void toggle(v)} label="Habilitado" />
            </span>
          </div>
          {Object.keys(server.env).length > 0 && (
            <div className="list-row">
              <span className="list-row-body">
                <span className="list-row-title">Variables de entorno</span>
                <span className="list-row-subtitle">{Object.keys(server.env).join(', ')}</span>
              </span>
              <span className="list-row-trailing">configuradas</span>
            </div>
          )}
        </div>
      </div>

      <div className="ui-section">
        <h2>Probar</h2>
        <button type="button" className="btn btn-block" disabled={busy === 'test'} onClick={() => void test()}>
          {busy === 'test' ? 'Probando…' : 'Probar conexión'}
        </button>
        {testResult && (
          <div className="card" style={{ marginTop: 10 }}>
            {testResult.ok ? (
              <p className="chip ok">Conexión correcta — {testResult.tools.length} herramientas</p>
            ) : (
              <p className="error-text">{testResult.error ?? 'La conexión falló.'}</p>
            )}
            {testResult.tools.length > 0 && (
              <ul className="tool-list">
                {testResult.tools.map(t => (
                  <li key={t.name}>
                    <strong>{t.name}</strong> — {t.description}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {oauth && (
        <div className="ui-section">
          <h2>OAuth</h2>
          <OAuthButton serverName={name} profile={profile} onDone={() => void onChanged()} />
        </div>
      )}

      <div className="ui-section">
        <h2>Desconectar</h2>
        <button
          type="button"
          className="btn btn-block"
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          disabled={busy === 'delete'}
          onClick={() => setConfirmDelete(true)}
        >
          {busy === 'delete' ? '…' : 'Desconectar'}
        </button>
        <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="¿Desconectar?">
          <p className="muted">Se elimina el servidor MCP "{name}" de este perfil.</p>
          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger" onClick={() => void remove()}>
              Desconectar
            </button>
          </div>
        </Sheet>
      </div>
      {error && <p className="error-text">{error}</p>}
    </>
  )
}
