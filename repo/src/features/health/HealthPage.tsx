import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useBack, useSlideNavigate } from '../../app/transition'
import type { CheckStatus } from '../../lib/hermes/doctor-output'
import { PREPARER_COMMAND } from '../../lib/hermes/preparer'
import type { Remediation } from '../../lib/hermes/remediation'
import { Disclosure } from '../../ui/Disclosure'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import { StatusDot, type DotTone } from '../../ui/StatusDot'
import { groupDoctorAreas } from './areas'
import {
  collectRemediations,
  computerUse,
  doctorError,
  doctorPhase,
  doctorRaw,
  doctorResult,
  envVars,
  loadProbes,
  modelCredential,
  probeError,
  probeLoading,
  repairBusy,
  repairError,
  repairProgress,
  runDoctor,
  runRepair,
  toolsets,
} from './store'
import './health.css'

const CLOUD_BROWSERS: { title: string; key: string; subtitle: string }[] = [
  { title: 'Browserbase', key: 'BROWSERBASE_API_KEY', subtitle: 'Navegador en la nube de Browserbase' },
  { title: 'Browser Use', key: 'BROWSER_USE_API_KEY', subtitle: 'Navegador en la nube de Browser Use' },
]

function checkTone(status: CheckStatus): DotTone {
  return status === 'ok' ? 'ok' : status === 'warn' ? 'warn' : 'danger'
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => {
        void copyText(text).then(ok => {
          setDone(ok)
          setTimeout(() => setDone(false), 1600)
        })
      }}
    >
      {done ? 'Copiado ✓' : 'Copiar'}
    </button>
  )
}

function RemediationCard({
  remediation,
  onRepair,
  onOpenVault,
}: {
  remediation: Remediation
  onRepair: (r: Remediation) => void
  onOpenVault: (key: string) => void
}) {
  const busy = useStore(repairBusy) === remediation.id
  const progress = useStore(repairProgress)
  const error = useStore(repairError)

  if (remediation.kind === 'root') {
    return (
      <div className="health-fix card">
        <div className="health-fix-title">Requiere acceso al servidor</div>
        <div className="health-fix-finding">
          {remediation.title} — {remediation.finding}
        </div>
        {remediation.specific && (
          <div className="health-cmd">
            <div className="health-cmd-label">Solo este problema</div>
            <div className="health-cmd-row">
              <code className="health-cmd-code">{remediation.specific}</code>
              <CopyButton text={remediation.specific} />
            </div>
          </div>
        )}
        <div className="health-cmd">
          <div className="health-cmd-label">Reparación completa (recomendada)</div>
          <div className="health-cmd-row">
            <code className="health-cmd-code">{PREPARER_COMMAND}</code>
            <CopyButton text={PREPARER_COMMAND} />
          </div>
        </div>
      </div>
    )
  }

  if (remediation.kind === 'vault') {
    return (
      <Row
        icon="folder"
        tint="accent"
        title={remediation.title}
        subtitle={remediation.finding}
        chevron
        onClick={() => onOpenVault(remediation.envKey)}
      />
    )
  }

  return (
    <div className="health-fix card">
      <div className="health-fix-title">{remediation.title}</div>
      <div className="health-fix-finding">{remediation.finding}</div>
      {busy && progress ? <div className="faint health-progress">{progress}</div> : null}
      {error && <p className="error-text">{error}</p>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() => onRepair(remediation)}
      >
        {busy ? 'Reparando…' : 'Reparar'}
      </button>
    </div>
  )
}

export function HealthPage() {
  const back = useBack('/settings/control')
  const { forward } = useSlideNavigate()

  const probesLoading = useStore(probeLoading)
  const probesError = useStore(probeError)
  const cu = useStore(computerUse)
  const ts = useStore(toolsets)
  const mc = useStore(modelCredential)
  const env = useStore(envVars)

  const phase = useStore(doctorPhase)
  const result = useStore(doctorResult)
  const raw = useStore(doctorRaw)
  const docError = useStore(doctorError)

  useEffect(() => {
    void loadProbes()
  }, [])

  const areas = useMemo(() => (result ? groupDoctorAreas(result) : []), [result])
  const remediations = collectRemediations()

  const browserRow = ts.find(row => row.name === 'browser')
  const cuDotTone: DotTone = cu == null ? 'neutral' : cu.ready === true ? 'ok' : 'warn'
  const cuDotLabel = cu == null ? 'Sin información' : cu.ready === true ? 'Listo' : 'Requiere configuración'

  const modelDotTone: DotTone =
    mc == null ? 'neutral' : mc.isSet === true ? 'ok' : mc.isSet === false ? 'warn' : 'neutral'
  const modelDotLabel =
    mc == null
      ? 'Sin información'
      : mc.isSet === true
        ? 'Con clave'
        : mc.isSet === false
          ? 'Sin clave'
          : 'No usa clave de Bóveda'

  const summaryTone: DotTone = result ? (result.issues.length > 0 ? 'warn' : 'ok') : 'neutral'
  const summaryLabel = result
    ? result.issues.length > 0
      ? `${result.issues.length} problema${result.issues.length === 1 ? '' : 's'} detectado${result.issues.length === 1 ? '' : 's'}`
      : 'Sin problemas'
    : ''

  return (
    <PageShell title="Salud del sistema" onBack={back}>
      <Section label="Diagnóstico">
        {phase === 'idle' && (
          <Row
            icon="bolt"
            tint="accent"
            title="Ejecutar diagnóstico"
            subtitle="Revisa credenciales, herramientas, navegador y el servidor"
            onClick={() => void runDoctor()}
          />
        )}
        {phase === 'running' && (
          <Row icon="bolt" title="Diagnóstico en curso…" subtitle={<StatusDot tone="neutral" label="Comprobando" />} />
        )}
        {phase === 'error' && (
          <div className="empty">
            <p className="error-text">{docError}</p>
            <button className="btn" onClick={() => void runDoctor()}>
              Reintentar
            </button>
          </div>
        )}
        {phase === 'done' && result && (
          <Row
            icon="bolt"
            title={summaryLabel}
            subtitle="Diagnóstico completo · tocá para repetir"
            trailing={<StatusDot tone={summaryTone} />}
            onClick={() => void runDoctor()}
          />
        )}
      </Section>

      {phase === 'done' && result && areas.length === 0 && (
        <p className="muted" style={{ padding: 'var(--space-3) var(--space-4)' }}>
          El diagnóstico terminó sin devolver resultados legibles.
        </p>
      )}

      {phase === 'done' &&
        result &&
        areas.map(area => (
          <Section key={area.label} label={area.label}>
            {area.checks.map(check => (
              <Row
                key={`${check.status}:${check.text}`}
                title={check.text}
                subtitle={check.detail || undefined}
                trailing={<StatusDot tone={checkTone(check.status)} />}
              />
            ))}
          </Section>
        ))}

      {phase === 'done' && raw && (
        <div className="advanced-block">
          <Disclosure title="Salida completa">
            <pre className="health-raw">{raw}</pre>
          </Disclosure>
        </div>
      )}

      <Section label="Estado inmediato">
        {probesLoading ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <Skeleton height={56} />
            <Skeleton height={56} />
            <Skeleton height={56} />
          </div>
        ) : probesError ? (
          <div className="empty">
            <p className="error-text">{probesError}</p>
            <button className="btn" onClick={() => void loadProbes()}>
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <Row
              icon="bolt"
              title="Modelo activo"
              subtitle={mc ? mc.label : 'Sin información'}
              trailing={<StatusDot tone={modelDotTone} label={modelDotLabel} />}
            />
            <Row
              icon="monitor"
              title="Navegador"
              subtitle={browserRow ? 'Herramienta browser' : 'Sin información'}
              trailing={
                <StatusDot
                  tone={browserRow ? (browserRow.enabled ? 'ok' : 'warn') : 'neutral'}
                  label={browserRow ? (browserRow.enabled ? 'Activo' : 'Desactivado') : 'Sin información'}
                />
              }
            />
            <Row
              icon="monitor"
              title="Control del computador"
              subtitle={cuDotLabel}
              trailing={<StatusDot tone={cuDotTone} label={cuDotLabel} />}
            />
          </>
        )}
      </Section>

      <Section label="Navegador en la nube">
        {CLOUD_BROWSERS.map(browser => {
          const isSet = env?.[browser.key]?.is_set === true
          return (
            <Row
              key={browser.key}
              icon="folder"
              tint="accent"
              title={browser.title}
              subtitle={browser.subtitle}
              trailing={<StatusDot tone={isSet ? 'ok' : 'neutral'} ariaLabel={isSet ? 'Configurado' : 'Sin configurar'} />}
              chevron
              onClick={() => forward(`/settings/vault/${encodeURIComponent(browser.key)}`)}
            />
          )
        })}
      </Section>

      {remediations.length > 0 && (
        <Section label="Arreglos">
          {remediations.map(remediation => (
            <RemediationCard
              key={remediation.id}
              remediation={remediation}
              onRepair={r => void runRepair(r)}
              onOpenVault={key => forward(`/settings/vault/${encodeURIComponent(key)}`)}
            />
          ))}
        </Section>
      )}
    </PageShell>
  )
}
