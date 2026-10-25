import { useState } from 'react'
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
  const [draft, setDraft] = useState(url)
  const [saved, setSaved] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)

  const showInstallRow = !isStandalone() && installablePlatform()

  async function onSave() {
    updateBackendUrl(draft)
    setSaved(true)
    await checkAuth()
    setTimeout(() => setSaved(false), 2000)
  }

  const displayName = me?.display_name ?? me?.email ?? 'Hermes'
  const email = me?.email ?? me?.provider

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
