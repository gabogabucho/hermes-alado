import { atom } from 'nanostores'
import { getBackendUrl, setBackendUrl } from '../lib/config'

export const backendUrl = atom<string>(getBackendUrl())

export function updateBackendUrl(url: string): void {
  setBackendUrl(url)
  backendUrl.set(getBackendUrl())
}
