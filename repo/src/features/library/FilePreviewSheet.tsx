import { useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { Sheet } from '../../ui/Sheet'
import { Skeleton } from '../../ui/Skeleton'
import { fetchFileBlob, fileDownloadUrl } from './store'
import { fileKind, formatSize, isPreviewable } from './format'
import type { ManagedEntry } from './types'

function decodeDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function FilePreviewSheet({
  entry,
  onClose,
}: {
  entry: ManagedEntry | null
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [blobUrl, setBlobUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let revoked = ''
    let cancelled = false

    async function load() {
      if (!entry) return
      const kind = fileKind(entry)
      if (!isPreviewable(kind)) return
      setLoading(true)
      setError('')
      setText('')
      setBlobUrl('')
      try {
        if (kind === 'image' || kind === 'pdf') {
          const blob = await fetchFileBlob(entry.path)
          if (cancelled) return
          const url = URL.createObjectURL(blob)
          revoked = url
          setBlobUrl(url)
        } else {
          const res = await apiFetch<{ data_url?: string }>(
            `/api/files/read?path=${encodeURIComponent(entry.path)}`,
          )
          if (cancelled) return
          setText(res.data_url ? decodeDataUrl(res.data_url) : '')
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo abrir el archivo')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [entry])

  if (!entry) return null

  const kind = fileKind(entry)
  const previewable = isPreviewable(kind)
  const downloadUrl = fileDownloadUrl(entry.path)

  return (
    <Sheet open={Boolean(entry)} onClose={onClose} title={entry.name}>
      <div className="preview-sheet">
        <div className="preview-meta">
          <span className="faint">{formatSize(entry.size)}</span>
          <span className="spacer" />
          <a className="btn" href={downloadUrl} download={entry.name}>
            Descargar
          </a>
        </div>

        {loading && (
          <div className="preview-loading">
            <Skeleton height={200} />
          </div>
        )}

        {!loading && error && <p className="error-text">{error}</p>}

        {!loading && !error && kind === 'image' && blobUrl && (
          <img className="preview-image" src={blobUrl} alt={entry.name} />
        )}

        {!loading && !error && kind === 'pdf' && blobUrl && (
          <iframe className="preview-pdf" src={blobUrl} title={entry.name} />
        )}

        {!loading && !error && (kind === 'text' || kind === 'markdown' || kind === 'code') && (
          <pre className="preview-text">{text || '—'}</pre>
        )}

        {!loading && !error && !previewable && (
          <p className="muted">No hay vista previa para este tipo de archivo.</p>
        )}
      </div>
    </Sheet>
  )
}
