import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { apiFetch } from '../../lib/api'
import { Avatar } from '../../ui/Avatar'
import { loadProfiles, profiles } from '../bots/store'

export function ConnectorsPage() {
  const list = useStore(profiles)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    void loadProfiles()
  }, [])

  async function toggle(name: string, running?: boolean) {
    setBusy(name)
    try {
      const action = running ? 'stop' : 'start'
      const q = name === 'default' ? '' : `?profile=${encodeURIComponent(name)}`
      await apiFetch(`/api/gateway/${action}${q}`, { method: 'POST' })
      await loadProfiles()
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <h1 className="page-title">Conectores</h1>
      <p className="page-subtitle">
        Gateways de mensajería de cada bot (Telegram, Discord, Slack…).
      </p>

      {list.length === 0 && <p className="muted">No hay bots.</p>}

      <div className="list">
        {list.map(p => (
          <div key={p.name} className="card row">
            <Avatar name={p.name} />
            <div className="spacer">
              <div>{p.name}</div>
              <span className={p.gateway_running ? 'chip ok' : 'chip'}>
                {p.gateway_running ? 'Conectado' : 'Detenido'}
              </span>
            </div>
            <button
              className="btn"
              disabled={busy === p.name}
              onClick={() => void toggle(p.name, p.gateway_running)}
            >
              {busy === p.name ? '…' : p.gateway_running ? 'Detener' : 'Iniciar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
