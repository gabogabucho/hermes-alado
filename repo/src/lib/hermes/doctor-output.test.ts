import { describe, expect, it } from 'vitest'
import {
  allChecks,
  normalizeSectionTitle,
  parseDoctorOutput,
  type DoctorResult,
} from './doctor-output'

// Fixtures mirror the exact line grammar printed by hermes_cli/doctor.py and
// hermes_cli/doctor_report.py (pinned bf0203a). When spawned as a dashboard
// action, stdout is a file so `color()` is a no-op: no ANSI, but UTF-8 glyphs.

describe('normalizeSectionTitle', () => {
  it('strips the parenthetical suffix', () => {
    expect(normalizeSectionTitle('Session Reset (timers removed Sep 7, 2026)')).toBe('Session Reset')
    expect(normalizeSectionTitle('xAI Model Retirement (May 15, 2026)')).toBe('xAI Model Retirement')
  })

  it('keeps plain titles', () => {
    expect(normalizeSectionTitle('External Tools')).toBe('External Tools')
  })
})

describe('parseDoctorOutput', () => {
  it('parses a clean passing run', () => {
    const lines = [
      '',
      '┌─────────────────────────────────────────────────────────┐',
      '│                 🩺 Hermes Doctor                        │',
      '└─────────────────────────────────────────────────────────┘',
      '',
      '◆ Python Environment',
      '  ✓ Python 3.12',
      '  ✓ pip',
      '',
      '◆ Auth Providers',
      '  ✓ Nous Portal auth (logged in)',
      '  ⚠ OpenAI Codex auth (not logged in)',
      '    → codex CLI not installed (optional — only required to import tokens from an existing Codex CLI login)',
      '',
      '─'.repeat(60),
      '  All checks passed! 🎉',
      '',
    ]

    const result = parseDoctorOutput(lines)

    expect(result.sections.map(s => s.title)).toEqual(['Python Environment', 'Auth Providers'])
    expect(result.issues).toEqual([])
    expect(result.passed).toBe(true)

    const auth = result.sections[1]
    expect(auth.checks[0]).toEqual({ status: 'ok', text: 'Nous Portal auth (logged in)', detail: '' })
    const codex = auth.checks[1]
    expect(codex.status).toBe('warn')
    expect(codex.detail).toContain('codex CLI not installed')
  })

  it('captures warn/fail rows, info lines, and the numbered issue summary', () => {
    const lines = [
      '',
      '┌─────────────────────────────────────────────────────────┐',
      '│                 🩺 Hermes Doctor                        │',
      '└─────────────────────────────────────────────────────────┘',
      '',
      '◆ External Tools',
      '  ✓ Node.js',
      '  ⚠ agent-browser not installed (run: hermes pm install agent-browser)',
      '  ⚠ Playwright Chromium not installed (browser_* tools will be hidden from the agent)',
      '    → Install with: hermes pm install chromium',
      '',
      '◆ Tool Availability',
      '  ✗ Chromium executable failed (exit 127)',
      '  ✗ libasound.so.2: cannot open shared object file',
      '',
      '─'.repeat(60),
      '  Found 2 issue(s) to address:',
      '',
      '  1. Install the browser engine.',
      '  2. Install libasound2t64.',
      '  Tip: run \'hermes doctor --fix\' to auto-fix what\'s possible.',
      '',
    ]

    const result = parseDoctorOutput(lines)

    expect(result.issues).toEqual(['Install the browser engine.', 'Install libasound2t64.'])
    expect(result.passed).toBe(false)
    expect(result.fixed).toBe(0)

    const tools = result.sections[0]
    const chromium = tools.checks.find(c => c.text.includes('Playwright Chromium'))
    expect(chromium).toBeDefined()
    expect(chromium?.status).toBe('warn')
    expect(chromium?.detail).toContain('hermes pm install chromium')

    const failChecks = allChecks(result).filter(c => c.status === 'fail')
    expect(failChecks.map(c => c.text)).toEqual([
      'Chromium executable failed (exit 127)',
      'libasound.so.2: cannot open shared object file',
    ])
  })

  it('tolerates the connectivity status line, a stray \\r, and ANSI codes', () => {
    const lines = [
      '\u001b[36m◆ API Connectivity\u001b[0m',
      '  Running 4 connectivity checks in parallel…\r' + ' '.repeat(70) + '\r  ✓ OpenRouter (200 OK)',
      '  ✗ DeepSeek (timeout)',
      '',
      '─'.repeat(60),
      '  Found 1 issue(s) to address:',
      '',
      '  1. DeepSeek unreachable.',
      '',
    ]

    const result = parseDoctorOutput(lines)

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].title).toBe('API Connectivity')
    expect(result.sections[0].checks).toHaveLength(2)
    expect(result.sections[0].checks[0].status).toBe('ok')
    expect(result.sections[0].checks[1]).toEqual({ status: 'fail', text: 'DeepSeek (timeout)', detail: '' })
    expect(result.issues).toEqual(['DeepSeek unreachable.'])
  })

  it('returns an empty result for a bare log', () => {
    const result: DoctorResult = parseDoctorOutput([])
    expect(result.sections).toEqual([])
    expect(result.issues).toEqual([])
    expect(result.passed).toBe(true)
  })
})
