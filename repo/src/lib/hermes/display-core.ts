// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
//
// Pure helpers for the Bot Desktop (Computadora) viewer — no React, no
// transport imports, so they are unit-testable in Node. The gateway names a
// lease holder by hash only (`tui_gateway/methods_display.py`), the RFB bridge
// ticket rides the query string as `display_ticket`
// (`hermes_cli/web_routers/display.py`).

import type { DisplayLease } from './vendor/gateway-contract.generated'

/** This window's identity for one attach: the server-minted id plus its
 *  lease-payload hash (the raw id is a capability and never travels). */
export interface ScreenViewer {
  id: string
  hash: string
}

const VIEWER_HASH_HEX = 12

/** `viewer_hash` as the lease broadcasts it: first 12 hex of sha256(viewer_id). */
export async function viewerHash(viewerId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(viewerId))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, VIEWER_HASH_HEX)
}

/** Does `viewer` (this window's attach) hold `lease`? */
export function leaseHeldBy(
  lease: DisplayLease | null | undefined,
  viewer: ScreenViewer | null | undefined,
): boolean {
  if (!lease || !viewer || lease.holder !== 'human') return false
  return lease.viewer_hash === viewer.hash
}

/**
 * The RFB WebSocket URL for a minted display ticket. The `/api/ws` credential
 * authenticated the RPC that minted it; the bridge authenticates on the
 * single-use ticket alone (query param `display_ticket` — the name on the
 * wire in `hermes_cli/web_routers/display.py`).
 */
export function displayWsUrl(ticket: string, base: string): string {
  const url = new URL(base)
  url.searchParams.set('display_ticket', ticket)
  return url.toString()
}

/** Xvnc geometry ("1440x900") → pixels; the default the runtime ships when the
 *  value is absent or unreadable (`tools/bot_desktop/runtime.py::geometry`). */
export function parseGeometry(geometry: string | null | undefined): { width: number; height: number } {
  const match = /^(\d+)x(\d+)$/.exec((geometry ?? '').trim())
  const width = match ? Number(match[1]) : 1440
  const height = match ? Number(match[2]) : 900
  return width > 0 && height > 0 ? { width, height } : { width: 1440, height: 900 }
}
