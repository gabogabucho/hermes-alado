import { useStore } from '@nanostores/react'
import { useNavigate } from 'react-router-dom'
import { loginUrl } from '../../lib/config'
import { authError, authStatus } from '../../store/auth'
import { backendUrl } from '../../store/settings'

export function LoginPage() {
  const status = useStore(authStatus)
  const error = useStore(authError)
  const url = useStore(backendUrl)
  const navigate = useNavigate()

  return (
    <div className="login-wrap">
      <div className="login-logo">H</div>
      <h1 className="login-title">Hermes</h1>
      <p className="muted">Tu agente, en el bolsillo.</p>

      {status === 'error' && (
        <p className="error-text">No se pudo conectar al backend{error ? `: ${error}` : ''}.</p>
      )}

      <p className="faint">
        {url ? `Backend: ${url}` : 'Backend: mismo origen (sin configurar).'}
      </p>

      <button
        className="btn btn-primary btn-block"
        onClick={() => {
          window.location.href = loginUrl(window.location.pathname)
        }}
      >
        Iniciar sesión con Hermes
      </button>

      <button className="btn btn-block" onClick={() => navigate('/settings')}>
        Configurar backend
      </button>
    </div>
  )
}
