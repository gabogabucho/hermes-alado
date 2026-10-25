import { describe, expect, it, vi } from 'vitest'
import { applySequential, type ApplySummary } from './apply-all'

describe('applySequential', () => {
  it('runs every profile in order', async () => {
    const order: string[] = []
    const summary = await applySequential(['uno', 'dos', 'tres'], async name => {
      order.push(name)
    })
    expect(order).toEqual(['uno', 'dos', 'tres'])
    expect(summary.applied).toBe(3)
    expect(summary.failed).toBe(0)
  })

  it('is sequential: the next write starts only after the previous resolves', async () => {
    const started: string[] = []
    const resolvers = new Map<string, () => void>()
    const summaryPromise = applySequential(['a', 'b'], async name => {
      started.push(name)
      await new Promise<void>(resolve => resolvers.set(name, resolve))
    })
    await vi.waitFor(() => expect(started).toEqual(['a']))
    expect(started).not.toContain('b')
    resolvers.get('a')?.()
    await vi.waitFor(() => expect(started).toEqual(['a', 'b']))
    resolvers.get('b')?.()
    await summaryPromise
  })

  it('keeps going after a failure and reports it', async () => {
    const calls: string[] = []
    const summary: ApplySummary = await applySequential(['x', 'y', 'z'], async name => {
      calls.push(name)
      if (name === 'y') throw new Error('boom')
    })
    expect(calls).toEqual(['x', 'y', 'z'])
    expect(summary.applied).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.outcomes.find(o => o.name === 'y')).toMatchObject({
      ok: false,
      error: 'boom',
    })
  })

  it('returns an empty summary for no profiles', async () => {
    const summary = await applySequential([], async () => undefined)
    expect(summary).toEqual({ applied: 0, failed: 0, outcomes: [] })
  })
})
