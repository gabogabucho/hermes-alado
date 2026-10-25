import { describe, expect, it } from 'vitest'
import { base64UrlToBytes, defaultPrefs } from './push'

describe('base64UrlToBytes', () => {
  it('decodes padded and unpadded base64url VAPID keys', () => {
    // "hello" en base64url sin padding
    const raw = base64UrlToBytes('aGVsbG8')
    expect(Array.from(raw)).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f])
    // misma secuencia con padding y caracteres url-safe
    expect(Array.from(base64UrlToBytes('aGVsbG8='))).toEqual([0x68, 0x65, 0x6c, 0x6c, 0x6f])
    expect(Array.from(base64UrlToBytes('_-8'))).toEqual([0xff, 0xef])
  })

  it('decodes the fixed P-256 prefix byte of a real VAPID key shape', () => {
    // 0x04 || 64 bytes (clave pública sin comprimir)
    const bytes = Array.from(base64UrlToBytes('BA'))
    expect(bytes[0]).toBe(0x04)
  })
})

describe('defaultPrefs', () => {
  it('returns both toggles on by default', () => {
    expect(defaultPrefs()).toEqual({ termina: true, necesita: true })
  })
})
