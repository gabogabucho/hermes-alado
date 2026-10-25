import { describe, expect, it } from 'vitest'
import { displayWsUrl, leaseHeldBy, parseGeometry, viewerHash } from './display-core'

describe('parseGeometry', () => {
  it('parses WxH', () => {
    expect(parseGeometry('1440x900')).toEqual({ width: 1440, height: 900 })
  })

  it('falls back to the runtime default on garbage', () => {
    expect(parseGeometry('full-hd')).toEqual({ width: 1440, height: 900 })
    expect(parseGeometry(null)).toEqual({ width: 1440, height: 900 })
    expect(parseGeometry('0x0')).toEqual({ width: 1440, height: 900 })
  })
})

describe('displayWsUrl', () => {
  it('attaches the single-use ticket as display_ticket (the wire name in web_routers/display.py)', () => {
    expect(displayWsUrl('ticket-123', 'wss://gateway.example/api/display/ws')).toBe(
      'wss://gateway.example/api/display/ws?display_ticket=ticket-123',
    )
  })

  it('preserves existing query params', () => {
    expect(displayWsUrl('t', 'wss://h/api/display/ws?foo=1')).toBe(
      'wss://h/api/display/ws?foo=1&display_ticket=t',
    )
  })

  it('URL-encodes the ticket', () => {
    expect(displayWsUrl('a b&c', 'ws://h/p')).toBe('ws://h/p?display_ticket=a+b%26c')
  })
})

describe('leaseHeldBy', () => {
  const viewer = { id: 'viewer-1', hash: 'abcdef123456' }

  it('is false without a lease or viewer', () => {
    expect(leaseHeldBy(null, viewer)).toBe(false)
    expect(leaseHeldBy(undefined, viewer)).toBe(false)
    expect(leaseHeldBy({ holder: 'human', viewer_hash: 'abcdef123456', since: 0, epoch: 1 }, null)).toBe(false)
  })

  it('is false while the agent holds', () => {
    expect(
      leaseHeldBy({ holder: 'agent', viewer_hash: 'abcdef123456', since: 0, epoch: 1 }, viewer),
    ).toBe(false)
  })

  it('is true only for the matching viewer hash', () => {
    const lease = { holder: 'human' as const, viewer_hash: 'abcdef123456', since: 0, epoch: 1 }
    expect(leaseHeldBy(lease, viewer)).toBe(true)
    expect(leaseHeldBy(lease, { id: 'other', hash: 'ffffffffff' })).toBe(false)
  })
})

describe('viewerHash', () => {
  it('is the first 12 hex chars of sha256(viewer_id), like lease.public_view', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('viewer-1'))
    const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    await expect(viewerHash('viewer-1')).resolves.toBe(hex.slice(0, 12))
  })

  it('is stable', async () => {
    await expect(viewerHash('same-id')).resolves.toBe(await viewerHash('same-id'))
  })
})
