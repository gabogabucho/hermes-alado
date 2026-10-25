import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { IconButton } from '../../ui/IconButton'
import { Skeleton } from '../../ui/Skeleton'
import { FileTypeIcon } from './FileTypeIcon'
import { FilePreviewSheet } from './FilePreviewSheet'
import { fileKind, formatModified, formatSize, isPreviewable, useBreadcrumbs } from './format'
import { libraryError, libraryLoading, listing, loadFolder, uploadIntoFolder } from './store'
import type { ManagedEntry } from './types'
import './index.css'

export function LibraryPage() {
  const navigate = useNavigate()
  const current = useStore(listing)
  const loading = useStore(libraryLoading)
  const error = useStore(libraryError)
  const [preview, setPreview] = useState<ManagedEntry | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const currentPath = current?.path ?? ''
  const crumbs = useBreadcrumbs(currentPath)

  useEffect(() => {
    void loadFolder(undefined)
  }, [])

  async function onUpload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      await uploadIntoFolder(file, currentPath)
      await loadFolder(currentPath)
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'No se pudo subir el archivo')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function onOpenEntry(entry: ManagedEntry) {
    if (entry.is_directory) {
      void loadFolder(entry.path)
      return
    }
    if (isPreviewable(fileKind(entry))) setPreview(entry)
  }

  const isLoading = loading || (uploading && !loading)

  return (
    <div>
      <div className="subpage-header">
        <IconButton icon="back" label="Volver" onClick={() => navigate(-1)} />
        <span className="subpage-title">Biblioteca</span>
        <span className="spacer" />
        <IconButton
          icon="paperclip"
          label="Subir archivo"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        />
        <input
          ref={fileInput}
          type="file"
          hidden
          onChange={e => void onUpload(e.target.files?.[0])}
        />
      </div>

      <div className="breadcrumbs">
        {crumbs.map((crumb, i) => (
          <span key={i} className="breadcrumb">
            {i > 0 && <span className="faint"> / </span>}
            <button
              type="button"
              className={`breadcrumb-link${i === crumbs.length - 1 ? ' breadcrumb-link--current' : ''}`}
              onClick={() => void loadFolder(crumb.path)}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      {uploadError && <p className="error-text">{uploadError}</p>}

      {isLoading && (
        <div className="list">
          {[0, 1, 2, 3].map(i => (
            <span key={i} className="card">
              <Skeleton height={48} />
            </span>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="empty">
          <p className="error-text">{error}</p>
        </div>
      )}

      {!isLoading && !error && current && current.entries.length === 0 && (
        <div className="empty">
          <p className="muted">Carpeta vacía.</p>
        </div>
      )}

      {!isLoading && !error && current && current.entries.length > 0 && (
        <div className="list">
          {current.entries.map(entry => (
            <button
              key={entry.path}
              type="button"
              className="file-row"
              onClick={() => onOpenEntry(entry)}
            >
              <span className="file-row-icon">
                <FileTypeIcon kind={fileKind(entry)} />
              </span>
              <span className="file-row-body">
                <span className="file-row-name">{entry.name}</span>
                <span className="file-row-meta">
                  {entry.is_directory ? 'Carpeta' : formatSize(entry.size)}
                  {entry.mtime !== null && entry.mtime !== undefined && (
                    <> · {formatModified(entry.mtime)}</>
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <FilePreviewSheet entry={preview} onClose={() => setPreview(null)} />
    </div>
  )
}
