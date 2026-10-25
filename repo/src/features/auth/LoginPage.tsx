import { useStore } from '@nanostores/react'
import { useNavigate } from 'react-router-dom'
import { loginUrl } from '../../lib/config'
import { backendUrl } from '../settings/store'
import { authError, authState, authStatus, checkAuth } from './store'

export function LoginPage() {
  const status = useStore(authStatus)
  const state = useStore(authState)
  const error = useStore(authError)
  const url = useStore(backendUrl)
  const navigate = useNavigate()

  const unreachable = status === 'error'

  return (
    <div className="login-wrap">
      <div className="login-logo">H</div>
      <h1 className="login-title">Hermes</h1>
      <p className="muted">Tu agente, en el bolsillo.</p>

      {unreachable && (
        <p className="error-text">No se pudo conectar al backend{error ? `: ${error}` : ''}.</p>
      )}

      <p className="faint">
        {url ? `Backend: ${url}` : 'Backend: mismo origen (sin configurar).'}
      </p>

      {state?.mode === 'gated-anonymous' && (
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            window.location.href = loginUrl(window.location.pathname)
          }}
        >
          Iniciar sesión con Hermes
        </button>
      )}

      {unreachable && (
        <button className="btn btn-primary btn-block" onClick={() => void checkAuth()}>
          Reintentar
        </button>
      )}

      <button className="btn btn-block" onClick={() => navigate('/settings')}>
        Configurar backend
      </button>
    </div>
  )
}
