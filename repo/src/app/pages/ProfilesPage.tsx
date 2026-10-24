import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { BotAvatar } from '../../components/BotAvatar'
import {
  activeProfile,
  createProfile,
  loadProfiles,
  profiles,
  profilesError,
  profilesLoading,
  setActiveProfile,
} from '../../store/profiles'
import type { Profile } from '../../lib/types'

export function ProfilesPage() {
  const navigate = useNavigate()
  const list = useStore(profiles)
  const loading = useStore(profilesLoading)
  const error = useStore(profilesError)
  const active = useStore(activeProfile)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    void loadProfiles()
  }, [])

  async function onCreate() {
    const name = newName.trim()
    if (!name) return
    await createProfile(name)
    setNewName('')
    setCreating(false)
    await loadProfiles()
  }

  async function onSelect(p: Profile) {
    if (p.name !== active) {
      try {
        await setActiveProfile(p.name)
      } catch {
        // non-fatal: still open the chat
      }
    }
    navigate(`/chat/${encodeURIComponent(p.name)}`)
  }

  return (
    <div>
      <div className="row">
        <h1 className="page-title">Bots</h1>
        <span className="spacer" />
        <button className="btn" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancelar' : 'Nuevo'}
        </button>
      </div>

      {creating && (
        <div className="card" style={{ marginBottom: 14 }}>
          <input
            className="input"
            placeholder="Nombre del bot"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => void onCreate()}>
            Crear
          </button>
        </div>
      )}

      {loading && <p className="muted">Cargando…</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !error && list.length === 0 && (
        <div className="empty">
          <p className="muted">No hay bots. Creá uno para arrancar.</p>
        </div>
      )}

      <div className="list">
        {list.map((p) => (
          <button
            key={p.name}
            className="card profile-card"
            onClick={() => void onSelect(p)}
          >
            <BotAvatar name={p.name} />
            <div className="profile-info">
              <div className="profile-name">
                {p.display_name || p.name}
                {p.is_default && <span className="chip" style={{ marginLeft: 8 }}>default</span>}
              </div>
              {p.description && <div className="faint">{p.description}</div>}
            </div>
            <span className="muted">›</span>
          </button>
        ))}
      </div>
    </div>
  )
}


