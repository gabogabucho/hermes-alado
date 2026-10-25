import { atom } from 'nanostores'
import { apiFetch } from '../../lib/api'
import { deliveryTargetFromCommand, parseAgentMessage, replyTextFromResult } from '../../lib/hermes/bot-to-bot'
import { on, request } from '../../lib/hermes/connection'
import type { TranscriptMessage } from '../../lib/hermes/rpc-types'
import { setVisibleProfile } from '../home/store'
import { registerSessionProfile } from './requests'

// ── message model ────────────────────────────────────────────────────────────

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'agent'; id: string; sender: string; body: string }
  | { kind: 'delivery'; id: string; target: string; reply: string; pending: boolean }
  | { kind: 'assistant'; id: string; text: string; reasoning: string; streaming: boolean; error: string }
  | { kind: 'tool'; id: string; name: string; argsText: string; summary: string; durationS: number | null; done: boolean }
  | { kind: 'error'; id: string; text: string }

// ── atoms ────────────────────────────────────────────────────────────────────

export const items = atom<ChatItem[]>([])
export const running = atom<boolean>(false)
export const loadingOlder = atom<boolean>(false)
export const openError = atom<string>('')
export const chatMeta = atom<{ name: string; displayName: string }>({ name: '', displayName: '' })

// ── module state (non-reactive) ─────────────────────────────────────────────

let profile: string | null = null
let displayName = ''
let liveSid: string | null = null
let storedId: string | null = null
let streamingAssistantId: string | null = null
let historyOffset = 0
let visible = false

export function chatSessionId(): string | null {
  return liveSid
}

// ── history normalization ────────────────────────────────────────────────────

function partText(part: unknown): string {
  if (typeof part === 'string') return part
  if (!part || typeof part !== 'object') return ''
  const row = part as { text?: unknown; type?: unknown }
  return (!row.type || row.type === 'text') && typeof row.text === 'string' ? row.text : ''
}

function messageText(m: TranscriptMessage): string {
  if (typeof m.text === 'string' && m.text) return m.text
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content)) return m.content.map(partText).join('')
  return ''
}

function toolPart(content: unknown): { toolName?: string; args?: Record<string, unknown>; result?: unknown } | null {
  if (!Array.isArray(content)) return null
  for (const p of content) {
    if (p && typeof p === 'object' && (p as { type?: unknown }).type === 'tool-call') {
      return p as { toolName?: string; args?: Record<string, unknown>; result?: unknown }
    }
  }
  return null
}

function argsTextOf(args: unknown): string {
  if (args && typeof args === 'object') {
    const a = args as Record<string, unknown>
    if (typeof a.command === 'string') return a.command
    if (typeof a.path === 'string') return a.path
    if (typeof a.query === 'string') return a.query
    if (typeof a.target === 'string') return a.target
    const json = JSON.stringify(args)
    return json.length > 200 ? `${json.slice(0, 200)}…` : json
  }
  return ''
}

function normalizeOne(m: TranscriptMessage): ChatItem[] {
  const role = m.role
  if (role === 'user') {
    const text = messageText(m).trim()
    if (!text) return []
    const agent = parseAgentMessage(text)
    if (agent) return [{ kind: 'agent', id: idOf(m), sender: agent.sender, body: agent.body }]
    return [{ kind: 'user', id: idOf(m), text }]
  }

  if (role === 'tool') {
    const name = (m.name ?? 'tool') as string
    const args = (m.args ?? {}) as Record<string, unknown>
    const command = typeof args.command === 'string' ? args.command : ''
    const target = deliveryTargetFromCommand(command)
    if (name === 'terminal' && target) {
      return [{
        kind: 'delivery', id: idOf(m), target, reply: replyTextFromResult(m.content ?? ''), pending: false,
      }]
    }
    return [{
      kind: 'tool', id: idOf(m), name, argsText: argsTextOf(args),
      summary: typeof m.context === 'string' ? m.context : '', durationS: null, done: true,
    }]
  }

  if (role === 'assistant') {
    const part = toolPart(m.content)
    const name = m.name ?? part?.toolName
    if (name) {
      const args = (m.args ?? part?.args ?? {}) as Record<string, unknown>
      const command = typeof args.command === 'string' ? args.command : ''
      const target = deliveryTargetFromCommand(command)
      if (name === 'terminal' && target) {
        return [{
          kind: 'delivery', id: idOf(m), target, reply: replyTextFromResult(part?.result ?? m.content ?? ''), pending: false,
        }]
      }
      return [{
        kind: 'tool', id: idOf(m), name, argsText: argsTextOf(args),
        summary: typeof m.context === 'string' ? m.context : '', durationS: null, done: true,
      }]
    }
    const text = messageText(m).trim()
    const reasoning = typeof m.reasoning === 'string' ? m.reasoning : ''
    if (!text && !reasoning) return []
    return [{ kind: 'assistant', id: idOf(m), text, reasoning, streaming: false, error: '' }]
  }

  return []
}

function idOf(m: TranscriptMessage): string {
  return String(m.row_id ?? m.tool_call_id ?? Math.random())
}

function normalizeHistory(messages: TranscriptMessage[]): ChatItem[] {
  const out: ChatItem[] = []
  for (const m of messages) out.push(...normalizeOne(m))
  return out
}

// ── canonical chat open (mirrors desktop canonical-chat.ts) ─────────────────

const CANONICAL_TITLE = 'Bot Chat'

async function findCanonical(): Promise<{ id: string; resolvedId: string } | null> {
  const res = await request('session.list', {
    profile,
    title: CANONICAL_TITLE,
    limit: 200,
    include_hidden: true,
  })
  const row = res?.sessions?.[0]
  if (row) return { id: String(row.id), resolvedId: String(row.resolved_id || row.id) }
  return null
}

export async function openChat(name: string, metaDisplayName?: string): Promise<void> {
  closeChat()
  profile = name
  displayName = metaDisplayName ?? name
  chatMeta.set({ name, displayName })
  setVisibleProfile(name)
  openError.set('')

  try {
    const existing = await findCanonical()

    if (existing) {
      const res = await request('session.resume', { session_id: existing.resolvedId, profile })
      liveSid = res.session_id
      storedId = res.stored_session_id ?? existing.id
      registerSessionProfile(liveSid, name)
      registerSessionProfile(String(storedId), name)
      historyOffset = res.messages?.length ?? 0
      items.set(normalizeHistory(res.messages ?? []))
      if (res.inflight) hydrateInflight(res.inflight)
      if (res.running) running.set(true)
    } else {
      const created = await request('session.create', {
        profile,
        title: CANONICAL_TITLE,
        hidden: true,
        follow_profile_config: true,
      })
      liveSid = created.session_id
      storedId = created.stored_session_id
      registerSessionProfile(liveSid, name)
      registerSessionProfile(String(storedId), name)
      items.set(normalizeHistory(created.messages ?? []))
    }

    void markRead()
  } catch (e) {
    openError.set(e instanceof Error ? e.message : 'No se pudo abrir el chat')
  }
}

function hydrateInflight(inflight: { assistant?: string; user?: string; streaming?: boolean; error?: string | null }): void {
  if (inflight.assistant) {
    const id = crypto.randomUUID()
    streamingAssistantId = id
    items.set([...items.get(), { kind: 'assistant', id, text: inflight.assistant, reasoning: '', streaming: true, error: inflight.error ?? '' }])
  }
  if (inflight.streaming) running.set(true)
}

export function closeChat(): void {
  profile = null
  liveSid = null
  storedId = null
  streamingAssistantId = null
  historyOffset = 0
  visible = false
  items.set([])
  running.set(false)
  openError.set('')
  setVisibleProfile(null)
}

export function setChatVisible(v: boolean): void {
  visible = v
}

// ── send / stop ─────────────────────────────────────────────────────────────

export async function sendMessage(text: string): Promise<void> {
  const sid = liveSid
  const trimmed = text.trim()
  if (!sid || !trimmed) return

  items.set([...items.get(), { kind: 'user', id: crypto.randomUUID(), text: trimmed }])
  running.set(true)

  try {
    await request('prompt.submit', { session_id: sid, text: trimmed })
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    items.set([...items.get(), { kind: 'error', id: crypto.randomUUID(), text: err }])
    running.set(false)
  }
}

export async function retryLast(): Promise<void> {
  const list = items.get()
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]
    if (item.kind === 'user') {
      items.set(list.slice(0, i))
      await sendMessage(item.text)
      return
    }
  }
}

export async function stop(): Promise<void> {
  const sid = liveSid
  if (!sid) return
  try {
    await request('session.interrupt', { session_id: sid })
  } catch {
    // the turn may have already ended
  }
}

// ── load older ──────────────────────────────────────────────────────────────

export async function loadOlder(): Promise<void> {
  const sid = storedId
  if (!sid || loadingOlder.get()) return
  loadingOlder.set(true)
  try {
    const res = await apiFetch<{ messages: TranscriptMessage[]; pagination: { returned: number; offset: number } }>(
      `/api/sessions/${encodeURIComponent(sid)}/messages?order=latest&offset=${historyOffset}&limit=50&inline_images=false`,
    )
    const older = res.messages ?? []
    historyOffset += older.length
    items.set([...normalizeHistory(older), ...items.get()])
  } catch {
    // non-fatal: keep current transcript
  } finally {
    loadingOlder.set(false)
  }
}

// ── mark read ───────────────────────────────────────────────────────────────

async function markRead(): Promise<void> {
  const sid = storedId
  if (!sid) return
  try {
    await apiFetch(`/api/sessions/${encodeURIComponent(sid)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unread: false }),
    })
  } catch {
    // non-fatal
  }
}

// ── streaming event handlers ────────────────────────────────────────────────

function ensureStreamingAssistant(): string | null {
  if (streamingAssistantId) return streamingAssistantId
  const id = crypto.randomUUID()
  streamingAssistantId = id
  items.set([...items.get(), { kind: 'assistant', id, text: '', reasoning: '', streaming: true, error: '' }])
  return id
}

function patchAssistant(id: string, fn: (m: Extract<ChatItem, { kind: 'assistant' }>) => Extract<ChatItem, { kind: 'assistant' }>): void {
  items.set(items.get().map(m => (m.kind === 'assistant' && m.id === id ? fn(m) : m)))
}

function finishAssistant(id: string, finalText: string, errorText: string): void {
  items.set(
    items.get().flatMap(m => {
      if (m.kind !== 'assistant' || m.id !== id) return [m]
      const text = finalText || m.text
      const error = errorText
      if (!text.trim() && !m.reasoning && !error) return []
      return [{ ...m, text, error, streaming: false }]
    }),
  )
  streamingAssistantId = null
  running.set(false)
  if (visible) void markRead()
}

on('message.start', e => {
  if (e.session_id !== liveSid) return
  running.set(true)
  ensureStreamingAssistant()
})

on('reasoning.delta', e => {
  if (e.session_id !== liveSid) return
  const id = ensureStreamingAssistant()
  if (id && typeof e.payload?.text === 'string') {
    patchAssistant(id, m => ({ ...m, reasoning: m.reasoning + e.payload!.text }))
  }
})

on('thinking.delta', e => {
  if (e.session_id !== liveSid) return
  const id = ensureStreamingAssistant()
  if (id && typeof e.payload?.text === 'string') {
    patchAssistant(id, m => ({ ...m, reasoning: m.reasoning + e.payload!.text }))
  }
})

on('message.delta', e => {
  if (e.session_id !== liveSid) return
  const text = e.payload?.text
  if (text == null) return
  const id = ensureStreamingAssistant()
  if (id) patchAssistant(id, m => ({ ...m, text: m.text + text }))
})

on('message.interim', e => {
  if (e.session_id !== liveSid) return
  const id = ensureStreamingAssistant()
  if (id && typeof e.payload?.text === 'string') patchAssistant(id, m => ({ ...m, text: m.text + e.payload!.text }))
})

const liveTools = new Map<string, { id: string; name: string; argsText: string }>()

on('tool.start', e => {
  if (e.session_id !== liveSid) return
  const p = e.payload
  if (!p) return
  const name = p.name ?? 'tool'
  const args = (p.args ?? {}) as Record<string, unknown>
  const command = typeof args.command === 'string' ? args.command : ''
  const target = deliveryTargetFromCommand(command)
  const itemId = crypto.randomUUID()
  if (name === 'terminal' && target) {
    items.set([...items.get(), { kind: 'delivery', id: itemId, target, reply: '', pending: true }])
    liveTools.set(p.tool_id, { id: itemId, name, argsText: command })
    return
  }
  items.set([...items.get(), { kind: 'tool', id: itemId, name, argsText: argsTextOf(args), summary: '', durationS: null, done: false }])
  liveTools.set(p.tool_id, { id: itemId, name, argsText: argsTextOf(args) })
})

on('tool.progress', e => {
  if (e.session_id !== liveSid) return
  const t = liveTools.get(e.payload?.tool_id ?? '')
  if (t) patchTool(t.id, x => ({ ...x, summary: e.payload?.message ?? x.summary }))
})

on('tool.complete', e => {
  if (e.session_id !== liveSid) return
  const p = e.payload
  if (!p) return
  const t = liveTools.get(p.tool_id)
  liveTools.delete(p.tool_id)
  if (!t) return
  const command = t.argsText
  const target = deliveryTargetFromCommand(command)
  if (t.name === 'terminal' && target) {
    items.set(items.get().map(m => {
      if (m.kind === 'delivery' && m.id === t.id) {
        return { ...m, reply: replyTextFromResult(p.result), pending: false }
      }
      return m
    }))
    return
  }
  items.set(items.get().map(m => {
    if (m.kind === 'tool' && m.id === t.id) {
      return {
        ...m, done: true, durationS: typeof p.duration_s === 'number' ? p.duration_s : null,
        summary: p.summary ?? p.result_text ?? m.summary,
      }
    }
    return m
  }))
})

function patchTool(id: string, fn: (m: Extract<ChatItem, { kind: 'tool' }>) => Extract<ChatItem, { kind: 'tool' }>): void {
  items.set(items.get().map(m => (m.kind === 'tool' && m.id === id ? fn(m) : m)))
}

on('message.complete', e => {
  if (e.session_id !== liveSid) return
  const p = e.payload
  const status = p?.status
  const finalText = typeof p?.text === 'string' ? p.text : ''
  const errorText = status === 'error' ? (typeof p?.error === 'string' ? p.error : 'Error') : ''
  const id = streamingAssistantId
  if (id) {
    finishAssistant(id, finalText, errorText)
  } else {
    if (errorText) items.set([...items.get(), { kind: 'error', id: crypto.randomUUID(), text: errorText }])
    running.set(false)
    if (visible) void markRead()
  }
})

on('error', e => {
  if (e.session_id && e.session_id !== liveSid) return
  const text = String(e.payload?.message ?? 'Error')
  items.set([...items.get(), { kind: 'error', id: crypto.randomUUID(), text }])
  running.set(false)
})
