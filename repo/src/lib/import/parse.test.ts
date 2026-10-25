import { describe, expect, it } from 'vitest'
import { parseImportDoc } from './parse'

const CLEAN = `# Bot: Pancho
## Personalidad
Sos el bot del clima.
Hablas en español.

# Bot: Lola
## Personalidad
Sos la bot de la cocina.

# Grupo: Los pibes
- Miembros: Pancho, Lola

# Rutina: Resumen del día
- Bot: Pancho
- Cuándo: todos los días a las 8
- Qué hace: Me armás un resumen de lo que pasó hoy
`

describe('parseImportDoc — clean export', () => {
  it('parses bots with multi-line souls', () => {
    const res = parseImportDoc(CLEAN)
    expect(res.bots).toHaveLength(2)
    expect(res.bots[0]).toEqual({
      name: 'Pancho',
      soul: 'Sos el bot del clima.\nHablas en español.',
    })
    expect(res.bots[1].name).toBe('Lola')
  })

  it('parses groups and their members', () => {
    const res = parseImportDoc(CLEAN)
    expect(res.groups).toEqual([{ name: 'Los pibes', members: ['Pancho', 'Lola'] }])
  })

  it('parses routines with bot, when and prompt', () => {
    const res = parseImportDoc(CLEAN)
    expect(res.routines).toEqual([
      {
        name: 'Resumen del día',
        bot: 'Pancho',
        when: 'todos los días a las 8',
        prompt: 'Me armás un resumen de lo que pasó hoy',
      },
    ])
  })

  it('produces no unparseable chunks', () => {
    expect(parseImportDoc(CLEAN).chunks).toEqual([])
  })
})

describe('parseImportDoc — messy inputs', () => {
  it('ignores stray prose around the blocks', () => {
    const res = parseImportDoc(`Acá te va el export que me pediste:

${CLEAN}

Espero que te sirva, cualquier cosa avisame.`)
    expect(res.bots).toHaveLength(2)
    expect(res.groups).toHaveLength(1)
    expect(res.routines).toHaveLength(1)
    expect(res.chunks).toEqual([])
  })

  it('accepts English headings and labels', () => {
    const res = parseImportDoc(`# Bot: Weather
## Personality
I answer about the weather.

# Group: Family
- Members: Weather, Chef

# Routine: Daily brief
- Bot: Weather
- When: every day at 9
- What it does: Summarizes the day
`)
    expect(res.bots[0]).toEqual({ name: 'Weather', soul: 'I answer about the weather.' })
    expect(res.groups[0].members).toEqual(['Weather', 'Chef'])
    expect(res.routines[0]).toEqual({
      name: 'Daily brief',
      bot: 'Weather',
      when: 'every day at 9',
      prompt: 'Summarizes the day',
    })
  })

  it('accepts bold pseudo-headings and headings without colons', () => {
    const res = parseImportDoc(`**Bot: Pancho**
Soul sin subtítulo.

**Grupo: Los pibes**
- Miembros: Pancho y Lola

**Rutina: Resumen**
- Bot: Pancho
- Cuándo: a las 8
- Qué hace: Resume
`)
    expect(res.bots).toEqual([{ name: 'Pancho', soul: 'Soul sin subtítulo.' }])
    expect(res.groups[0].members).toEqual(['Pancho', 'Lola'])
    expect(res.routines[0].name).toBe('Resumen')
  })

  it('splits members on commas, "y" and semicolons', () => {
    const res = parseImportDoc(`# Grupo: Todos
- Miembros: Pancho, Lola y Beto; Kika
`)
    expect(res.groups[0].members).toEqual(['Pancho', 'Lola', 'Beto', 'Kika'])
  })

  it('accepts bullet members without a label and bullet souls', () => {
    const res = parseImportDoc(`# Grupo: Todos
- Pancho
- Lola

# Bot: Pancho
- Sé directo.
- Nada de emojis.
`)
    expect(res.groups[0].members).toEqual(['Pancho', 'Lola'])
    expect(res.bots[0].soul).toBe('Sé directo.\nNada de emojis.')
  })

  it('strips a wrapping markdown fence', () => {
    const res = parseImportDoc('```markdown\n' + CLEAN + '\n```')
    expect(res.bots).toHaveLength(2)
    expect(res.routines).toHaveLength(1)
  })

  it('appends continuation lines to the routine prompt', () => {
    const res = parseImportDoc(`# Rutina: Resumen
- Bot: Pancho
- Cuándo: a las 8
- Qué hace: Me armás el resumen
del día anterior
con lo importante
`)
    expect(res.routines[0].prompt).toBe('Me armás el resumen\ndel día anterior\ncon lo importante')
  })

  it('merges duplicate bot blocks', () => {
    const res = parseImportDoc(`# Bot: Pancho
Primera parte.

# Grupo: Los pibes
- Miembros: Pancho

# Bot: Pancho
## Personalidad
Segunda parte.
`)
    expect(res.bots).toHaveLength(1)
    expect(res.bots[0].soul).toBe('Primera parte.\nSegunda parte.')
  })

  it('tolerates routine blocks with missing fields', () => {
    const res = parseImportDoc(`# Rutina: Incompleta
- Cuándo: a las 8
`)
    expect(res.routines[0]).toEqual({ name: 'Incompleta', bot: '', when: 'a las 8', prompt: '' })
  })

  it('lists unrecognized heading sections as chunks', () => {
    const res = parseImportDoc(`# Bot: Pancho
Soul.

# Canal: Telegram
Algo que no entendemos.

# Grupo: Los pibes
- Miembros: Pancho
`)
    expect(res.bots).toHaveLength(1)
    expect(res.chunks).toHaveLength(1)
    expect(res.chunks[0].text).toContain('Canal: Telegram')
  })

  it('keeps everything as one chunk when nothing parses', () => {
    const res = parseImportDoc(`Esto no tiene formato.
Solo texto suelto en dos líneas.`)
    expect(res.bots).toHaveLength(0)
    expect(res.chunks).toHaveLength(1)
    expect(res.chunks[0].text).toContain('Solo texto suelto')
  })

  it('handles CRLF line endings', () => {
    const res = parseImportDoc(CLEAN.replace(/\n/g, '\r\n'))
    expect(res.bots).toHaveLength(2)
    expect(res.bots[0].soul).toContain('Hablas en español.')
  })
})
