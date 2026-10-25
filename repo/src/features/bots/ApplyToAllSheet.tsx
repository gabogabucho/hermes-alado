import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@nanostores/react'
import type { ProfileRow } from '../../lib/hermes/rpc-types'
import { Avatar } from '../../ui/Avatar'
import { Icon } from '../../ui/Icon'
import { Sheet } from '../../ui/Sheet'
import { botDisplayName } from '../bot-profile/store'
import { homeProfiles, loadHome } from '../home/store'
import { applySequential, type ApplyOutcome } from './apply-all'
import { useBotAppearance } from './appearance-store'
import './apply-all.css'

/**
 * Bottom-sheet confirmation for "Aplicar a todos mis bots": lists every other
 * bot with a checkbox (all pre-checked), marks the ones that already have the
 * value ("ya configurada"), then applies sequentially with live progress and
 * a final summary. The write itself is caller-provided (`applyOne`) — this
 * sheet never reads a value back from the server.
 */
export function ApplyToAllSheet({
  open,
  onClose,
  title,
  itemLabel,
  exclude,
  checkConfigured,
  applyOne,
}: {
  open: boolean
  onClose: () => void
  title: string
  itemLabel: string
  exclude: string
  checkConfigured?: (name: string) => Promise<boolean>
  applyOne: (name: string) => Promise<void>
}) {
  const rows = useStore(homeProfiles)
  const [phase, setPhase] = useState<'pick' | 'running' | 'done'>('pick')
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const [configured, setConfigured] = useState<Map<string, boolean>>(new Map())
  const [outcomes, setOutcomes] = useState<ApplyOutcome[]>([])
  const [current, setCurrent] = useState('')

  // Reset when the sheet opens: render-time adjustment (React's "storing
  // information from previous renders" pattern) instead of a cascading effect.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setPhase('pick')
      setOutcomes([])
      setCurrent('')
      setDeselected(new Set())
      setConfigured(new Map())
    }
  }

  const targets = useMemo(() => rows.filter(r => r.name !== exclude), [rows, exclude])
  const checkedNames = useMemo(() => targets.filter(t => !deselected.has(t.name)), [targets, deselected])

  useEffect(() => {
    if (open && homeProfiles.get().length === 0) void loadHome()
  }, [open])

  // Stamp the bots that already hold the value. `configured` is both the
  // result and the dedupe key, so prop-identity churn can't refetch a bot
  // that already answered; failures are retried on the next trigger.
  useEffect(() => {
    if (!open || phase !== 'pick' || !checkConfigured) return
    for (const t of targets) {
      if (configured.has(t.name)) continue
      void checkConfigured(t.name)
        .then(isSet => setConfigured(prev => new Map(prev).set(t.name, isSet)))
        .catch(() => undefined)
    }
  }, [open, phase, targets, checkConfigured, configured])

  const toggle = (name: string) => {
    setDeselected(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function run() {
    const names = checkedNames.map(t => t.name)
    if (names.length === 0) return
    setPhase('running')
    setOutcomes([])
    const summary = await applySequential(names, async name => {
      setCurrent(name)
      await applyOne(name)
    })
    setCurrent('')
    setOutcomes(summary.outcomes)
    setPhase('done')
  }

  const failed = outcomes.filter(o => !o.ok)
  const applied = outcomes.filter(o => o.ok).length

  return (
    <Sheet open={open} onClose={phase === 'running' ? () => undefined : onClose} title={title}>
      {phase !== 'done' && (
        <p className="faint" style={{ paddingBottom: 'var(--space-3)' }}>
          Se aplica {itemLabel} a cada bot seleccionado, de a uno.
        </p>
      )}

      {phase === 'done' ? (
        <div className="aat-summary">
          <p className="aat-summary-line">
            <Icon name="check" size={18} className="aat-ok" />
            Aplicado a {applied} bot{applied === 1 ? '' : 'es'}
          </p>
          {failed.length > 0 && (
            <div className="aat-failures">
              <p className="error-text">No se pudo aplicar a {failed.length}:</p>
              {failed.map(f => (
                <div key={f.name} className="aat-failure-row">
                  <span className="aat-failure-name">{botDisplayName(rows.find(r => r.name === f.name), f.name)}</span>
                  <span className="faint">{f.error}</span>
                </div>
              ))}
            </div>
          )}
          <div className="aat-actions">
            <button className="btn btn-primary btn-block" onClick={onClose}>
              Listo
            </button>
          </div>
        </div>
      ) : (
        <>
          {targets.length === 0 ? (
            <p className="muted">No hay otros bots.</p>
          ) : (
            <div className="aat-list">
              {targets.map(t => (
                <TargetRow
                  key={t.name}
                  row={rows.find(r => r.name === t.name)}
                  name={t.name}
                  on={!deselected.has(t.name)}
                  disabled={phase === 'running'}
                  phase={phase}
                  configured={configured.get(t.name) === true}
                  current={current === t.name}
                  outcome={outcomes.find(o => o.name === t.name)}
                  onToggle={() => toggle(t.name)}
                />
              ))}
            </div>
          )}

          <div className="aat-actions">
            <button
              className="btn btn-primary btn-block"
              disabled={phase === 'running' || checkedNames.length === 0}
              onClick={() => void run()}
            >
              {phase === 'running'
                ? 'Aplicando…'
                : `Aplicar a ${checkedNames.length} bot${checkedNames.length === 1 ? '' : 'es'}`}
            </button>
            <button className="btn btn-block" disabled={phase === 'running'} onClick={onClose}>
              Cancelar
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function TargetRow({
  row,
  name,
  on,
  disabled,
  phase,
  configured,
  current,
  outcome,
  onToggle,
}: {
  row: ProfileRow | undefined
  name: string
  on: boolean
  disabled: boolean
  phase: 'pick' | 'running' | 'done'
  configured: boolean
  current: boolean
  outcome: ApplyOutcome | undefined
  onToggle: () => void
}) {
  const appearance = useBotAppearance(name)
  return (
    <button type="button" className="aat-row" disabled={disabled} onClick={onToggle}>
      <Avatar name={name} size="sm" appearance={appearance} />
      <span className="aat-meta">
        <span className="aat-name">{botDisplayName(row, name)}</span>
        {phase === 'pick' && configured && <span className="aat-configured">ya configurada</span>}
        {phase === 'running' && current && <span className="aat-configured">aplicando…</span>}
        {phase === 'running' && outcome?.ok && (
          <span className="aat-configured aat-ok">aplicado</span>
        )}
        {phase === 'running' && outcome && !outcome.ok && (
          <span className="aat-configured aat-fail">falló</span>
        )}
      </span>
      <span className={`aat-checkbox${on ? ' aat-checkbox-on' : ''}`} aria-hidden="true">
        {on && <Icon name="check" size={14} />}
      </span>
    </button>
  )
}
