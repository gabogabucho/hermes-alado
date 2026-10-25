import { useState } from 'react'
import { APP_NAME } from '../../app/brand'
import { Icon } from '../../ui/Icon'
import { Sheet } from '../../ui/Sheet'
import './install.css'
import {
  canNativeInstall,
  dismissInstall,
  isIOS,
  triggerInstall,
} from './install-prompt'

/**
 * The first-run install invite: native "Instalar" on Android/Chromium, the
 * three manual steps on iOS Safari. "Ahora no" dismisses (re-offer once after
 * 14 days, handled by install-prompt.ts).
 */
export function InstallSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [installing, setInstalling] = useState(false)
  const native = canNativeInstall()
  const ios = isIOS()

  async function onInstall() {
    setInstalling(true)
    try {
      const accepted = await triggerInstall()
      if (accepted) {
        onClose()
        return
      }
    } finally {
      setInstalling(false)
    }
  }

  function onDismiss() {
    dismissInstall()
    onClose()
  }

  return (
    <Sheet open={open} onClose={onDismiss} title={`Instalá ${APP_NAME}`}>
      {native ? (
        <>
          <p className="muted">
            Abrí {APP_NAME} como una app: a pantalla completa, sin escribir la
            dirección cada vez.
          </p>
          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: 12 }}
            disabled={installing}
            onClick={() => void onInstall()}
          >
            {installing ? 'Instalando…' : 'Instalar'}
          </button>
          <button className="btn btn-block" style={{ marginTop: 8 }} onClick={onDismiss}>
            Ahora no
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Para tenerla como una app a pantalla completa, seguí estos pasos:
          </p>
          <ol className="install-steps">
            <li>
              <span className="install-step-icon">
                <Icon name="share" size={18} />
              </span>
              <span>
                {ios ? (
                  <>Tocá <strong>Compartir</strong> en Safari.</>
                ) : (
                  <>Abrí el menú <strong>⋮</strong> de Chrome y elegí <strong>“Instalar app”</strong>.</>
                )}
              </span>
            </li>
            <li>
              <span className="install-step-icon">
                <Icon name="plus" size={18} />
              </span>
              <span>
                Elegí <strong>“Agregar a inicio”</strong> o
                <strong> “Agregar a pantalla de inicio”</strong>.
              </span>
            </li>
            <li>
              <span className="install-step-icon">
                <Icon name="arrow-up" size={18} />
              </span>
              <span>
                Abrí <strong>{APP_NAME}</strong> desde el ícono nuevo.
              </span>
            </li>
          </ol>
          <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={onDismiss}>
            Entendido
          </button>
        </>
      )}
    </Sheet>
  )
}
