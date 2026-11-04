import { describe, expect, it } from 'vitest'
import { BRAIN_CHOICES, detectRouterProvider, isBrainChoice } from './bot-brain'

describe('detectRouterProvider', () => {
  it('finds the provider whose catalog lists auto, fast and smart', () => {
    const router = detectRouterProvider([
      { slug: 'openai', models: ['gpt-5.3'] },
      { slug: 'litellm-alado', models: ['auto', 'fast', 'smart'] },
    ])
    expect(router?.slug).toBe('litellm-alado')
  })

  it('accepts catalog entries as objects with id', () => {
    const router = detectRouterProvider([
      { slug: 'router', models: [{ id: 'auto' }, { id: 'fast' }, { id: 'smart' }] },
    ])
    expect(router?.slug).toBe('router')
  })

  it('returns null when no provider carries the trio', () => {
    expect(detectRouterProvider([{ slug: 'x', models: ['auto', 'fast'] }])).toBeNull()
    expect(detectRouterProvider([])).toBeNull()
  })

  it('never matches a provider with only the model names', () => {
    // un proveedor normal que casualmente tenga "smart" no sirve
    expect(detectRouterProvider([{ slug: 'zai', models: ['smart', 'glm-5.3'] }])).toBeNull()
  })
})

describe('isBrainChoice', () => {
  it('accepts exactly the three choices', () => {
    for (const choice of BRAIN_CHOICES) expect(isBrainChoice(choice)).toBe(true)
    expect(isBrainChoice('turbo')).toBe(false)
    expect(isBrainChoice(undefined)).toBe(false)
    expect(isBrainChoice(42)).toBe(false)
  })
})
