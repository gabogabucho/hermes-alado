import { atom } from 'nanostores'
import { t } from '../../i18n'
import { apiFetch } from '../../lib/api'
import { deliveryTargetFromCommand, parseAgentMessage, replyTextFromResult } from '../../lib/hermes/bot-to-bot'
import { connectionState, on, request } from '../../lib/hermes/connection'
import { JsonRpcGatewayError } from '../../lib/hermes/vendor/json-rpc-channel'
import { setSessionUnread } from '../../lib/hermes/session-mutations'
import type { ToolLabel, TranscriptMessage } from '../../lib/hermes/rpc-types'
import { registerBusySessionProfile } from '../home/busy-store'
import { botDisplayName, homeProfiles, setVisibleProfile } from '../home/store'
import { registerSessionProfile } from './requests'

// ── message model ────────────────────────────────────────────────────────────
//
// Reasoning is its own item so the row reducer (activity.ts) can fold it into
// the turn's activity row; tool items keep the human `context` / `labels` the
// gateway sends instead of raw argument text.

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'agent'; id: string; sender: string; body: string }
  | { kind: 'delivery'; id: string; target: string; reply: string; pending: boolean }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean; error: string }
  | { kind: 'reasoning'; id: string; text: string; streaming: boolean }
  | { kind: 'tool'; id: string; name: string; context: string; summary: string; durationS: number | null; done: boolean; labels?: ToolLabel[] | null }
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
let streamingReasoningId: string | null = null
let historyOffset = 0
let visible = false

// One-shot composer prefill: the migration fallback hands the principal bot a
// message before navigating to its chat; the Composer consumes it on mount.
let pendingDraftText = ''

/** Queue a message for the next Composer mount (chat is opened right after). */
export function setPendingDraft(text: string): void {
  pendingDraftText = text
}

/** Read and clear the queued draft. */
export function consumePendingDraft(): string {
  const text = pendingDraftText
  pendingDraftText = ''
  return text
}

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
      kind: 'tool', id: idOf(m), name,
      context: typeof m.context === 'string' ? m.context : '',
      summary: '', durationS: null, done: true,
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
        kind: 'tool', id: idOf(m), name,
        context: typeof m.context === 'string' ? m.context : '',
        summary: '', durationS: null, done: true,
      }]
    }
    const text = messageText(m).trim()
    const reasoning = typeof m.reasoning === 'string' ? m.reasoning.trim() : ''
    if (!text && !reasoning) return []
    const out: ChatItem[] = []
    if (reasoning) out.push({ kind: 'reasoning', id: `${idOf(m)}-reasoning`, text: reasoning, streaming: false })
    if (text) out.push({ kind: 'assistant', id: idOf(m), text, streaming: false, error: '' })
    return out
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

async function findCanonicalFor(name: string): Promise<{ id: string; resolvedId: string } | null> {
  const res = await request('session.list', {
    profile: name,
    title: CANONICAL_TITLE,
    limit: 200,
    include_hidden: true,
  })
  const row = res?.sessions?.[0]
  if (row) return { id: String(row.id), resolvedId: String(row.resolved_id || row.id) }
  return null
}

// The canonical lookup is serial in openChat (`session.list` → `session.resume`),
// so Home prefetches the featured bot's id while idle. A cached entry is only a
// fast path: `session.resume` remains the authority and a failure drops the
// entry and re-runs the full lookup.
const canonicalCache = new Map<string, { id: string; resolvedId: string }>()

/** Resolve (and remember) a profile's "Bot Chat" id without opening it. */
export async function prefetchCanonical(name: string): Promise<void> {
  if (canonicalCache.has(name)) return
  try {
    const found = await findCanonicalFor(name)
    if (found) canonicalCache.set(name, found)
  } catch {
    // prefetch nicety only; the tap falls back to the full serial flow
  }
}

function dropCachedCanonical(name: string): void {
  canonicalCache.delete(name)
}

let openGeneration = 0

export async function openChat(name: string, metaDisplayName?: string): Promise<void> {
  closeChat()
  const generation = ++openGeneration
  profile = name
  const row = homeProfiles.get().find(r => r.name === name)
  displayName = metaDisplayName ?? (row ? botDisplayName(row) : name)
  chatMeta.set({ name, displayName })
  setVisibleProfile(name)
  openError.set('')

  try {
    await runOpen(name, generation, true)
  } catch (e) {
    openError.set(e instanceof Error ? e.message : t('chat.openFailed'))
  }
}

async function runOpen(name: string, generation: number, allowCache: boolean): Promise<void> {
  const stale = () => generation !== openGeneration

  const existing = allowCache
    ? (canonicalCache.get(name) ?? (await findCanonicalFor(name)))
    : await findCanonicalFor(name)
  if (stale()) return

  if (existing) {
    let res
    try {
      res = await request('session.resume', { session_id: existing.resolvedId, profile })
    } catch (e) {
      // A prefetched id can go stale (Bot Chat deleted/renamed elsewhere):
      // drop it and re-run the full lookup once before surfacing the error.
      if (!allowCache) throw e
      dropCachedCanonical(name)
      if (stale()) return
      await runOpen(name, generation, false)
      return
    }
    if (stale()) return
    liveSid = res.session_id
    storedId = res.stored_session_id ?? existing.id
    registerSessionProfile(liveSid, name)
    registerSessionProfile(String(storedId), name)
    registerBusySessionProfile(liveSid, name)
    // Keep the prefetch cache on the live tip (compression rotates ids).
    canonicalCache.set(name, { id: String(storedId), resolvedId: String(storedId) })
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
    if (stale()) return
    liveSid = created.session_id
    storedId = created.stored_session_id
    // Eager title write, like the desktop's createCanonicalChat: session.create is lazy
    // and the turn-start auto-titler would otherwise retitle the row ("Respondé solo…"),
    // so the next open could no longer find "Bot Chat" and would fork a fresh chat.
    try {
      await request('session.title', { session_id: liveSid, title: CANONICAL_TITLE })
    } catch {
      // Uniqueness rejection = someone else holds "Bot Chat" now: adopt it (adopt-before-mint).
      const winner = await findCanonicalFor(name)
      if (winner) {
        const res = await request('session.resume', { session_id: winner.resolvedId, profile })
        if (stale()) return
        liveSid = res.session_id
        storedId = res.stored_session_id ?? winner.id
        registerSessionProfile(liveSid, name)
        registerSessionProfile(String(storedId), name)
        registerBusySessionProfile(liveSid, name)
        historyOffset = res.messages?.length ?? 0
        items.set(normalizeHistory(res.messages ?? []))
        void markRead()
        return
      }
    }
    registerSessionProfile(liveSid, name)
    registerSessionProfile(String(storedId), name)
    registerBusySessionProfile(liveSid, name)
    items.set(normalizeHistory(created.messages ?? []))
    canonicalCache.set(name, { id: String(storedId), resolvedId: String(storedId) })
  }

  void markRead()
}

function hydrateInflight(inflight: { assistant?: string; user?: string; streaming?: boolean; error?: string | null }): void {
  if (inflight.assistant) {
    const id = crypto.randomUUID()
    streamingAssistantId = id
    items.set([...items.get(), { kind: 'assistant', id, text: inflight.assistant, streaming: true, error: inflight.error ?? '' }])
  }
  if (inflight.streaming) running.set(true)
}

export function closeChat(): void {
  profile = null
  liveSid = null
  storedId = null
  streamingAssistantId = null
  streamingReasoningId = null
  liveTools.clear()
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
  const persisted = storedId
  const name = profile
  const generation = openGeneration
  const current = () => generation === openGeneration && profile === name
  const trimmed = text.trim()
  if (!trimmed) return
  if (!sid) {
    // A dead socket or a boot that never finished (e.g. no secure context) used
    // to swallow the message silently — surface it instead.
    items.set([...items.get(), { kind: 'error', id: crypto.randomUUID(),
      text: 'No hay conexión activa con el servidor. Recarga la página (si estás en HTTP el chat no funciona — usa HTTPS).' }])
    return
  }

  items.set([...items.get(), { kind: 'user', id: crypto.randomUUID(), text: trimmed }])
  running.set(true)

  try {
    try {
      await request('prompt.submit', { session_id: sid, text: trimmed })
    } catch (e) {
      // A mobile reconnect can outlive the gateway's in-memory runtime. This
      // exact rejection happens before prompt admission, so one retry is safe.
      if (!(e instanceof JsonRpcGatewayError) || e.code !== 4001 ||
          e.message !== 'session not found' || !persisted || !name || !current()) throw e
      const resumed = await request('session.resume', { session_id: persisted, profile: name })
      if (!current()) return
      liveSid = resumed.session_id
      storedId = resumed.stored_session_id ?? persisted
      registerSessionProfile(liveSid, name)
      registerSessionProfile(String(storedId), name)
      registerBusySessionProfile(liveSid, name)
      canonicalCache.set(name, { id: String(storedId), resolvedId: String(storedId) })
      await request('prompt.submit', { session_id: liveSid, text: trimmed })
    }
  } catch (e) {
    if (!current()) return
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
    await setSessionUnread(sid, false, profile)
  } catch {
    // non-fatal
  }
}

// ── streaming event handlers ────────────────────────────────────────────────

function ensureStreamingAssistant(): string | null {
  if (streamingAssistantId) return streamingAssistantId
  const id = crypto.randomUUID()
  streamingAssistantId = id
  items.set([...items.get(), { kind: 'assistant', id, text: '', streaming: true, error: '' }])
  return id
}

function ensureStreamingReasoning(): string {
  if (streamingReasoningId) return streamingReasoningId
  const id = crypto.randomUUID()
  streamingReasoningId = id
  items.set([...items.get(), { kind: 'reasoning', id, text: '', streaming: true }])
  return id
}

function patchAssistant(id: string, fn: (m: Extract<ChatItem, { kind: 'assistant' }>) => Extract<ChatItem, { kind: 'assistant' }>): void {
  items.set(items.get().map(m => (m.kind === 'assistant' && m.id === id ? fn(m) : m)))
}

function patchReasoning(id: string, fn: (m: Extract<ChatItem, { kind: 'reasoning' }>) => Extract<ChatItem, { kind: 'reasoning' }>): void {
  items.set(items.get().map(m => (m.kind === 'reasoning' && m.id === id ? fn(m) : m)))
}

function finishAssistant(id: string, finalText: string, errorText: string): void {
  items.set(
    items.get().flatMap(m => {
      if (m.kind !== 'assistant' || m.id !== id) return [m]
      const text = finalText || m.text
      const error = errorText
      if (!text.trim() && !error) return []
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
})

on('reasoning.delta', e => {
  if (e.session_id !== liveSid) return
  if (typeof e.payload?.text !== 'string') return
  const id = ensureStreamingReasoning()
  patchReasoning(id, m => ({ ...m, text: m.text + e.payload!.text }))
})

// Non-streaming providers ship the whole reasoning block at once.
on('reasoning.available', e => {
  if (e.session_id !== liveSid) return
  const text = typeof e.payload?.text === 'string' ? e.payload.text : ''
  if (!text) return
  const id = ensureStreamingReasoning()
  patchReasoning(id, m => ({ ...m, text: m.text ? m.text + text : text, streaming: false }))
  streamingReasoningId = null
})

// `thinking.delta` is Hermes' wait/spinner line ("(°ロ°) mulling..."), not
// reasoning — the desktop app keeps it out of the transcript too.

on('message.delta', e => {
  if (e.session_id !== liveSid) return
  const text = e.payload?.text
  if (text == null) return
  sealStreamingReasoning()
  const id = ensureStreamingAssistant()
  if (id) patchAssistant(id, m => ({ ...m, text: m.text + text }))
})

/**
 * Close the bubble that is streaming now, so whatever comes next (a tool, the
 * next text segment) lands below it in order. An empty bubble is dropped.
 */
function sealStreamingAssistant(): void {
  sealStreamingReasoning()
  const id = streamingAssistantId
  if (!id) return
  streamingAssistantId = null
  items.set(
    items.get().flatMap(m => {
      if (m.kind !== 'assistant' || m.id !== id) return [m]
      if (!m.text.trim() && !m.error) return []
      return [{ ...m, streaming: false }]
    }),
  )
}

/** Close the streaming reasoning item so the next model call gets its own step. */
function sealStreamingReasoning(): void {
  const id = streamingReasoningId
  if (!id) return
  streamingReasoningId = null
  items.set(items.get().map(m => (m.kind === 'reasoning' && m.id === id ? { ...m, streaming: false } : m)))
}

on('message.interim', e => {
  if (e.session_id !== liveSid) return
  const p = e.payload
  const text = typeof p?.text === 'string' ? p.text : ''
  // Interim seals a segment. With already_streamed the text is already on
  // screen via message.delta — appending it again duplicated the answer.
  if (text && !p?.already_streamed) {
    const id = ensureStreamingAssistant()
    if (id) patchAssistant(id, m => ({ ...m, text: m.text.trim() ? m.text : text }))
  }
  sealStreamingAssistant()
})

const liveTools = new Map<string, { id: string; name: string; command: string }>()

on('tool.start', e => {
  if (e.session_id !== liveSid) return
  const p = e.payload
  if (!p) return
  sealStreamingAssistant()
  const name = p.name ?? 'tool'
  const args = (p.args ?? {}) as Record<string, unknown>
  const command = typeof args.command === 'string' ? args.command : ''
  const target = deliveryTargetFromCommand(command)
  const itemId = crypto.randomUUID()
  if (name === 'terminal' && target) {
    items.set([...items.get(), { kind: 'delivery', id: itemId, target, reply: '', pending: true }])
    liveTools.set(p.tool_id, { id: itemId, name, command })
    return
  }
  items.set([...items.get(), {
    kind: 'tool', id: itemId, name,
    context: typeof p.context === 'string' ? p.context : '',
    summary: '', durationS: null, done: false,
    labels: Array.isArray(p.labels) ? p.labels : null,
  }])
  liveTools.set(p.tool_id, { id: itemId, name, command })
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
  if (t.name === 'terminal' && deliveryTargetFromCommand(t.command)) {
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
        summary: p.summary ?? m.summary,
        labels: m.labels ?? (Array.isArray(p.labels) ? p.labels : null),
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
  sealStreamingReasoning()
  // A turn that ended without tool.complete for every call (interrupt, raced
  // finish) must not leave the activity row saying "Trabajando…" forever.
  items.set(items.get().map(m => (m.kind === 'tool' && !m.done ? { ...m, done: true } : m)))
  const p = e.payload
  const status = p?.status
  const finalText = typeof p?.text === 'string' ? p.text : ''
  const errorText = status === 'error' ? (typeof p?.error === 'string' ? p.error : t('common.error')) : ''
  let id = streamingAssistantId
  if (!id && finalText.trim()) {
    // The last segment was sealed (tool / interim): the final answer only
    // gets its own bubble when it is not the text already shown.
    const all = items.get()
    const turnStart = all.findLastIndex(m => m.kind === 'user')
    const shown = all.slice(turnStart + 1).some(m => m.kind === 'assistant' && m.text.trim() === finalText.trim())
    if (!shown) id = ensureStreamingAssistant()
  }
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
  const text = String(e.payload?.message ?? t('common.error'))
  items.set([...items.get(), { kind: 'error', id: crypto.randomUUID(), text }])
  running.set(false)
})

// ── resync after a reconnect / return to the app ─────────────────────────────
//
// Hermes only streams a chat's events to sockets that joined it with a session
// call. When the phone drops the socket (screen off, app switch) and reconnects,
// the new socket is not in that chat anymore: the reply keeps happening on the
// server but never reaches the screen, and "running" never clears. Re-resume
// the stored session to rejoin it and repaint what was missed — in place, no
// blank list.

let pendingResync = false
let resyncing = false

export async function resyncChat(): Promise<void> {
  const name = profile
  const stored = storedId
  const generation = openGeneration
  if (!name || !stored || resyncing) return
  resyncing = true
  try {
    const res = await request('session.resume', { session_id: String(stored), profile: name })
    if (generation !== openGeneration || profile !== name) return
    liveSid = res.session_id
    storedId = res.stored_session_id ?? stored
    registerSessionProfile(liveSid, name)
    registerSessionProfile(String(storedId), name)
    registerBusySessionProfile(liveSid, name)
    historyOffset = res.messages?.length ?? 0
    streamingAssistantId = null
    liveTools.clear()
    items.set(normalizeHistory(res.messages ?? []))
    running.set(false)
    if (res.inflight) hydrateInflight(res.inflight)
    if (res.running) running.set(true)
  } catch {
    // the next reconnect or return to the app tries again
  } finally {
    resyncing = false
  }
}

connectionState.listen(state => {
  if (state !== 'open') {
    if (profile) pendingResync = true
    return
  }
  if (!pendingResync) return
  pendingResync = false
  void resyncChat()
})

// Back from the background with a turn still "running": the socket may have
// survived but missed events while the app was frozen — check the real state.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && profile && running.get()) void resyncChat()
  })
}
