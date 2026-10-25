// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
//
// Parser for the text output of `hermes doctor` as captured in a dashboard
// action log. The exact line grammar lives in hermes_cli/doctor_report.py and
// hermes_cli/doctor.py (pinned bf0203a):
//
//   banner   ┌─────────────────…────────────┐
//            │       🩺 Hermes Doctor       │
//            └─────────────────…────────────┘
//   section  ◆ Title
//   ok       `  ✓ text (detail)`
//   warn     `  ⚠ text (detail)`
//   fail     `  ✗ text (detail)`
//   info     `    → text`
//   summary  `─` × 60, then `  Found N issue(s) to address:` / `  All checks passed! 🎉`
//            numbered issues `  i. issue`
//
// When spawned as a background action, stdout is a file (not a TTY), so
// `color()` is a no-op and no ANSI escapes are present — but a `\r` may survive
// (connectivity status line) and the glyphs are non-ASCII UTF-8.

export type CheckStatus = 'ok' | 'warn' | 'fail'

export interface DoctorCheck {
  status: CheckStatus
  /** The human sentence the doctor printed after the glyph. */
  text: string
  /** Any `→` info lines that followed, joined with newlines (empty when none). */
  detail: string
}

export interface DoctorSection {
  title: string
  checks: DoctorCheck[]
}

export interface DoctorResult {
  sections: DoctorSection[]
  /** Manual/auto-fix issues listed in the summary block, in order. */
  issues: string[]
  /** `Fixed N issue(s)` when the run auto-fixed something (dashboard runs never --fix). */
  fixed: number
  /** True when the summary says "All checks passed!". */
  passed: boolean
}

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const GLYPH_OK = '✓'
const GLYPH_WARN = '⚠'
const GLYPH_FAIL = '✗'
const GLYPH_INFO = '→'

const STATUS_BY_GLYPH: Record<string, CheckStatus> = {
  [GLYPH_OK]: 'ok',
  [GLYPH_WARN]: 'warn',
  [GLYPH_FAIL]: 'fail',
}

function clean(line: string): string {
  // A `\r` returns the terminal cursor to column 0, so only the text after the
  // last one survives (the connectivity status line is erased this way).
  const withoutAnsi = line.replace(ANSI_RE, '')
  const segments = withoutAnsi.split('\r')
  return (segments[segments.length - 1] ?? '').trimEnd()
}

function isBanner(line: string): boolean {
  return line.startsWith('┌') || line.startsWith('│') || line.startsWith('└')
}

function isSummarySeparator(line: string): boolean {
  return /^─{10,}$/.test(line) || /^═{10,}$/.test(line)
}

/** `Session Reset (timers removed Sep 7, 2026)` -> `Session Reset`. */
export function normalizeSectionTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/**
 * Parse a doctor action-log tail into grouped sections plus a summary.
 * Robust to banners, blank lines, the transient connectivity status line, and
 * (for safety) stray ANSI codes.
 */
export function parseDoctorOutput(lines: string[]): DoctorResult {
  const sections: DoctorSection[] = []
  const issues: string[] = []
  let current: DoctorSection | null = null
  let fixed = 0
  let passed = false
  let inSummary = false

  function currentCheck(): DoctorCheck | null {
    if (!current || current.checks.length === 0) return null
    return current.checks[current.checks.length - 1]
  }

  for (const raw of lines) {
    const line = clean(raw)
    if (line === '') continue

    if (isSummarySeparator(line)) {
      inSummary = true
      continue
    }

    if (inSummary) {
      if (line.startsWith('◆')) inSummary = false
      else if (/^  \d+\. /.test(line)) {
        issues.push(line.replace(/^  \d+\. /, ''))
        continue
      } else if (line.includes('All checks passed')) {
        passed = true
        continue
      } else if (/Fixed \d+ issue/.test(line)) {
        const m = line.match(/Fixed (\d+) issue/)
        fixed = m ? Number(m[1]) : fixed
        continue
      }
      // "Found N issue(s) to address:", the Tip line, etc. — not checks.
      continue
    }

    if (isBanner(line)) continue

    if (line.startsWith('◆ ')) {
      current = { title: normalizeSectionTitle(line.slice(2)), checks: [] }
      sections.push(current)
      continue
    }

    const glyph = line[2]
    const afterGlyph = line[3]
    if (line[0] === ' ' && line[1] === ' ' && afterGlyph === ' ' && STATUS_BY_GLYPH[glyph]) {
      if (current) {
        current.checks.push({ status: STATUS_BY_GLYPH[glyph], text: line.slice(4), detail: '' })
      }
      continue
    }

    if (line.startsWith(`    ${GLYPH_INFO} `)) {
      const prev = currentCheck()
      if (prev) prev.detail = prev.detail ? `${prev.detail}\n${line.slice(6)}` : line.slice(6)
      continue
    }

    // Transient connectivity status line (`  Running N connectivity checks in parallel…`).
    if (/^  Running \d+ connectivity checks/.test(line)) continue
  }

  return { sections, issues, fixed, passed: passed || issues.length === 0 }
}

/** Flat list of every check across sections, in output order. */
export function allChecks(result: DoctorResult): DoctorCheck[] {
  return result.sections.flatMap(s => s.checks)
}
