// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
//
// Bot Desktop (Computadora) client over the gateway JSON-RPC connection —
// `display.*` (`tui_gateway/methods_display.py`). Every handler is
// `@_profile_scoped`: without the explicit `profile` the gateway answers for
// the launch home, so it is always passed, exactly like the desktop's
// `screen-connection.ts::displayRequest`.

import { wsUrl } from '../config'
import { request } from './connection'
import { displayWsUrl } from './display-core'
import type {
  DisplayLeaseResult,
  DisplayObserveResult,
  DisplayStatus,
  DisplayThumbnailResult,
} from './vendor/gateway-contract.generated'

export { leaseHeldBy, parseGeometry, viewerHash } from './display-core'
export type { ScreenViewer } from './display-core'

/** Runtime + lease snapshot for one profile's screen. */
export function displayStatus(profile: string): Promise<DisplayStatus> {
  return request('display.status', { profile })
}

/** One JPEG grab of the screen (data_url null while stopped, or while a human
 *  holds the lease — `suppressed`). */
export function displayThumbnail(profile: string): Promise<DisplayThumbnailResult> {
  return request('display.thumbnail', { profile })
}

/** Start this profile's Xvnc + Xfce (idempotent); answers a fresh snapshot. */
export function displayStart(profile: string): Promise<DisplayStatus> {
  return request('display.start', { profile })
}

/** Mint a single-use 30 s ticket for `/api/display/ws` plus a server-minted
 *  viewer id. Re-present a previously minted id so a reconnect keeps the
 *  lease bound to this connection (foreign ids are silently replaced). */
export function displayObserve(profile: string, viewerId?: string): Promise<DisplayObserveResult> {
  return request('display.observe', viewerId ? { profile, viewer_id: viewerId } : { profile })
}

/** Human viewer takes control (last writer wins). */
export function leaseAcquire(profile: string, viewerId: string): Promise<DisplayLeaseResult> {
  return request('display.lease.acquire', { profile, viewer_id: viewerId })
}

/** Hand control back to the agent. Only the holder may release; the returned
 *  lease tells the truth. */
export function leaseRelease(profile: string, viewerId?: string): Promise<DisplayLeaseResult> {
  return request('display.lease.release', { profile, viewer_id: viewerId ?? null })
}

/** noVNC socket URL for a minted display ticket. */
export function screenWsUrl(ticket: string): string {
  return displayWsUrl(ticket, wsUrl('/api/display/ws'))
}
