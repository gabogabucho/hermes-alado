import { describe, expect, it } from 'vitest'
import type { EnvVarInfo } from './credentials'
import { vaultLabel } from './vault-labels'

function info(over: Partial<EnvVarInfo> = {}): EnvVarInfo {
  return {
    advanced: false,
    category: 'tool',
    description: '',
    is_password: true,
    is_set: false,
    redacted_value: null,
    tools: [],
    url: null,
    ...over,
  }
}

describe('vaultLabel', () => {
  it('prefers the exact key map', () => {
    expect(vaultLabel('GITHUB_TOKEN', info({ description: 'whatever' }))).toBe('GitHub')
  })

  it('trims credential suffixes off provider labels', () => {
    expect(vaultLabel('X_KEY', info({ provider_label: 'Browser Use API key' }))).toBe('Browser Use')
    expect(vaultLabel('X_KEY', info({ provider_label: 'Some API token' }))).toBe('Some')
    expect(vaultLabel('X_KEY', info({ provider_label: 'Acme subscription token' }))).toBe('Acme')
  })

  it('keeps clean provider labels untouched', () => {
    expect(vaultLabel('X_KEY', info({ provider_label: 'OpenRouter' }))).toBe('OpenRouter')
  })

  it('trims suffixes from the description first clause', () => {
    expect(vaultLabel('X_KEY', info({ description: 'Linear API key' }))).toBe('Linear')
    expect(vaultLabel('X_KEY', info({ description: 'Some key' }))).toBe('Some')
  })

  it('falls back to the prettified key', () => {
    expect(vaultLabel('MY_SERVICE_TOKEN', info({}))).toBe('My Service Token')
  })
})
