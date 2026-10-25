/**
 * The export prompt (step 1 of "Traé tus bots"): a ready-to-copy message the
 * user pastes into their OLD assistant app. The assistant answers in a fixed
 * Markdown format that `parse.ts` understands. The format itself is the single
 * contract between the old app and this parser — the prompt and the parser are
 * both derived from it, and the tests in parse.test.ts lock the messy variants
 * (Spanish/English headings, stray prose, bullets).
 */

export const EXPORT_FORMAT_MD = `# Bot: <nombre>
## Personalidad
<instrucciones del bot, tal cual>

# Grupo: <nombre>
- Miembros: <bot1>, <bot2>

# Rutina: <nombre>
- Bot: <bot>
- Cuándo: <frase simple, ej: todos los días a las 8>
- Qué hace: <qué hace, en una o dos líneas>`

export const EXPORT_PROMPT = `Exportá TODOS mis bots, grupos y rutinas en este formato exacto de Markdown, sin texto extra:

${EXPORT_FORMAT_MD}

Reglas:
- Un bloque "# Bot:" por bot, con su "## Personalidad" debajo (puede tener varias líneas).
- Un bloque "# Grupo:" por grupo, con la lista de miembros.
- Un bloque "# Rutina:" por rutina, con el bot que la corre, cuándo y qué hace.
- Nada de texto fuera de los bloques. Respetá los nombres tal cual.`
