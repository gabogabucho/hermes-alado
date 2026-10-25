import { describe, expect, it } from 'vitest'
import { spanishSchedule } from './spanish-schedule'

describe('spanishSchedule — cron passthrough and intervals', () => {
  it('passes 5-field cron expressions through untouched', () => {
    expect(spanishSchedule('0 9 * * *')).toEqual({
      schedule: '0 9 * * *', kind: 'cron', confidence: 'exact',
    })
  })

  it('drops a seconds field on 6-field expressions', () => {
    expect(spanishSchedule('0 30 6 * * 1-5')).toEqual({
      schedule: '0 30 6 * * 1-5', kind: 'cron', confidence: 'exact',
    })
  })

  it('translates "cada X minutos" to a duration the backend accepts', () => {
    expect(spanishSchedule('cada 30 minutos')).toEqual({
      schedule: '30m', kind: 'interval', confidence: 'exact',
    })
    expect(spanishSchedule('Cada 15 min')).toEqual({
      schedule: '15m', kind: 'interval', confidence: 'exact',
    })
  })

  it('translates "cada X horas" and the bare "cada hora"', () => {
    expect(spanishSchedule('cada 2 horas')).toEqual({
      schedule: '2h', kind: 'interval', confidence: 'exact',
    })
    expect(spanishSchedule('cada hora')).toEqual({
      schedule: '1h', kind: 'interval', confidence: 'exact',
    })
  })
})

describe('spanishSchedule — daily phrases', () => {
  it('renders "todos los días a las 7"', () => {
    expect(spanishSchedule('todos los días a las 7')).toEqual({
      schedule: '0 7 * * *', kind: 'cron', confidence: 'exact',
    })
  })

  it('renders minutes and 24h times', () => {
    expect(spanishSchedule('todos los días a las 7:30')).toEqual({
      schedule: '30 7 * * *', kind: 'cron', confidence: 'exact',
    })
    expect(spanishSchedule('cada día a las 19:00')).toEqual({
      schedule: '0 19 * * *', kind: 'cron', confidence: 'exact',
    })
  })

  it('renders am/pm and "de la tarde"', () => {
    expect(spanishSchedule('todos los días a las 7 am')).toEqual({
      schedule: '0 7 * * *', kind: 'cron', confidence: 'exact',
    })
    expect(spanishSchedule('todos los días a las 7 de la tarde')).toEqual({
      schedule: '0 19 * * *', kind: 'cron', confidence: 'exact',
    })
  })
})

describe('spanishSchedule — weekdays', () => {
  it('renders single days', () => {
    expect(spanishSchedule('cada lunes a las 9')).toEqual({
      schedule: '0 9 * * 1', kind: 'cron', confidence: 'exact',
    })
    expect(spanishSchedule('los martes a las 8:30')).toEqual({
      schedule: '30 8 * * 2', kind: 'cron', confidence: 'exact',
    })
  })

  it('renders "entre semana" and day lists', () => {
    expect(spanishSchedule('entre semana a las 8')).toEqual({
      schedule: '0 8 * * 1-5', kind: 'cron', confidence: 'exact',
    })
    expect(spanishSchedule('lunes y jueves a las 9')).toEqual({
      schedule: '0 9 * * 1,4', kind: 'cron', confidence: 'exact',
    })
  })

  it('renders day ranges', () => {
    expect(spanishSchedule('de lunes a viernes a las 7')).toEqual({
      schedule: '0 7 * * 1-5', kind: 'cron', confidence: 'exact',
    })
    expect(spanishSchedule('de martes a jueves a las 12')).toEqual({
      schedule: '0 12 * * 2-4', kind: 'cron', confidence: 'exact',
    })
  })

  it('renders weekends and special times', () => {
    expect(spanishSchedule('los fines de semana a las 10')).toEqual({
      schedule: '0 10 * * 6,0', kind: 'cron', confidence: 'exact',
    })
    expect(spanishSchedule('todos los días al mediodía')).toEqual({
      schedule: '0 12 * * *', kind: 'cron', confidence: 'exact',
    })
  })
})

describe('spanishSchedule — guesses and failures', () => {
  it('guesses daily for a bare time', () => {
    expect(spanishSchedule('a las 8')).toEqual({
      schedule: '0 8 * * *', kind: 'cron', confidence: 'guess',
    })
  })

  it('guesses 9:00 for a bare day', () => {
    expect(spanishSchedule('los lunes')).toEqual({
      schedule: '0 9 * * 1', kind: 'cron', confidence: 'guess',
    })
  })

  it('fails closed on unknown phrases', () => {
    expect(spanishSchedule('cuando pinte')).toEqual({
      schedule: null, kind: 'none', confidence: 'none',
    })
    expect(spanishSchedule('')).toEqual({ schedule: null, kind: 'none', confidence: 'none' })
  })
})
