import { useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { useBack } from '../../app/transition'
import { EmptyState } from '../../ui/EmptyState'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import { FileTypeIcon } from './FileTypeIcon'
import { FilePreviewSheet } from './FilePreviewSheet'
import { fileKind, formatModified, formatSize, isPreviewable, useBreadcrumbs } from './format'
import { libraryError, libraryLoading, listing, loadFolder, uploadIntoFolder } from './store'
import type { ManagedEntry } from './types'
import './index.css'

export function LibraryPage() {
  const back = useBack('/')
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
    <PageShell
      title="Biblioteca"
      onBack={back}
      actions={
        <IconButton
          icon="paperclip"
          variant="glass"
          label="Subir archivo"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        />
      }
    >
      <input ref={fileInput} type="file" hidden onChange={e => void onUpload(e.target.files?.[0])} />

      {crumbs.length > 1 && (
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
      )}

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
        <EmptyState
          icon={<Icon name="folder" size={30} />}
          title="Carpeta vacía"
          text="Subí un archivo para que el bot pueda leerlo."
          actionLabel="Subir archivo"
          onAction={() => fileInput.current?.click()}
        />
      )}

      {!isLoading && !error && current && current.entries.length > 0 && (
        <Section>
          {current.entries.map(entry => (
            <Row
              key={entry.path}
              leading={
                <span className="row-icon row-icon--neutral">
                  <FileTypeIcon kind={fileKind(entry)} size={18} />
                </span>
              }
              title={entry.name}
              subtitle={
                entry.is_directory
                  ? 'Carpeta'
                  : `${formatSize(entry.size)}${entry.mtime !== null && entry.mtime !== undefined ? ` · ${formatModified(entry.mtime)}` : ''}`
              }
              onClick={() => onOpenEntry(entry)}
            />
          ))}
        </Section>
      )}

      <FilePreviewSheet entry={preview} onClose={() => setPreview(null)} />
    </PageShell>
  )
}
