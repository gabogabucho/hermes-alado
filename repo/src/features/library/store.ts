import { atom } from 'nanostores'
import { apiFetch } from '../../lib/api'
import { apiUrl } from '../../lib/config'
import { getSessionToken } from '../../lib/hermes/session-token'
import type { ManagedListing } from './types'

export const listing = atom<ManagedListing | null>(null)
export const libraryLoading = atom<boolean>(false)
export const libraryError = atom<string>('')

export async function loadFolder(path: string | undefined): Promise<void> {
  libraryLoading.set(true)
  libraryError.set('')
  try {
    const query = path ? `?path=${encodeURIComponent(path)}` : ''
    const res = await apiFetch<ManagedListing>(`/api/files${query}`)
    listing.set(res)
  } catch (e) {
    libraryError.set(e instanceof Error ? e.message : 'No se pudo abrir la carpeta')
  } finally {
    libraryLoading.set(false)
  }
}

/** Multipart upload into the folder being browsed (same endpoint as
 *  `lib/files.ts`, but targeting the current folder instead of `uploads/`). */
export async function uploadIntoFolder(file: File, folder: string): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  const name = file.name || 'archivo'
  form.append('path', `${folder.replace(/[/\\]+$/, '')}/${name}`)
  form.append('overwrite', 'true')

  const token = getSessionToken()
  const res = await fetch(apiUrl('/api/files/upload-stream'), {
    method: 'POST',
    credentials: 'include',
    body: form,
    headers: token ? { 'X-Hermes-Session-Token': token } : undefined,
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json())?.detail ?? detail
    } catch {
      // non-JSON error
    }
    throw new Error(String(detail))
  }
}

/** Authenticated URL for a direct browser download/stream (`auth_middleware`
 *  accepts the session token as `?token=` on this route). */
export function fileDownloadUrl(path: string): string {
  const base = `${apiUrl('/api/files/download')}?path=${encodeURIComponent(path)}`
  const token = getSessionToken()
  return token ? `${base}&token=${encodeURIComponent(token)}` : base
}

export async function fetchFileBlob(path: string): Promise<Blob> {
  const token = getSessionToken()
  const res = await fetch(`${apiUrl('/api/files/download')}?path=${encodeURIComponent(path)}`, {
    credentials: 'include',
    headers: token ? { 'X-Hermes-Session-Token': token } : undefined,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      detail = (await res.json())?.detail ?? detail
    } catch {
      // non-JSON error
    }
    throw new Error(String(detail))
  }
  return res.blob()
}
