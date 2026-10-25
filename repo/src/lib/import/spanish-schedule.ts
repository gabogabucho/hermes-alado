/**
 * Small Spanish → cron/schedule translator for the migration flow. The backend
 * (`cron/jobs.py::parse_schedule`) already understands English natural phrases
 * ("every monday 9am", "weekdays at 9am"), 5-field cron, ISO one-shots and
 * durations ("30m", "2h"). This helper closes the gap for Spanish phrases and
 * hands back the exact string to POST as the cron `schedule`.
 *
 * Pure and unit-tested in spanish-schedule.test.ts.
 */

export type ScheduleConfidence = 'exact' | 'guess' | 'none'

export interface SpanishSchedule {
  /** What to send as the cron `schedule`: a 5-field cron expr or a duration ("30m"). */
  schedule: string | null
  /** 'cron' for an expression, 'interval' for a duration, 'none' when unknown. */
  kind: 'cron' | 'interval' | 'none'
  /** 'guess' = we made an assumption (e.g. no day, or no time) → ask the user. */
  confidence: ScheduleConfidence
}

function unaccent(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

interface DayDef {
  word: string
  dow: number
}

const DAYS: DayDef[] = [
  { word: 'domingo', dow: 0 },
  { word: 'lunes', dow: 1 },
  { word: 'martes', dow: 2 },
  { word: 'miercoles', dow: 3 },
  { word: 'jueves', dow: 4 },
  { word: 'viernes', dow: 5 },
  { word: 'sabado', dow: 6 },
]

const DAY_ALIASES: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 0,
}

/** 0..23 and 0..59, or null. Understands "7", "7:30", "7 am", "7pm", "7 de la
 *  mañana/tarde/noche", "mediodía", "medianoche". */
function parseTime(text: string): { hour: number; minute: number } | null {
  const t = unaccent(text).toLowerCase()
  if (/mediodia/.test(t)) return { hour: 12, minute: 0 }
  if (/medianoche/.test(t)) return { hour: 0, minute: 0 }

  const match = /(\d{1,2})(?::(\d{2}))?/.exec(t)
  if (!match) return null
  let hour = Number(match[1])
  const minute = match[2] ? Number(match[2]) : 0
  if (hour > 23 || minute > 59) return null

  const pm = /p\.?m\.?|de la tarde|de la noche/.test(t)
  const am = /a\.?m\.?|de la manana|de la madrugada/.test(t)
  if (pm && hour < 12) hour += 12
  if (am && hour === 12) hour = 0
  if (hour > 23) return null
  return { hour, minute }
}

/** DOW field for a day phrase; `null` when no day is mentioned, `{ expr, all }`. */
function parseDow(text: string): { expr: string | null; mentioned: boolean } {
  const t = unaccent(text).toLowerCase()

  if (/(todos los dias|cada dia|diariamente|a diario|\bevery day\b|\bdaily\b)/.test(t)) {
    return { expr: '*', mentioned: true }
  }
  if (/(entre semana|dias de semana|dias habiles|\bweekdays?\b|lunes a viernes)/.test(t)) {
    return { expr: '1-5', mentioned: true }
  }
  if (/(fin de semana|fines de semana|finde|\bweekends?\b)/.test(t)) {
    return { expr: '6,0', mentioned: true }
  }

  // "de martes a jueves" → an inclusive range, not a two-day list.
  const range = /(?:^|de\s+|los\s+|el\s+)([a-z]+)\s+a(?:l)?\s+([a-z]+)/.exec(t)
  if (range && DAY_ALIASES[range[1]] !== undefined && DAY_ALIASES[range[2]] !== undefined) {
    return { expr: `${DAY_ALIASES[range[1]]}-${DAY_ALIASES[range[2]]}`, mentioned: true }
  }

  const days = DAYS.map(d => d.word)
    .filter(word => new RegExp(`(^|[^a-z])${word}([^a-z]|$)`, 'i').test(t))
    .map(word => DAY_ALIASES[word] ?? 0)

  if (days.length === 0) return { expr: null, mentioned: false }
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  return { expr: sorted.join(','), mentioned: true }
}

/** "cada 30 minutos" / "cada 2 horas" / "every 15 minutes" → duration string. */
function parseInterval(text: string): { schedule: string; kind: 'interval' } | null {
  const t = unaccent(text).toLowerCase()
  const match = /(?:cada|every|todos los)\s+(\d+)\s*(min(?:uto)?s?|h(?:ora)?s?|hours?|minutes?)/.exec(t)
  if (match) {
    const value = Number(match[1])
    const unit = /h/.test(match[2]) ? 'h' : 'm'
    if (value > 0) return { schedule: `${value}${unit}`, kind: 'interval' }
  }
  if (/(cada hora|every hour)/.test(t)) return { schedule: '1h', kind: 'interval' }
  if (/(cada minuto|every minute)/.test(t)) return { schedule: '1m', kind: 'interval' }
  return null
}

function isCronField(field: string): boolean {
  // A cron field: numbers/`*` with lists, ranges and steps — or a pure
  // three-letter month/day name ("MON-FRI", "JAN,APR"). Long words ("cada",
  // "lunes", "las") are natural language, never a cron field.
  if (/^[a-zA-Z]{3}([-,][a-zA-Z]{3})*$/.test(field)) return true
  return /^[0-9*,%\-/]+$/.test(field) && /[0-9*]/.test(field)
}

function isCronExpr(text: string): boolean {
  const parts = text.trim().split(/\s+/)
  if (parts.length !== 5 && parts.length !== 6) return false
  const fields = parts.length === 6 ? parts.slice(1) : parts
  return fields.every(isCronField)
}

function cronExpr(hour: number, minute: number, dow: string): string {
  return `${minute} ${hour} * * ${dow}`
}

/**
 * Translate a Spanish schedule phrase. Returns `schedule: null` + `confidence:
 * 'none'` when nothing is understood — the caller keeps the user's original text
 * (the backend may still parse an English phrase) and asks them to confirm.
 */
export function spanishSchedule(text: string): SpanishSchedule {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return { schedule: null, kind: 'none', confidence: 'none' }

  if (isCronExpr(trimmed)) {
    return { schedule: trimmed, kind: 'cron', confidence: 'exact' }
  }

  const interval = parseInterval(trimmed)
  if (interval) return { ...interval, confidence: 'exact' }

  const time = parseTime(trimmed)
  const dow = parseDow(trimmed)

  if (time && dow.mentioned && dow.expr !== null) {
    return { schedule: cronExpr(time.hour, time.minute, dow.expr), kind: 'cron', confidence: 'exact' }
  }
  if (time && !dow.mentioned) {
    // A time with no day → assume every day (the user confirms).
    return { schedule: cronExpr(time.hour, time.minute, '*'), kind: 'cron', confidence: 'guess' }
  }
  if (!time && dow.mentioned && dow.expr !== null) {
    // A day with no time → assume 9:00 (the user confirms).
    return { schedule: cronExpr(9, 0, dow.expr), kind: 'cron', confidence: 'guess' }
  }

  return { schedule: null, kind: 'none', confidence: 'none' }
}
