export function scopedQuery(profile?: string | null, params: Record<string, string> = {}): string {
  const q = new URLSearchParams(params)
  if (profile) q.set('profile', profile)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
