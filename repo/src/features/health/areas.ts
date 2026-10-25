import { normalizeSectionTitle, type DoctorCheck, type DoctorResult } from '../../lib/hermes/doctor-output'

/** Product-facing area labels for the doctor's own section titles. */
const SECTION_AREA: Record<string, string> = {
  'Auth Providers': 'Modelo y credenciales',
  'API Connectivity': 'Modelo y credenciales',
  'Configuration Files': 'Modelo y credenciales',
  'Python Environment': 'Herramientas',
  'Required Packages': 'Herramientas',
  'External Tools': 'Herramientas',
  'Tool Availability': 'Herramientas',
  'Skills Hub': 'Herramientas',
  'MCP Server Security': 'Seguridad',
  'Security Advisories': 'Seguridad',
  'SSL / CA Certificates': 'Seguridad',
  'NeMo Relay Plugins': 'Seguridad',
  'Directory Structure': 'Datos y estado',
  'Memory Provider': 'Datos y estado',
  'Session Reset': 'Datos y estado',
  'xAI Model Retirement': 'Datos y estado',
}

const AREA_ORDER = [
  'Modelo y credenciales',
  'Herramientas',
  'Navegador',
  'Computadora',
  'Seguridad',
  'Datos y estado',
]

const BROWSER_RE = /chromium|agent-browser|lightpanda|browser|playwright/i
const COMPUTER_RE = /display|x11|wayland|computer use|computer_use|screen/i

function areaFor(check: DoctorCheck, sectionTitle: string): string {
  if (BROWSER_RE.test(check.text)) return 'Navegador'
  if (COMPUTER_RE.test(check.text)) return 'Computadora'
  return SECTION_AREA[normalizeSectionTitle(sectionTitle)] ?? 'Herramientas'
}

export interface AreaGroup {
  label: string
  checks: DoctorCheck[]
}

/**
 * Fold the doctor's raw sections into the product's areas (the brief's
 * "Modelo/credenciales, Herramientas, Navegador, Computadora…"). Browser and
 * computer checks are pulled out of their hosting section by keyword.
 */
export function groupDoctorAreas(result: DoctorResult): AreaGroup[] {
  const byLabel = new Map<string, DoctorCheck[]>()
  for (const section of result.sections) {
    for (const check of section.checks) {
      const label = areaFor(check, section.title)
      const list = byLabel.get(label) ?? []
      list.push(check)
      byLabel.set(label, list)
    }
  }
  const order = [...AREA_ORDER, ...[...byLabel.keys()].filter(k => !AREA_ORDER.includes(k))]
  return order
    .filter(label => byLabel.has(label))
    .map(label => ({ label, checks: byLabel.get(label) ?? [] }))
}
