import { atom } from 'nanostores'
import { ConsoleClient, type ConsoleFrame } from '../lib/console'

export type ChatMsg = {
  role: 'user' | 'assistant'
  text: string
  pending?: boolean
}

export const messages = atom<ChatMsg[]>([])
export const thinking = atom<boolean>(false)
export const pendingConfirm = atom<string>('')

let client: ConsoleClient | null = null
let currentProfile: string | null = null

export function chatProfile(): string | null {
  return currentProfile
}

export async function connectChat(profile: string): Promise<void> {
  if (client) client.close()
  client = new ConsoleClient()
  currentProfile = profile
  messages.set([])
  pendingConfirm.set('')
  client.on(handleFrame)
  await client.connect(profile)
}

export function disconnectChat(): void {
  client?.close()
  client = null
  currentProfile = null
}

export function sendMessage(text: string): void {
  if (!client) return
  const trimmed = text.trim()
  if (!trimmed) return

  const list = messages.get()
  messages.set([
    ...list,
    { role: 'user', text: trimmed },
    { role: 'assistant', text: '', pending: true },
  ])
  thinking.set(true)
  client.send(trimmed)
}

export function cancelMessage(): void {
  client?.cancel()
}

export function confirmPending(): void {
  const cmd = pendingConfirm.get()
  if (!cmd) return
  pendingConfirm.set('')
  thinking.set(true)
  client?.confirm(cmd)
}

function handleFrame(f: ConsoleFrame): void {
  const list = messages.get()

  if (f.type === 'output' && typeof f.data === 'string') {
    const data = f.data
    const next = replaceLastAssistant(list, (m) => ({
      ...m,
      text: m.text ? `${m.text}\n${data}` : data,
      pending: true,
    }))
    messages.set(next)
    return
  }

  if (f.type === 'error') {
    const next = replaceLastAssistant(list, (m) => ({
      ...m,
      text: m.text ? `${m.text}\n⚠ ${String(f.message ?? 'error')}` : `⚠ ${String(f.message ?? 'error')}`,
      pending: false,
    }))
    messages.set(next)
    thinking.set(false)
    return
  }

  if (f.type === 'complete') {
    const next = replaceLastAssistant(list, (m) => ({ ...m, pending: false }))
    messages.set(next)
    thinking.set(false)
    return
  }

  if (f.type === 'confirm_required') {
    thinking.set(false)
    pendingConfirm.set(String(f.command ?? ''))
    return
  }

  if (f.type === 'closed') {
    thinking.set(false)
  }
}

function replaceLastAssistant(
  list: ChatMsg[],
  fn: (m: ChatMsg) => ChatMsg,
): ChatMsg[] {
  const idx = list.length - 1
  if (idx < 0 || list[idx].role !== 'assistant') return list
  return list.map((m, i) => (i === idx ? fn(m) : m))
}
