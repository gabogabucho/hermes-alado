import { atom } from 'nanostores'
import { on, request } from '../../lib/hermes/connection'

export type ChatMsg = {
  id: string
  role: 'user' | 'assistant'
  text: string
  pending?: boolean
}

export const messages = atom<ChatMsg[]>([])
export const thinking = atom<boolean>(false)

let currentSessionId: string | null = null

export function chatSessionId(): string | null {
  return currentSessionId
}

/** Open a fresh chat for a profile: `session.create` returns the live sid. */
export async function openChat(profile: string): Promise<void> {
  messages.set([])
  thinking.set(false)
  try {
    const res = await request('session.create', { profile })
    currentSessionId = res.session_id
  } catch (err) {
    messages.set([
      { id: crypto.randomUUID(), role: 'assistant', text: `⚠ No se pudo abrir el chat: ${errText(err)}` },
    ])
  }
}

export function closeChat(): void {
  currentSessionId = null
  messages.set([])
  thinking.set(false)
}

export async function sendMessage(text: string): Promise<void> {
  const sid = currentSessionId
  const trimmed = text.trim()
  if (!sid || !trimmed) return

  messages.set([...messages.get(), { id: crypto.randomUUID(), role: 'user', text: trimmed }])

  const pendingId = crypto.randomUUID()
  messages.set([...messages.get(), { id: pendingId, role: 'assistant', text: '', pending: true }])
  thinking.set(true)

  try {
    await request('prompt.submit', { session_id: sid, text: trimmed })
  } catch (err) {
    updateMessage(pendingId, m => ({
      ...m,
      text: m.text ? `${m.text}\n⚠ ${errText(err)}` : `⚠ ${errText(err)}`,
      pending: false,
    }))
    thinking.set(false)
  }
}

export async function stop(): Promise<void> {
  const sid = currentSessionId
  if (!sid) return
  try {
    await request('session.interrupt', { session_id: sid })
  } catch {
    // the turn may have already ended; ignore
  }
}

// --- gateway events (registered once) ---

on('message.delta', event => {
  const sid = currentSessionId
  if (!sid || event.session_id !== sid) return
  const text = event.payload?.text
  if (typeof text === 'string' && text) {
    appendToLastAssistant(text)
  }
})

on('message.complete', event => {
  const sid = currentSessionId
  if (!sid || event.session_id !== sid) return
  const p = event.payload
  const final = typeof p?.text === 'string' ? p.text : null
  const errorText = typeof p?.error === 'string' ? p.error : p?.status === 'error' ? 'Error' : null
  finalizeLastAssistant(final, errorText)
  thinking.set(false)
})

on('error', event => {
  const sid = currentSessionId
  if (sid && event.session_id && event.session_id !== sid) return
  appendInlineError(String(event.payload?.message ?? 'Error'))
  thinking.set(false)
})

// --- helpers ---

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function updateMessage(id: string, fn: (m: ChatMsg) => ChatMsg): void {
  messages.set(messages.get().map(m => (m.id === id ? fn(m) : m)))
}

function appendToLastAssistant(text: string): void {
  messages.set(replaceLastAssistant(messages.get(), m => ({ ...m, text: m.text + text, pending: true })))
}

function appendInlineError(text: string): void {
  messages.set(replaceLastAssistant(messages.get(), m => ({ ...m, text: m.text ? `${m.text}\n⚠ ${text}` : `⚠ ${text}`, pending: false })))
}

function finalizeLastAssistant(finalText: string | null, errorText: string | null): void {
  messages.set(
    replaceLastAssistant(messages.get(), m => {
      let text = finalText ?? m.text
      if (errorText) text = text ? `${text}\n⚠ ${errorText}` : `⚠ ${errorText}`
      return { ...m, text, pending: false }
    }),
  )
}

function replaceLastAssistant(list: ChatMsg[], fn: (m: ChatMsg) => ChatMsg): ChatMsg[] {
  const idx = list.length - 1
  if (idx < 0 || list[idx].role !== 'assistant') return list
  return list.map((m, i) => (i === idx ? fn(m) : m))
}
