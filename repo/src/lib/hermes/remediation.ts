// Remediation mapping for the "Salud del sistema" screen (phase 4b). Pure
// functions — no React, no network — so the map is unit-testable and the store
// only runs the action the returned `Remediation` describes.
import type { ComputerUseStatus, ToolsetRow } from './agent-control'
import type { DoctorCheck } from './doctor-output'

export type ToolsetName = 'browser' | 'computer_use'

interface RemediationBase {
  id: string
  title: string
  /** The human sentence describing what is wrong. */
  finding: string
}

/** Fixable without root by reinstalling a toolset's backend (background action). */
export interface PostSetupRemediation extends RemediationBase {
  kind: 'post-setup'
  toolset: ToolsetName
  key: string
}

/** Fixable without root by enabling a disabled toolset. */
export interface EnableToolsetRemediation extends RemediationBase {
  kind: 'enable-toolset'
  toolset: ToolsetName
}

/** Fixable without root by filling in a Bóveda key. */
export interface VaultRemediation extends RemediationBase {
  kind: 'vault'
  envKey: string
}

/** Needs access to the server: show the exact command(s) to run. */
export interface RootRemediation extends RemediationBase {
  kind: 'root'
  /** A specific one-liner when known (e.g. `sudo apt-get install -y libasound2t64`); else null. */
  specific: string | null
}

export type Remediation =
  | PostSetupRemediation
  | EnableToolsetRemediation
  | VaultRemediation
  | RootRemediation

export interface ModelCredentialProbe {
  provider: string
  envKey: string | null
  isSet: boolean | null
  label: string
}

function finding(check: DoctorCheck): string {
  return check.detail ? `${check.text} — ${check.detail.replace(/\n/g, ' ')}` : check.text
}

/**
 * Map one doctor check (warn/fail only) to a known fix. Unknown findings map to
 * null — the raw row still renders with its dot, just without an action.
 */
export function doctorRemediation(check: DoctorCheck): Remediation | null {
  if (check.status === 'ok') return null
  const text = `${check.text} ${check.detail}`.toLowerCase()

  // The phase-4b incident: bundled Chromium exits 127 on a missing audio lib.
  if (text.includes('libasound')) {
    return {
      kind: 'root',
      id: 'root:libasound',
      title: 'Falta la librería de audio del sistema',
      finding: finding(check),
      specific: 'sudo apt-get install -y libasound2t64',
    }
  }

  // Any bundled-browser engine missing → reinstall through the toolset post-setup.
  if (/chromium|agent-browser|lightpanda|browser engine|playwright/.test(text)) {
    return {
      kind: 'post-setup',
      id: 'post-setup:browser:agent_browser',
      title: 'Reinstalar el navegador',
      finding: finding(check),
      toolset: 'browser',
      key: 'agent_browser',
    }
  }

  // The same class as the incident: another missing shared object.
  if (/cannot open shared object|\.so(\.\d+)?\b/.test(text)) {
    return {
      kind: 'root',
      id: 'root:shared-object',
      title: 'Falta una librería del sistema',
      finding: finding(check),
      specific: null,
    }
  }

  if (/no display|\bdisplay\b|x11|wayland/.test(text)) {
    return {
      kind: 'root',
      id: 'root:display',
      title: 'Sin servidor de pantalla',
      finding: finding(check),
      specific: null,
    }
  }

  return null
}

/**
 * Remediations derived from the instant probes (computer-use status, toolsets,
 * the active model's credential). These surface without running doctor.
 */
export function probeRemediations(input: {
  computerUse: ComputerUseStatus | null
  toolsets: ToolsetRow[]
  modelCredential: ModelCredentialProbe | null
}): Remediation[] {
  const out: Remediation[] = []
  const { computerUse, toolsets, modelCredential } = input

  const browser = toolsets.find(t => t.name === 'browser')
  const computerUseRow = toolsets.find(t => t.name === 'computer_use')

  if (browser && !browser.enabled) {
    out.push({
      kind: 'enable-toolset',
      id: 'enable:browser',
      title: 'Activar el navegador',
      finding: 'El navegador está desactivado.',
      toolset: 'browser',
    })
  }

  if (computerUseRow && !computerUseRow.enabled) {
    out.push({
      kind: 'enable-toolset',
      id: 'enable:computer_use',
      title: 'Activar el control del computador',
      finding: 'El control del computador está desactivado.',
      toolset: 'computer_use',
    })
  }

  if (computerUse) {
    if (computerUse.platform_supported && computerUse.installed === false) {
      out.push({
        kind: 'post-setup',
        id: 'post-setup:computer_use:cua_driver',
        title: 'Instalar el driver del computador',
        finding: 'El driver de computer use no está instalado.',
        toolset: 'computer_use',
        key: 'cua_driver',
      })
    } else if (computerUse.ready === false) {
      out.push({
        kind: 'root',
        id: 'root:computer-use',
        title: 'El computador no está listo',
        finding:
          computerUse.error ??
          'Computer use no está listo (revisá permisos o el servidor de pantalla).',
        specific: null,
      })
    }
  }

  if (modelCredential && modelCredential.isSet === false && modelCredential.envKey) {
    out.push({
      kind: 'vault',
      id: `vault:${modelCredential.envKey}`,
      title: `Configurar la clave de ${modelCredential.label}`,
      finding: `El proveedor activo (${modelCredential.provider}) no tiene su clave en la Bóveda.`,
      envKey: modelCredential.envKey,
    })
  }

  return out
}
