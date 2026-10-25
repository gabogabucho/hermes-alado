import { useMemo } from 'react'

export function formatSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toLocaleString('es-AR', { maximumFractionDigits: 1 })} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`
  return `${(mb / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} GB`
}

const dateTime = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatModified(mtime: number | null | undefined): string {
  if (mtime === null || mtime === undefined) return '—'
  const date = new Date(mtime * 1000)
  if (Number.isNaN(date.getTime())) return '—'
  return dateTime.format(date)
}

export type FileKind = 'folder' | 'image' | 'pdf' | 'text' | 'markdown' | 'code' | 'audio' | 'video' | 'archive' | 'file'

const CODE_EXTENSIONS = new Set([
  'c', 'cpp', 'css', 'csv', 'go', 'h', 'hpp', 'html', 'java', 'js', 'json', 'jsx',
  'kt', 'lua', 'mjs', 'py', 'rb', 'rs', 'sh', 'sql', 'toml', 'ts', 'tsx', 'xml',
  'yaml', 'yml', 'zsh', 'ini', 'conf', 'graphql',
])

const ARCHIVE_EXTENSIONS = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar'])

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'opus'])

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mkv', 'mov', 'avi'])

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot === -1 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function fileKind(
  entry: { name: string; is_directory: boolean; mime_type?: string | null },
): FileKind {
  if (entry.is_directory) return 'folder'
  const mime = (entry.mime_type ?? '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  const ext = extensionOf(entry.name)
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (mime.startsWith('text/')) return 'text'
  return 'file'
}

/** Whether the browser can preview the entry inline. */
export function isPreviewable(kind: FileKind): boolean {
  return kind === 'image' || kind === 'pdf' || kind === 'text' || kind === 'markdown' || kind === 'code'
}

export function useBreadcrumbs(path: string): { label: string; path: string | undefined }[] {
  return useMemo(() => {
    const parts = path.split(/[/\\]/).filter(Boolean)
    const crumbs: { label: string; path: string | undefined }[] = [
      { label: 'Inicio', path: undefined },
    ]
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      crumbs.push({ label: part, path: acc })
    }
    return crumbs
  }, [path])
}
