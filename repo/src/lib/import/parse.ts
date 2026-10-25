/**
 * Pure Markdown parser for the "Traé tus bots" export format (see
 * `export-prompt.ts`). Tolerant by design: AIs add prose, bullets, fences,
 * mixed Spanish/English headings and bold pseudo-headings — the parser keeps
 * everything it recognizes and lists the rest as `chunks`.
 *
 * No React, no I/O: unit-tested in parse.test.ts.
 */

export interface ParsedBot {
  /** Name exactly as written in the export. */
  name: string
  /** Multi-line personality/instructions ('' when the export has none). */
  soul: string
}

export interface ParsedGroup {
  name: string
  members: string[]
}

export interface ParsedRoutine {
  name: string
  /** Bot that runs it, as written ('' when missing). */
  bot: string
  /** "Cuándo" text: plain words or cron ('' when missing). */
  when: string
  /** "Qué hace" prompt ('' when missing). */
  prompt: string
}

export interface UnparsedChunk {
  /** The heading line (when the chunk started at one) or the stray prose. */
  text: string
}

export interface ParseResult {
  bots: ParsedBot[]
  groups: ParsedGroup[]
  routines: ParsedRoutine[]
  chunks: UnparsedChunk[]
}

type BlockKind = 'bot' | 'group' | 'routine'

interface Block {
  kind: BlockKind
  name: string
  members: string[]
  bot: string
  when: string
  prompt: string
  lines: string[]
}

const BLOCK_KEYWORDS: Record<BlockKind, RegExp> = {
  bot: /^(?:bots?)\b/i,
  group: /^(?:grupos?|groups?)\b/i,
  routine: /^(?:rutinas?|routines?)\b/i,
}

const MEMBERS_LABEL = /^(?:miembros|members)\s*:/i
const BOT_LABEL = /^(?:bot(?:es)?|bots?)\s*:/i
const WHEN_LABEL = /^(?:cu[aá]ndo|horario|hora|schedule|when)\s*:/i
const PROMPT_LABEL = /^(?:qu[eé]\s*hace|hace|prompt|tarea|task|what(?:\s+it)?\s+does)\s*:/i

function isHeading(text: string): boolean {
  return /^#{1,6}\s/.test(text)
}

function headingContent(text: string): string {
  return text.replace(/^#{1,6}\s+/, '').trim()
}

/** `# Bot: Pancho` / `# Rutina - Resumen` / `**Grupo: Los pibes**` → block. */
function matchBlockHeading(line: string): { kind: BlockKind; name: string } | null {
  const trimmed = line.trim()
  let content = ''
  if (isHeading(trimmed)) {
    content = headingContent(trimmed)
  } else {
    const bold = /^\*\*([^*]+)\*\*$/.exec(trimmed)
    if (!bold) return null
    content = bold[1].trim()
  }
  for (const kind of Object.keys(BLOCK_KEYWORDS) as BlockKind[]) {
    const match = BLOCK_KEYWORDS[kind].exec(content)
    if (!match) continue
    const name = content
      .slice(match[0].length)
      .replace(/^\s*[:-]\s*/, '')
      .replace(/^["'“”«»]+|["'“”«»]+$/g, '')
      .trim()
    if (!name) return null
    return { kind, name }
  }
  return null
}

function bulletContent(text: string): string | null {
  const match = /^[-*•]\s+(.*)$/.exec(text.trim())
  return match ? match[1].trim() : null
}

/** "Pancho, Lola y Beto" / "Pancho; Lola" / "Pancho y Lola" → names. */
function splitMembers(text: string): string[] {
  return text
    .split(/[,;]|(?:^|\s)(?:y|e|and)(?:\s|$)/i)
    .map(piece => piece.replace(/^\(.+\)$/, '').trim())
    .filter(Boolean)
}

/** Strip a single wrapping ```(markdown) fence when the whole doc is fenced. */
function stripFence(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length < 2) return markdown
  const first = lines[0].trim()
  const last = lines[lines.length - 1].trim()
  if (/^```/.test(first) && /^```$/.test(last)) {
    return lines.slice(1, -1).join('\n')
  }
  return lines.join('\n')
}

function flushBlock(blocks: Block[], result: ParseResult): void {
  for (const block of blocks) {
    const lines = block.lines.map(line => line.trim()).filter(Boolean)
    if (block.kind === 'bot') {
      const existing = result.bots.find(b => b.name.toLowerCase() === block.name.toLowerCase())
      const soul = lines.join('\n').trim()
      if (existing) {
        existing.soul = [existing.soul, soul].filter(Boolean).join('\n')
      } else {
        result.bots.push({ name: block.name, soul })
      }
    } else if (block.kind === 'group') {
      const members = block.members.map(m => m.trim()).filter(Boolean)
      const existing = result.groups.find(g => g.name.toLowerCase() === block.name.toLowerCase())
      if (existing) {
        for (const member of members) {
          if (!existing.members.includes(member)) existing.members.push(member)
        }
      } else {
        result.groups.push({ name: block.name, members })
      }
    } else {
      result.routines.push({
        name: block.name,
        bot: block.bot.trim(),
        when: block.when.trim(),
        prompt: block.prompt.trim(),
      })
    }
  }
  blocks.length = 0
}

/**
 * Parse an export document. Anything recognized becomes bots/groups/routines;
 * unrecognized heading sections (and, when nothing at all parsed, the stray
 * prose) surface as `chunks` so the UI can list them or offer the bot fallback.
 */
export function parseImportDoc(markdown: string): ParseResult {
  const result: ParseResult = { bots: [], groups: [], routines: [], chunks: [] }
  const text = stripFence(markdown)
  const lines = text.split('\n')

  let blocks: Block[] = []
  let chunkLines: string[] = []
  let parsedBlocks = 0

  const pushChunk = () => {
    const joined = chunkLines.map(line => line.trim()).filter(Boolean).join('\n')
    if (joined) {
      result.chunks.push({ text: joined })
    }
    chunkLines = []
  }

  const startBlock = (kind: BlockKind, name: string) => {
    pushChunk()
    blocks.push({
      kind,
      name,
      members: [],
      bot: '',
      when: '',
      prompt: '',
      lines: [],
    })
    parsedBlocks += 1
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const blockHeading = matchBlockHeading(line)
    if (blockHeading) {
      flushBlock(blocks, result)
      startBlock(blockHeading.kind, blockHeading.name)
      continue
    }

    if (blocks.length > 0) {
      const block = blocks[blocks.length - 1]
      const bullet = bulletContent(line)
      if (bullet !== null) {
        if (block.kind === 'group') {
          const label = MEMBERS_LABEL.exec(bullet)
          if (label) {
            block.members.push(...splitMembers(bullet.slice(label[0].length)))
          } else {
            block.members.push(...splitMembers(bullet))
          }
        } else if (block.kind === 'routine') {
          const bot = BOT_LABEL.exec(bullet)
          if (bot) block.bot = bullet.slice(bot[0].length).trim()
          const when = WHEN_LABEL.exec(bullet)
          if (when) block.when = bullet.slice(when[0].length).trim()
          const prompt = PROMPT_LABEL.exec(bullet)
          if (prompt) block.prompt = bullet.slice(prompt[0].length).trim()
        } else {
          // Bot block: any bullet is soul content.
          block.lines.push(bullet)
        }
        continue
      }
      if (isHeading(line)) {
        if (/^#\s/.test(line)) {
          // A level-1 heading the block keywords didn't recognize ends the
          // block and becomes an unparseable chunk section.
          flushBlock(blocks, result)
          pushChunk()
          chunkLines.push(line)
          continue
        }
        // Sub-heading inside a block ("## Personalidad"…) — keep the text that
        // follows; the heading itself adds nothing.
        continue
      }
      if (block.kind === 'bot') {
        block.lines.push(line)
      } else if (block.kind === 'routine') {
        block.prompt = [block.prompt, line].filter(Boolean).join('\n')
      }
      // Group prose is ignored.
      continue
    }

    if (isHeading(line)) {
      pushChunk()
      chunkLines.push(line)
      continue
    }

    const bullet = bulletContent(line)
    if (bullet !== null) {
      chunkLines.push(bullet)
      continue
    }

    chunkLines.push(line)
  }

  flushBlock(blocks, result)
  pushChunk()

  // Stray prose is noise when the export parsed fine; keep it only when it was
  // all we got (the "parsing finds little" case) or when it started at a
  // heading the parser didn't recognize.
  if (parsedBlocks > 0) {
    result.chunks = result.chunks.filter(chunk => /^#{1,6}\s|^\*\*/.test(chunk.text.trim()))
  }

  return result
}
