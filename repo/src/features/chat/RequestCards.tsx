import { useState } from 'react'
import { resolveRequest, type ClarifyQ, type ServerRequestCard } from './requests'

const APPROVAL_LABELS: Record<string, string> = {
  once: 'Permitir una vez',
  session: 'Esta sesión',
  always: 'Siempre',
  deny: 'Denegar',
}

function vibrate(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(10)
}

export function RequestCard({ card, bot }: { card: ServerRequestCard; bot: string }) {
  if (card.kind === 'approval') {
    return <ApprovalCard card={card} bot={bot} />
  }
  return <ClarifyCard card={card} bot={bot} />
}

function ApprovalCard({ card, bot }: { card: Extract<ServerRequestCard, { kind: 'approval' }>; bot: string }) {
  const [busy, setBusy] = useState(false)

  function answer(choice: string) {
    vibrate()
    setBusy(true)
    resolveRequest(card, { choice })
  }

  return (
    <div className="request-card">
      <div className="request-card-head">
        <span className="request-card-title">Aprobación</span>
        <span className="faint">{bot}</span>
      </div>
      {card.command && <div className="confirm-cmd">{card.command}</div>}
      {card.description && <p className="request-card-desc">{card.description}</p>}
      <div className="request-card-actions">
        {(card.choices.length ? card.choices : ['once', 'session', 'always', 'deny']).map(choice => (
          <button
            key={choice}
            className={`btn${choice === 'deny' ? ' btn-danger' : ' btn-primary'}`}
            disabled={busy}
            onClick={() => answer(choice)}
          >
            {APPROVAL_LABELS[choice] ?? choice}
          </button>
        ))}
      </div>
    </div>
  )
}

function ClarifyCard({ card, bot }: { card: Extract<ServerRequestCard, { kind: 'clarify' }>; bot: string }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  function submit() {
    setBusy(true)
    const result: Record<string, string | null> = {}
    for (const q of card.questions) result[q.qid] = answers[q.qid]?.trim() || null
    resolveRequest(card, { answers: result })
  }

  function cancel() {
    setBusy(true)
    resolveRequest(card, {})
  }

  return (
    <div className="request-card">
      <div className="request-card-head">
        <span className="request-card-title">Preguntas</span>
        <span className="faint">{bot}</span>
      </div>
      {card.questions.map(q => (
        <Question key={q.qid} q={q} value={answers[q.qid] ?? ''} onChange={v => setAnswers(a => ({ ...a, [q.qid]: v }))} />
      ))}
      <div className="request-card-actions">
        <button className="btn btn-primary" disabled={busy} onClick={submit}>
          Responder
        </button>
        <button className="btn" disabled={busy} onClick={cancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function Question({ q, value, onChange }: { q: ClarifyQ; value: string; onChange: (v: string) => void }) {
  return (
    <div className="clarify-q">
      <div className="clarify-q-text">{q.question}</div>
      {q.choices.length > 0 ? (
        <div className="clarify-chips">
          {q.choices.map(c => (
            <button
              key={c}
              className={`chip${value === c ? ' chip-selected' : ''}`}
              onClick={() => onChange(value === c ? '' : c)}
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <input
          className="input"
          style={{ marginTop: 6 }}
          placeholder="Tu respuesta…"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
