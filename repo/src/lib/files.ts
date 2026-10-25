import { apiUrl } from './config'
import { getSessionToken } from './hermes/session-token'

export async function uploadFile(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const name = file.name || 'archivo'
  form.append('path', `uploads/${name}`)
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

  const body = await res.json()
  return String(body?.path ?? body?.entry?.path ?? name)
}
