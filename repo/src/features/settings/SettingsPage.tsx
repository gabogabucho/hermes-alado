import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { checkAuth, user } from '../auth/store'
import { backendUrl, setTheme, theme, updateBackendUrl, type ThemeChoice } from './store'

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'hermes', label: 'Hermes' },
  { value: 'clean', label: 'Clean' },
]

export function SettingsPage() {
  const url = useStore(backendUrl)
  const me = useStore(user)
  const currentTheme = useStore(theme)
  const [draft, setDraft] = useState(url)
  const [saved, setSaved] = useState(false)

  async function onSave() {
    updateBackendUrl(draft)
    setSaved(true)
    await checkAuth()
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <h1 className="page-title">Ajustes</h1>

      <div className="card" style={{ marginBottom: 14 }}>
        <label className="faint">Tema</label>
        <div className="row" style={{ marginTop: 6, gap: 8 }}>
          {THEME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`btn${currentTheme === opt.value ? ' btn-primary' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setTheme(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <label className="faint">URL del backend de Hermes</label>
        <input
          className="input"
          style={{ marginTop: 6 }}
          placeholder="https://tu-vps:9119 (vacío = mismo origen)"
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => void onSave()}>
          {saved ? 'Guardado ✓' : 'Guardar y reconectar'}
        </button>
      </div>

      {me && (
        <div className="card">
          <div className="row">
            <div className="login-logo" style={{ width: 42, height: 42, borderRadius: 12, fontSize: '1.05rem' }}>
              {initial(me.display_name ?? me.email ?? '?')}
            </div>
            <div>
              <div>{me.display_name ?? me.email}</div>
              <div className="faint">{me.email ?? me.provider}</div>
            </div>
          </div>
        </div>
      )}

      <p className="faint" style={{ marginTop: 16 }}>
        La PWA se sirve del mismo origen que Hermes para que la sesión (cookie)
        funcione. Si usás un backend en otra URL, configuralo acá.
      </p>
    </div>
  )
}

function initial(s: string): string {
  return (s || '?').charAt(0).toUpperCase()
}
