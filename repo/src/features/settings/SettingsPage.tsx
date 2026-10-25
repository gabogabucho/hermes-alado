import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { APP_NAME } from '../../app/brand'
import { useBack, useSlideNavigate } from '../../app/transition'
import { InstallSheet } from '../install/InstallSheet'
import {
  canNativeInstall,
  installablePlatform,
  isStandalone,
  triggerInstall,
} from '../install/install-prompt'
import { Disclosure } from '../../ui/Disclosure'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Toggle } from '../../ui/Toggle'
import {
  pushBusy,
  pushError,
  pushSetup,
  pushTested,
  refreshPushStatus,
  setMasterEnabled,
  testPush,
} from '../push/store'
import { checkAuth, user } from '../auth/store'
import { backendUrl, setTheme, theme, updateBackendUrl, type ThemeChoice } from './store'

const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Automático' },
  { value: 'hermes', label: 'Hermes' },
  { value: 'clean', label: 'Clean' },
]

export function SettingsPage() {
  const back = useBack('/')
  const { forward } = useSlideNavigate()
  const url = useStore(backendUrl)
  const me = useStore(user)
  const currentTheme = useStore(theme)
  const setup = useStore(pushSetup)
  const busy = useStore(pushBusy)
  const error = useStore(pushError)
  const tested = useStore(pushTested)
  const [draft, setDraft] = useState(url)
  const [saved, setSaved] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)

  const showInstallRow = !isStandalone() && installablePlatform()

  useEffect(() => {
    void refreshPushStatus()
  }, [])

  async function onSave() {
    updateBackendUrl(draft)
    setSaved(true)
    await checkAuth()
    setTimeout(() => setSaved(false), 2000)
  }

  const displayName = me?.display_name ?? me?.email ?? 'Hermes'
  const email = me?.email ?? me?.provider

  const pushOn = setup?.state === 'on'
  const notifSubtitle = (() => {
    switch (setup?.state) {
      case 'unsupported':
        return 'Este navegador no soporta notificaciones push'
      case 'ios-install':
        return 'Instalá la app para recibir notificaciones'
      case 'no-plugin':
        return 'Las notificaciones requieren el complemento del servidor'
      case 'permission-denied':
        return 'Permiso denegado: habilitá las notificaciones en el navegador'
      default:
        return 'Avisos cuando un bot termine o te esté esperando'
    }
  })()

  return (
    <PageShell title="Ajustes" onBack={back}>
      {me && (
        <Section label="Cuenta">
          <Row
            leading={
              <span className="home-user" aria-hidden="true">
                {displayName.charAt(0).toUpperCase()}
              </span>
            }
            title={displayName}
            subtitle={email}
          />
        </Section>
      )}

      <Section label="Bot">
        <Row
          icon="grid"
          tint="accent"
          title="Conectar aplicaciones"
          subtitle="Apps, herramientas, habilidades y canales"
          chevron
          onClick={() => forward('/connectors')}
        />
        <Row
          icon="folder"
          tint="accent"
          title="Bóveda"
          subtitle="Claves de API y credenciales"
          chevron
          onClick={() => forward('/settings/vault')}
        />
        <Row
          icon="monitor"
          tint="accent"
          title="Control del agente"
          subtitle="Aprobaciones, computer use y tareas en curso"
          chevron
          onClick={() => forward('/settings/control')}
        />
      </Section>

      <Section label="Notificaciones">
        <Row
          icon="bell"
          tint="accent"
          title="Notificaciones"
          subtitle={notifSubtitle}
          trailing={
            <Toggle
              checked={pushOn}
              onChange={next => void setMasterEnabled(next)}
              label="Notificaciones de este dispositivo"
            />
          }
        />
        {error && (
          <Row icon="info" tint="warn" title={error} subtitle="Revisá el complemento en el servidor de Hermes." />
        )}
        {pushOn && (
          <Row
            icon="send"
            tint="accent"
            title={tested ? 'Prueba enviada ✓' : 'Probar'}
            subtitle="Envía una notificación de prueba a este dispositivo"
            disabled={busy}
            onClick={() => void testPush()}
          />
        )}
      </Section>

      <Section label="Apariencia">
        <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <div className="segmented" role="radiogroup" aria-label="Tema">
            {THEME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={currentTheme === opt.value}
                className={currentTheme === opt.value ? 'segmented-item active' : 'segmented-item'}
                onClick={() => setTheme(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {showInstallRow && (
        <Section label="App">
          <Row
            icon="arrow-up"
            tint="accent"
            title="Instalar app"
            subtitle={`Abrí ${APP_NAME} a pantalla completa, como una app`}
            chevron
            onClick={() => {
              if (canNativeInstall()) void triggerInstall()
              else setInstallOpen(true)
            }}
          />
        </Section>
      )}

      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} />

      <Section label="Avanzado">
        <Disclosure title="URL del backend de Hermes">
          <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
            <input
              className="input"
              placeholder="https://tu-vps:9119 (vacío = mismo origen)"
              value={draft}
              onChange={e => setDraft(e.target.value)}
            />
            <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => void onSave()}>
              {saved ? 'Guardado ✓' : 'Guardar y reconectar'}
            </button>
            <p className="faint" style={{ marginTop: 12 }}>
              La PWA se sirve del mismo origen que Hermes para que la sesión (cookie) funcione. Si
              usás un backend en otra URL, configuralo acá.
            </p>
          </div>
        </Disclosure>
      </Section>
    </PageShell>
  )
}
