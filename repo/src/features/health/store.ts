import { atom, computed } from 'nanostores'
import {
  getComputerUseStatus,
  getConfig,
  getToolsets,
  toggleToolset,
  type ComputerUseStatus,
  type ToolsetRow,
} from '../../lib/hermes/agent-control'
import { getEnvVars, type EnvVarInfo } from '../../lib/hermes/credentials'
import { parseDoctorOutput, type DoctorResult } from '../../lib/hermes/doctor-output'
import {
  getActionStatus,
  runToolsetPostSetup,
  spawnDoctor,
  type ActionStatus,
} from '../../lib/hermes/health'
import {
  doctorRemediation,
  probeRemediations,
  type ModelCredentialProbe,
  type Remediation,
} from '../../lib/hermes/remediation'
import type { DotTone } from '../../ui/StatusDot'
import { activeProfile, loadActiveProfile } from '../home/store'

// --- Instant probes (no doctor): computer-use status, browser/computer_use
// toolsets, and the active model's credential presence. Loaded on open.

export const probeLoading = atom<boolean>(true)
export const probeError = atom<string>('')
export const computerUse = atom<ComputerUseStatus | null>(null)
export const toolsets = atom<ToolsetRow[]>([])
export const modelCredential = atom<ModelCredentialProbe | null>(null)
export const envVars = atom<Record<string, EnvVarInfo> | null>(null)

// --- Doctor: a background `hermes doctor` action, polled until it exits.

export const doctorPhase = atom<'idle' | 'running' | 'done' | 'error'>('idle')
export const doctorResult = atom<DoctorResult | null>(null)
export const doctorRaw = atom<string>('')
export const doctorError = atom<string>('')

// --- Remediation actions (post-setup / enable-toolset).

export const repairBusy = atom<string>('')
export const repairError = atom<string>('')
export const repairProgress = atom<string>('')

function healthProfile(): string {
  return activeProfile.get() || 'default'
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * The active model's credential, resolved from `GET /api/config` (model.provider)
 * + `GET /api/env` (the var whose `provider` matches, preferring the primary one).
 * A provider with no vault key (Nous Portal login) yields `isSet: null`.
 */
async function resolveModelCredential(
  provider: string,
  env: Record<string, EnvVarInfo>,
): Promise<ModelCredentialProbe | null> {
  const entries = Object.entries(env)
  const prov = provider.toLowerCase()
  let target: [string, EnvVarInfo] | undefined
  if (prov && prov !== 'auto') {
    target =
      entries.find(([, info]) => info.provider?.toLowerCase() === prov && info.provider_primary) ??
      entries.find(([, info]) => info.provider?.toLowerCase() === prov)
  } else {
    target = entries.find(([, info]) => info.provider_primary)
  }

  if (target) {
    const [key, info] = target
    return {
      provider: provider || info.provider || key,
      envKey: key,
      isSet: info.is_set,
      label: info.provider_label || info.provider || key,
    }
  }

  return { provider: provider || 'desconocido', envKey: null, isSet: null, label: provider || 'desconocido' }
}

export async function loadProbes(): Promise<void> {
  probeLoading.set(true)
  probeError.set('')
  try {
    await loadActiveProfile()
    const profile = healthProfile()
    const [cu, ts, env] = await Promise.all([
      getComputerUseStatus(profile),
      getToolsets(profile),
      getEnvVars(profile),
    ])
    let provider = ''
    try {
      const config = await getConfig(profile)
      const model = config.model as { provider?: unknown } | undefined
      if (typeof model?.provider === 'string') provider = model.provider
    } catch {
      provider = ''
    }
    computerUse.set(cu)
    toolsets.set(ts.filter(row => row.name === 'browser' || row.name === 'computer_use'))
    envVars.set(env)
    modelCredential.set(await resolveModelCredential(provider, env))
  } catch (e) {
    probeError.set(e instanceof Error ? e.message : 'No se pudo leer el estado del sistema')
  } finally {
    probeLoading.set(false)
  }
}

// --- Summary dot for the Control del agente row (worst of the instant probes).

const TONE_RANK: Record<DotTone, number> = { neutral: 0, ok: 1, warn: 2, danger: 3 }

function worst(a: DotTone, b: DotTone): DotTone {
  return TONE_RANK[a] >= TONE_RANK[b] ? a : b
}

export function probeSummaryTone(): DotTone {
  const cu = computerUse.get()
  const ts = toolsets.get()
  const mc = modelCredential.get()

  let tone: DotTone = 'neutral'
  if (cu != null) tone = worst(tone, cu.ready === true ? 'ok' : 'warn')
  const browser = ts.find(row => row.name === 'browser')
  if (browser) tone = worst(tone, browser.enabled ? 'ok' : 'warn')
  if (mc) tone = worst(tone, mc.isSet === true ? 'ok' : mc.isSet === false ? 'warn' : 'neutral')
  return tone
}

/** Reactive summary dot for the Control del agente row. */
export const probeSummary = computed([computerUse, toolsets, modelCredential], probeSummaryTone)

export function probeSummaryLabel(tone: DotTone): string {
  if (tone === 'neutral') return 'Sin información'
  if (tone === 'ok') return 'Todo en orden'
  return 'Requiere atención'
}

// --- Doctor run.

/** Poll a background action every 1.2s until it exits (desktop convention). */
async function pollAction(
  name: string,
  lines: number,
  onTick?: (status: ActionStatus) => void,
): Promise<ActionStatus> {
  const POLL_MS = 1200
  const LIMIT = 240
  for (let i = 0; i < LIMIT; i++) {
    await sleep(POLL_MS)
    let status: ActionStatus
    try {
      status = await getActionStatus(name, lines)
    } catch {
      continue
    }
    onTick?.(status)
    if (!status.running) return status
  }
  throw new Error('La acción tardó demasiado en terminar.')
}

export async function runDoctor(): Promise<void> {
  doctorPhase.set('running')
  doctorError.set('')
  doctorResult.set(null)
  doctorRaw.set('')
  try {
    const started = await spawnDoctor(healthProfile())
    if (!started.ok) throw new Error('El servidor no pudo iniciar el diagnóstico.')
    const status = await pollAction('doctor', 2000)
    doctorRaw.set(status.lines.join('\n'))
    doctorResult.set(parseDoctorOutput(status.lines))
    doctorPhase.set('done')
  } catch (e) {
    doctorError.set(e instanceof Error ? e.message : 'No se pudo ejecutar el diagnóstico.')
    doctorPhase.set('error')
  }
}

// --- Remediation collection + execution.

/** Every known fix for the current doctor findings + instant probes, deduped by id. */
export function collectRemediations(): Remediation[] {
  const out: Remediation[] = []
  const result = doctorResult.get()
  if (result) {
    for (const section of result.sections) {
      for (const check of section.checks) {
        const r = doctorRemediation(check)
        if (r) out.push(r)
      }
    }
  }
  out.push(
    ...probeRemediations({
      computerUse: computerUse.get(),
      toolsets: toolsets.get(),
      modelCredential: modelCredential.get(),
    }),
  )
  const seen = new Set<string>()
  return out.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
}

export async function runRepair(remediation: Remediation): Promise<void> {
  if (remediation.kind !== 'post-setup' && remediation.kind !== 'enable-toolset') return
  repairBusy.set(remediation.id)
  repairError.set('')
  repairProgress.set('')
  try {
    if (remediation.kind === 'post-setup') {
      const started = await runToolsetPostSetup(remediation.toolset, remediation.key, healthProfile())
      if (!started.ok) throw new Error('No se pudo iniciar la reparación.')
      await pollAction('tools-post-setup', 300, status => {
        const last = status.lines[status.lines.length - 1]
        if (last) repairProgress.set(last)
      })
    } else {
      await toggleToolset(remediation.toolset, true, healthProfile())
    }
    await loadProbes()
    if (doctorResult.get()) await runDoctor()
  } catch (e) {
    repairError.set(e instanceof Error ? e.message : 'No se pudo reparar.')
  } finally {
    repairBusy.set('')
    repairProgress.set('')
  }
}
