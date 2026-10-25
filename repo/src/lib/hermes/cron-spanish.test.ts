import { describe, expect, it } from 'vitest'
import { cronToSpanish, scheduleToSpanish } from './cron-spanish'

describe('cronToSpanish', () => {
  it('renders every-N-minute expressions', () => {
    expect(cronToSpanish('*/5 * * * *')).toBe('Cada 5 minutos')
    expect(cronToSpanish('*/15 * * * *')).toBe('Cada 15 minutos')
    expect(cronToSpanish('*/1 * * * *')).toBe('Cada minuto')
    expect(cronToSpanish('0/15 * * * *')).toBe('Cada 15 minutos')
  })

  it('renders every-minute wildcard', () => {
    expect(cronToSpanish('* * * * *')).toBe('Cada minuto')
  })

  it('renders every-N-hour expressions', () => {
    expect(cronToSpanish('0 */2 * * *')).toBe('Cada 2 horas')
    expect(cronToSpanish('0 */1 * * *')).toBe('Cada hora')
  })

  it('renders hourly expressions', () => {
    expect(cronToSpanish('0 * * * *')).toBe('Cada hora')
  })

  it('renders daily expressions', () => {
    expect(cronToSpanish('0 7 * * *')).toBe('Todos los días a las 7:00')
    expect(cronToSpanish('30 6 * * *')).toBe('Todos los días a las 6:30')
  })

  it('renders weekday ranges', () => {
    expect(cronToSpanish('0 7 * * 1-5')).toBe('De lunes a viernes a las 7:00')
    expect(cronToSpanish('0 9 * * MON-FRI')).toBe('De lunes a viernes a las 9:00')
    expect(cronToSpanish('0 9 * * 2-4')).toBe('De martes a jueves a las 9:00')
  })

  it('renders single weekdays', () => {
    expect(cronToSpanish('31 8 * * 1')).toBe('Cada lunes a las 8:31')
    expect(cronToSpanish('0 8 * * 3')).toBe('Cada miércoles a las 8:00')
    expect(cronToSpanish('0 9 * * 0')).toBe('Cada domingo a las 9:00')
    expect(cronToSpanish('0 9 * * 7')).toBe('Cada domingo a las 9:00')
    expect(cronToSpanish('0 9 * * FRI')).toBe('Cada viernes a las 9:00')
  })

  it('renders weekday lists', () => {
    expect(cronToSpanish('0 9 * * 1,4')).toBe('Lunes y jueves a las 9:00')
    expect(cronToSpanish('0 9 * * 1,3,5')).toBe('Lunes, miércoles y viernes a las 9:00')
    expect(cronToSpanish('0 9 * * 5,1')).toBe('Lunes y viernes a las 9:00')
  })

  it('renders monthly day expressions', () => {
    expect(cronToSpanish('0 10 1 * *')).toBe('El día 1 de cada mes a las 10:00')
    expect(cronToSpanish('0 0 1 * *')).toBe('El día 1 de cada mes a las 0:00')
    expect(cronToSpanish('30 22 15 * *')).toBe('El día 15 de cada mes a las 22:30')
  })

  it('drops the seconds field on 6-field expressions', () => {
    expect(cronToSpanish('0 30 6 * * 1-5')).toBe('De lunes a viernes a las 6:30')
  })

  it('falls back to the raw expression when unrecognized', () => {
    expect(cronToSpanish('esto no es cron')).toBe('esto no es cron')
    expect(cronToSpanish('0 25 * * *')).toBe('0 25 * * *')
    expect(cronToSpanish('')).toBe('')
  })

  it('expands stepped weekday expressions', () => {
    expect(cronToSpanish('0 9 * * 1/2')).toBe('Domingo, lunes, miércoles y viernes a las 9:00')
  })
})

describe('scheduleToSpanish', () => {
  it('renders interval schedules', () => {
    expect(scheduleToSpanish({ kind: 'interval', minutes: 30 })).toBe('Cada 30 minutos')
    expect(scheduleToSpanish({ kind: 'interval', minutes: 60 })).toBe('Cada hora')
    expect(scheduleToSpanish({ kind: 'interval', minutes: 120 })).toBe('Cada 2 horas')
    expect(scheduleToSpanish({ kind: 'interval', minutes: 1 })).toBe('Cada minuto')
  })

  it('parses the interval display when minutes is missing', () => {
    expect(scheduleToSpanish({ kind: 'interval', display: 'every 15m' })).toBe('Cada 15 minutos')
  })

  it('renders once schedules', () => {
    expect(scheduleToSpanish({ kind: 'once', run_at: '2026-10-24T20:00:00' }))
      .toBe('Una vez · 24/10/2026 a las 20:00')
    expect(scheduleToSpanish({ kind: 'once' })).toBe('Una sola vez')
  })

  it('renders cron schedules and legacy strings', () => {
    expect(scheduleToSpanish({ kind: 'cron', expr: '0 7 * * *' })).toBe('Todos los días a las 7:00')
    expect(scheduleToSpanish('0 7 * * *')).toBe('Todos los días a las 7:00')
  })

  it('falls back to display for unknown kinds', () => {
    expect(scheduleToSpanish({ kind: 'rrule', display: 'FREQ=DAILY' })).toBe('FREQ=DAILY')
  })

  it('returns empty for missing schedules', () => {
    expect(scheduleToSpanish(null)).toBe('')
    expect(scheduleToSpanish(undefined)).toBe('')
    expect(scheduleToSpanish({})).toBe('')
  })
})
