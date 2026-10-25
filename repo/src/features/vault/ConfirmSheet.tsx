import type { ReactNode } from 'react'
import { Sheet } from '../../ui/Sheet'

/** Bottom-sheet confirmation before destructive actions (delete, detener). */
export function ConfirmSheet({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  danger = true,
  busy = false,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="confirm-sheet-body">{body}</div>
      <div className="confirm-sheet-actions">
        <button
          className={`btn btn-block${danger ? ' btn-danger' : ' btn-primary'}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? '…' : confirmLabel}
        </button>
        <button className="btn btn-block" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Sheet>
  )
}
