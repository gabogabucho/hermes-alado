import { atom } from 'nanostores'
import { on, onRequest } from '../../lib/hermes/connection'

/**
 * Server→client requests (approval / clarify / sudo / secret) — shared by the
 * chat view (cards) and Home (banner for other-session requests). Lives in its
 * own module so the `onRequest` handler registers on first import, independent
 * of whether a chat is open, and so `home` and `chat` can both read it without
 * a cycle.
 */

export interface ClarifyQ {
  qid: string
  question: string
  choices: string[]
}

export type ServerRequestCard =
  | {
      kind: 'approval'
      id: string
      sessionId: string
      command: string
      description: string
      choices: string[]
      respond: (r: Record<string, unknown>) => void
    }
  | {
      kind: 'clarify'
      id: string
      sessionId: string
      questions: ClarifyQ[]
      respond: (r: Record<string, unknown>) => void
    }

export const requests = atom<ServerRequestCard[]>([])

// session id → profile name, so a request from a session we opened can resolve
// which bot asked. Populated by the chat store on every open/resume.
const sessionToProfile = new Map<string, string>()

export function registerSessionProfile(sid: string, profile: string): void {
  sessionToProfile.set(sid, profile)
}

export function profileForSession(sid: string): string | null {
  return sessionToProfile.get(sid) ?? null
}

export function resolveRequest(card: ServerRequestCard, result: Record<string, unknown>): void {
  card.respond(result)
  requests.set(requests.get().filter(r => r.id !== card.id))
}

function addRequest(card: ServerRequestCard): void {
  requests.set([...requests.get().filter(r => r.id !== card.id), card])
}

onRequest(req => {
  const params = req.params as Record<string, unknown>
  const sessionId = typeof params.session_id === 'string' ? params.session_id : ''

  if (req.method === 'approval') {
    addRequest({
      kind: 'approval',
      id: req.id,
      sessionId,
      command: typeof params.command === 'string' ? params.command : '',
      description: typeof params.description === 'string' ? params.description : '',
      choices: Array.isArray(params.choices) ? (params.choices as string[]) : [],
      respond: req.respond,
    })
    return true
  }

  if (req.method === 'clarify') {
    const questions = Array.isArray(params.questions)
      ? (params.questions as { qid: string; question: string; choices?: string[] }[]).map(q => ({
          qid: q.qid,
          question: q.question,
          choices: Array.isArray(q.choices) ? q.choices : [],
        }))
      : []
    addRequest({ kind: 'clarify', id: req.id, sessionId, questions, respond: req.respond })
    return true
  }

  if (req.method === 'sudo' || req.method === 'secret') {
    req.respond({ value: '' })
    return true
  }

  // Anything else: decline so the vendored default answers -32601.
  return false
})

on('request.cancel', e => {
  const id = e.payload?.id
  if (typeof id === 'string') requests.set(requests.get().filter(r => r.id !== id))
})
