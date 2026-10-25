import { describe, expect, it } from 'vitest'
import {
  buildImportPlan,
  existingByName,
  profileSlug,
  resolveBotProfile,
  uniqueSlug,
} from './plan'

describe('profileSlug', () => {
  it('lowercases and replaces separators', () => {
    expect(profileSlug('Mi Bot')).toBe('mi-bot')
    expect(profileSlug('Pancho Bot 2')).toBe('pancho-bot-2')
  })

  it('strips accents', () => {
    expect(profileSlug('Panchó')).toBe('pancho')
  })

  it('falls back when nothing usable remains', () => {
    expect(profileSlug('•••')).toBe('bot')
  })

  it('caps at 64 characters', () => {
    expect(profileSlug('a'.repeat(80))).toHaveLength(64)
  })
})

describe('uniqueSlug', () => {
  it('appends -2, -3 until free', () => {
    const taken = new Set(['pancho', 'pancho-2'])
    expect(uniqueSlug('pancho', taken)).toBe('pancho-3')
  })
})

describe('buildImportPlan', () => {
  const existing = [
    { name: 'pancho', displayName: 'Pancho' },
    { name: 'default', displayName: 'Hermes' },
  ]

  it('flags conflicts and defaults to using the existing profile', () => {
    const plan = buildImportPlan(
      { bots: [{ name: 'Pancho', soul: 'x' }], groups: [], routines: [] },
      existing,
    )
    expect(plan.bots).toHaveLength(1)
    expect(plan.bots[0]).toEqual({
      originalName: 'Pancho',
      slug: null,
      useExisting: 'pancho',
      soul: 'x',
      conflict: true,
    })
  })

  it('slugifies new bots and reserves their names', () => {
    const plan = buildImportPlan(
      { bots: [{ name: 'Lola Chef', soul: '' }], groups: [], routines: [] },
      existing,
    )
    expect(plan.bots[0].slug).toBe('lola-chef')
  })

  it('converts routine schedules and resolves bot names through the map', () => {
    const plan = buildImportPlan(
      {
        bots: [{ name: 'Lola', soul: '' }],
        groups: [{ name: 'Casa', members: ['Pancho', 'Lola'] }],
        routines: [
          { name: 'Resumen', bot: 'Pancho', when: 'todos los días a las 7', prompt: 'Resumí' },
        ],
      },
      existing,
    )
    expect(plan.routines[0].scheduleText).toBe('0 7 * * *')
    expect(resolveBotProfile('pancho', plan)).toBe('pancho')
    expect(resolveBotProfile('Lola', plan)).toBe('lola')
    expect(resolveBotProfile('Nadie', plan)).toBe('nadie')
  })

  it('matches existing profiles by display name', () => {
    expect(existingByName('pancho', existing)?.name).toBe('pancho')
    expect(existingByName('desconocido', existing)).toBeNull()
  })
})
