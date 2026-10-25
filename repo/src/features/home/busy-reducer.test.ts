import { describe, expect, it } from 'vitest'
import {
  applyActiveList,
  applyGroupActivity,
  applyMessageBoundary,
  applySessionInfo,
  busyOf,
  initialBusyState,
  isWorkingStatus,
  registerBusySession,
  snapshotFence,
} from './busy-reducer'

describe('busy reducer — session.info feed', () => {
  it('arms busy on running:true and releases on running:false', () => {
    let s = initialBusyState()
    expect(busyOf(s).size).toBe(0)

    s = applySessionInfo(s, 'sid-1', { running: true, profile_name: 'lucia' })
    expect(busyOf(s)).toEqual(new Set(['lucia']))

    s = applySessionInfo(s, 'sid-1', { running: false, profile_name: 'lucia' })
    expect(busyOf(s).size).toBe(0)
  })

  it('ignores session.info frames without a profile', () => {
    let s = initialBusyState()
    s = applySessionInfo(s, 'sid-1', { running: true, profile_name: null })
    expect(busyOf(s).size).toBe(0)
    s = applySessionInfo(s, 'sid-1', { running: true })
    expect(busyOf(s).size).toBe(0)
  })
})

describe('busy reducer — message boundaries', () => {
  it('arms on message.start and releases on message.complete for a known sid', () => {
    let s = initialBusyState()
    s = registerBusySession(s, 'sid-9', 'pancho')
    s = applyMessageBoundary(s, 'sid-9', true)
    expect(busyOf(s)).toEqual(new Set(['pancho']))
    s = applyMessageBoundary(s, 'sid-9', false)
    expect(busyOf(s).size).toBe(0)
  })

  it('ignores boundaries for unknown sids', () => {
    let s = initialBusyState()
    s = applyMessageBoundary(s, 'sid-unknown', true)
    expect(busyOf(s).size).toBe(0)
  })

  it('registerBusySession is idempotent', () => {
    let s = initialBusyState()
    s = registerBusySession(s, 'sid-9', 'pancho')
    const before = s
    s = registerBusySession(s, 'sid-9', 'pancho')
    expect(s).toBe(before)
  })
})

describe('busy reducer — active_list snapshot', () => {
  const storedIds = new Map<string, ReadonlySet<string>>([
    ['lucia', new Set(['stored-lucia'])],
    ['pancho', new Set(['stored-pancho'])],
  ])

  it('attributes working rows by stored session key', () => {
    let s = initialBusyState()
    s = applyActiveList(
      s,
      [
        { id: 'rt-1', session_key: 'stored-lucia', status: 'working' },
        { id: 'rt-2', session_key: 'stored-pancho', status: 'idle' },
      ],
      snapshotFence(s),
      storedIds,
    )
    expect(busyOf(s)).toEqual(new Set(['lucia']))
  })

  it('treats waiting (pending approval) as busy', () => {
    let s = initialBusyState()
    s = applyActiveList(
      s,
      [{ id: 'rt-3', session_key: 'stored-lucia', status: 'waiting' }],
      snapshotFence(s),
      storedIds,
    )
    expect(busyOf(s)).toEqual(new Set(['lucia']))
    expect(isWorkingStatus('waiting')).toBe(true)
    expect(isWorkingStatus('starting')).toBe(false)
    expect(isWorkingStatus('resuming')).toBe(false)
    expect(isWorkingStatus('idle')).toBe(false)
  })

  it('attributes rows by runtime sid learned from events', () => {
    let s = initialBusyState()
    s = applySessionInfo(s, 'rt-7', { running: false, profile_name: 'lucia' })
    s = applyActiveList(
      s,
      [{ id: 'rt-7', session_key: 'unknown-key', status: 'streaming' }],
      snapshotFence(s),
      storedIds,
    )
    expect(busyOf(s)).toEqual(new Set(['lucia']))
  })

  it('skips rows whose events advanced while the snapshot was in flight', () => {
    let s = initialBusyState()
    const fence = snapshotFence(s)
    // Turn starts while the request is out.
    s = applySessionInfo(s, 'rt-8', { running: true, profile_name: 'lucia' })
    // Stale snapshot says idle: must NOT darken the row.
    s = applyActiveList(
      s,
      [{ id: 'rt-8', session_key: 'stored-lucia', status: 'idle' }],
      fence,
      storedIds,
    )
    expect(busyOf(s)).toEqual(new Set(['lucia']))
  })

  it('drops snapshot claims wholesale on the next snapshot', () => {
    let s = initialBusyState()
    s = applyActiveList(
      s,
      [{ id: 'rt-9', session_key: 'stored-lucia', status: 'working' }],
      snapshotFence(s),
      storedIds,
    )
    expect(busyOf(s).size).toBe(1)
    s = applyActiveList(s, [], snapshotFence(s), storedIds)
    expect(busyOf(s).size).toBe(0)
  })

  it('ignores unattributable working rows', () => {
    let s = initialBusyState()
    s = applyActiveList(
      s,
      [{ id: 'rt-10', session_key: 'cron-room-nobody-knows', status: 'working' }],
      snapshotFence(s),
      storedIds,
    )
    expect(busyOf(s).size).toBe(0)
  })
})

describe('busy reducer — group activity + cross-source union', () => {
  it('applies the group map wholesale', () => {
    let s = initialBusyState()
    s = applyGroupActivity(s, new Map([['lucia', true]]))
    expect(busyOf(s)).toEqual(new Set(['lucia']))
    s = applyGroupActivity(s, new Map())
    expect(busyOf(s).size).toBe(0)
  })

  it('a profile stays busy until EVERY source releases it', () => {
    let s = initialBusyState()
    s = applySessionInfo(s, 'sid-1', { running: true, profile_name: 'lucia' })
    s = applyGroupActivity(s, new Map([['lucia', true]]))
    expect(busyOf(s)).toEqual(new Set(['lucia']))

    // The chat turn ends; the group turn keeps running.
    s = applySessionInfo(s, 'sid-1', { running: false, profile_name: 'lucia' })
    expect(busyOf(s)).toEqual(new Set(['lucia']))

    // The group turn ends too.
    s = applyGroupActivity(s, new Map())
    expect(busyOf(s).size).toBe(0)
  })
})
