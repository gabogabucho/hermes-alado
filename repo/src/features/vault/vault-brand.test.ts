import { describe, expect, it } from 'vitest'
import type { EnvVarInfo } from '../../lib/hermes/credentials'
import { vaultBrandName } from './vault-brand'

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

describe('vaultBrandName', () => {
  it('claims a brand from the key prefix', () => {
    expect(vaultBrandName('GITHUB_TOKEN', info({}))).toBe('GITHUB')
  })

  it('ignores description URLs that do not name the variable', () => {
    expect(
      vaultBrandName('CAMOFOX_URL', info({ url: 'https://github.com/jo-inc/camofox-browser' })),
    ).toBeNull()
  })

  it('claims a brand from the catalog provider slug', () => {
    expect(vaultBrandName('MY_KEY', info({ provider: 'openrouter' }))).toBe('openrouter')
  })

  it('returns null when nothing matches', () => {
    expect(vaultBrandName('CAMOFOX_URL', info({ provider: 'camofox' }))).toBeNull()
  })
})
