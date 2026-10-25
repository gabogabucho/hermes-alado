import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { ApplyToAllSheet } from '../bots/ApplyToAllSheet'
import { BotScopedScreen } from '../bot-profile/BotScopedScreen'
import { getConfig, readApprovalMode, setApprovalMode, type ApprovalMode } from '../../lib/hermes/agent-control'
import { Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import { approvalError, approvalLoading, approvalMode, approvalSaving, loadApproval, saveApproval } from './store'
import './control.css'

const APPROVAL_OPTIONS: { mode: ApprovalMode; label: string }[] = [
  { mode: 'manual', label: 'Siempre' },
  { mode: 'smart', label: 'Inteligente' },
  { mode: 'off', label: 'Nunca' },
]

const MODE_HINTS: Record<ApprovalMode, string> = {
  manual: 'Siempre pide aprobación antes de una acción riesgosa.',
  smart: 'Modo inteligente: pide en las riesgosas y resuelve solo las de bajo riesgo.',
  off: 'No pide aprobación: el bot ejecuta acciones riesgosas por su cuenta.',
}

/**
 * Aprobaciones (per bot): the approvals.mode segmented control for THIS bot
 * (`/bots/:profile/approvals`), with "Aplicar este modo a todos mis bots".
 */
export function ApprovalsPage() {
  const { profile = 'default' } = useParams()
  const mode = useStore(approvalMode)
  const busy = useStore(approvalLoading)
  const fail = useStore(approvalError)
  const pending = useStore(approvalSaving)
  const [applyOpen, setApplyOpen] = useState(false)

  useEffect(() => {
    void loadApproval(profile)
  }, [profile])

  return (
    <BotScopedScreen profile={profile} title="Aprobaciones">
      <Section label="Acciones riesgosas">
        {busy ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <Skeleton height={72} />
          </div>
        ) : fail ? (
          <div className="empty">
            <p className="error-text">{fail}</p>
            <button className="btn" onClick={() => void loadApproval(profile)}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className="control-auto">
            <div className="control-row-title">Pedir aprobación para acciones riesgosas</div>
            <div className="faint">shell, MCP, computadora</div>
            <div className="control-hint">{mode ? MODE_HINTS[mode] : ''}</div>
            <div className="segmented" role="radiogroup" aria-label="Modo de aprobación">
              {APPROVAL_OPTIONS.map(opt => (
                <button
                  key={opt.mode}
                  type="button"
                  role="radio"
                  aria-checked={mode === opt.mode}
                  className={mode === opt.mode ? 'segmented-item active' : 'segmented-item'}
                  disabled={pending}
                  onClick={() => void saveApproval(profile, opt.mode)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {pending && <span className="faint">Guardando…</span>}
            <button className="btn btn-block" onClick={() => setApplyOpen(true)}>
              Aplicar este modo a todos mis bots
            </button>
          </div>
        )}
      </Section>

      <ApplyToAllSheet
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Aplicar este modo a todos mis bots"
        itemLabel="el modo de aprobación"
        exclude={profile}
        checkConfigured={async name => readApprovalMode(await getConfig(name)) === mode}
        applyOne={async name => {
          await setApprovalMode(mode ?? 'smart', name)
        }}
      />
    </BotScopedScreen>
  )
}
