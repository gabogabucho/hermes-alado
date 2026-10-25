// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Sender/receiver side of the bot-to-bot messaging convention, ported verbatim
// from apps/desktop/src/components/assistant-ui/thread/{agent-delivery,user-message}.tsx
// and kept MIT-headed per AGENTS.md rule 3.

/**
 * Sender-side inter-agent delivery: `hermes -p <agent> chat … -q "Message from
 * 🤖 <sender>…"` run through the terminal tool IS the messaging pipeline.
 */
export const DELIVERY_COMMAND_RE =
  /(?:^|[;&|]\s*|\bhermes\s+)-p\s+("?)([a-z0-9][a-z0-9_-]{0,63})\1\s+chat\b[\s\S]*?-q\s+["']Message from/iu

export function deliveryTargetFromCommand(command: string): null | string {
  const match = DELIVERY_COMMAND_RE.exec(command)
  return match ? match[2].toLowerCase() : null
}

/**
 * Incoming agent-to-agent delivery: `Message from 🤖 <sender> (@<handle>): <body>`
 * (plus the legacy `[Message from agent '<sender>'] <body>` form). They arrive on
 * the `role="user"` channel because the recipient's turn runs on it, but they are
 * NOT the human speaking.
 */
export const AGENT_MESSAGE_RE =
  /^(?:Message from (?:🤖\s*)?([^:\n(]{1,64}?)(?:\s*\(@([a-z0-9][a-z0-9_-]{0,63})(?:@[a-zA-Z0-9][a-zA-Z0-9_-]{0,63})?\))?:\s*|\[Message from agent '([^']{1,64})'\]\s*)([\s\S]*)$/u

export interface AgentMessageInfo {
  sender: string
  handle: string
  body: string
}

/** Parse an incoming agent message; `null` when the text is not one. */
export function parseAgentMessage(text: string): AgentMessageInfo | null {
  const match = AGENT_MESSAGE_RE.exec(text)
  if (!match) return null
  const sender = (match[1] || match[3] || 'agent').trim()
  const handle = (match[2] || match[3] || sender).trim()
  const body = (match[4] || '').trim()
  return { sender, handle, body }
}

/** `@Dr. Foo`, `scribe@laptop`, `peer/scribe` → `dr. foo` / `scribe`. */
export function agentKey(value: unknown): string {
  return typeof value === 'string'
    ? value
        .trim()
        .replace(/^@/, '')
        .replace(/@[^@]*$/, '')
        .split('/')
        .pop()!
        .toLowerCase()
    : ''
}

/** Extract the recipient's reply text from a terminal result payload. */
export function replyTextFromResult(result: unknown): string {
  const container = (result ?? {}) as { content?: unknown; output?: unknown }
  let raw = ''
  if (typeof result === 'string') {
    raw = result
  } else if (typeof container.output === 'string') {
    raw = container.output
  } else if (Array.isArray(container.content)) {
    raw = container.content
      .map(entry => (typeof (entry as { text?: unknown })?.text === 'string' ? (entry as { text: string }).text : ''))
      .join('\n')
  }

  if (raw.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as { output?: unknown }
      if (typeof parsed.output === 'string') raw = parsed.output
    } catch {
      /* not JSON — use as-is */
    }
  }

  return raw
    .split('\n')
    .filter(line => !/^session_id:\s/.test(line.trim()))
    .join('\n')
    .trim()
}

/**
 * The home-list subtitle for a Bot Chat preview: an incoming `Message from 🤖 X
 * (@h): body` becomes `Mensaje de X: body`. Returns the raw preview otherwise.
 */
export function previewSubtitle(preview: string | null | undefined): string {
  const text = (preview ?? '').trim()
  if (!text) return ''
  const info = parseAgentMessage(text)
  return info ? `Mensaje de ${info.sender}: ${info.body}` : text
}
