import { apiFetch } from '../../api'
import { scopedQuery } from './api'
import type { Connector, ConfigField } from './types'

export interface PlatformEnvVar {
  key: string
  required: boolean
  is_set: boolean
  redacted_value: string | null
  value: string | null
  description: string | null
  prompt: string | null
  help: string | null
  url: string | null
  is_password: boolean
  is_list: boolean
  advanced: boolean
}

export interface MessagingPlatform {
  id: string
  name: string
  description: string
  docs_url: string | null
  enabled: boolean
  configured: boolean
  gateway_running: boolean
  state: string
  error_code: string | null
  error_message: string | null
  updated_at: string | null
  home_channel: { chat_id: string; name: string; platform: string; thread_id?: string } | null
  env_vars: PlatformEnvVar[]
  ingress_url: string | null
  whatsapp_setup?: { mode: string; allowed_users_set: boolean; home_channel_set: boolean }
}

export interface MessagingPayload {
  env_path: string
  gateway_start_command: string
  platforms: MessagingPlatform[]
}

export interface MessagingData {
  payload: MessagingPayload
}

export interface MessagingTestResult {
  ok: boolean
  state: string
  message: string
  auth_posture?: string
}

export interface TelegramOnboarding {
  pairing_id: string
  status: 'waiting' | 'ready'
  suggested_username?: string
  deep_link?: string
  qr_payload?: string
  bot_username?: string
  owner_user_id?: string
  expires_at?: string
}

export interface WhatsappOnboarding {
  pairing_id: string
  status: string
  qr_payload: string | null
  expires_at: string | null
  mode: string
  allowed_users: string
  account_id: string | null
  account_name: string | null
  account_phone: string | null
  error: string | null
}

export interface PairingUser {
  platform: string
  user_id: string
  user_name?: string
  request_id?: string
  age_minutes?: number
}

export interface PairingPayload {
  pending: PairingUser[]
  approved: PairingUser[]
}

const statusFor = (p: MessagingPlatform): Connector['status'] => {
  if (p.state === 'connected') return 'connected'
  if (p.state === 'fatal' || p.state === 'startup_failed') return 'error'
  if (p.state === 'not_configured') return 'needs_setup'
  return 'available'
}

export async function listMessaging(profile?: string): Promise<{ connectors: Connector[]; data: MessagingData }> {
  const payload = await apiFetch<MessagingPayload>(`/api/messaging/platforms${scopedQuery(profile)}`)
  const platforms = payload?.platforms ?? []
  return {
    connectors: platforms.map(p => ({
      id: p.id,
      family: 'messaging',
      name: p.name,
      description: p.description ?? '',
      icon: null,
      category: null,
      status: statusFor(p),
      configurable: true,
      auth: 'fields',
    })),
    data: { payload },
  }
}

export function updatePlatform(
  id: string,
  body: { enabled?: boolean; env?: Record<string, string>; clear_env?: string[] },
  profile?: string,
): Promise<{ ok: boolean; platform: string; hot_served: boolean }> {
  return apiFetch(`/api/messaging/platforms/${encodeURIComponent(id)}${scopedQuery(profile)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function testPlatform(id: string, profile?: string): Promise<MessagingTestResult> {
  return apiFetch(`/api/messaging/platforms/${encodeURIComponent(id)}/test${scopedQuery(profile)}`, { method: 'POST' })
}

export function gatewayStart(profile?: string): Promise<{ ok: boolean; pid: number; name: string }> {
  return apiFetch(`/api/gateway/start${scopedQuery(profile)}`, { method: 'POST' })
}

export function gatewayStop(profile?: string): Promise<{ ok: boolean; pid: number; name: string }> {
  return apiFetch(`/api/gateway/stop${scopedQuery(profile)}`, { method: 'POST' })
}

export function gatewayRestart(profile?: string): Promise<{ ok: boolean; pid: number; name: string }> {
  return apiFetch(`/api/gateway/restart${scopedQuery(profile)}`, { method: 'POST' })
}

export function startTelegramOnboarding(botName: string, profile?: string): Promise<TelegramOnboarding> {
  return apiFetch(`/api/messaging/telegram/onboarding/start${scopedQuery(profile)}`, {
    method: 'POST',
    body: JSON.stringify({ bot_name: botName }),
  })
}

export function getTelegramOnboarding(pairingId: string): Promise<TelegramOnboarding> {
  return apiFetch(`/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}`)
}

export function applyTelegramOnboarding(
  pairingId: string,
  allowedUserIds: string[],
  profile?: string,
): Promise<{ ok: boolean; platform: string; bot_username: string; needs_restart: boolean }> {
  return apiFetch(`/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}/apply${scopedQuery(profile)}`, {
    method: 'POST',
    body: JSON.stringify({ allowed_user_ids: allowedUserIds }),
  })
}

export function cancelTelegramOnboarding(pairingId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/messaging/telegram/onboarding/${encodeURIComponent(pairingId)}`, { method: 'DELETE' })
}

export function startWhatsappOnboarding(mode: 'bot' | 'self-chat', profile?: string): Promise<WhatsappOnboarding> {
  return apiFetch(`/api/messaging/whatsapp/onboarding/start${scopedQuery(profile)}`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  })
}

export function getWhatsappOnboarding(pairingId: string): Promise<WhatsappOnboarding> {
  return apiFetch(`/api/messaging/whatsapp/onboarding/${encodeURIComponent(pairingId)}`)
}

export function applyWhatsappOnboarding(
  pairingId: string,
  mode: 'bot' | 'self-chat',
  profile?: string,
): Promise<{ ok: boolean; platform: string; needs_restart: boolean }> {
  return apiFetch(`/api/messaging/whatsapp/onboarding/${encodeURIComponent(pairingId)}/apply${scopedQuery(profile)}`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  })
}

export function cancelWhatsappOnboarding(pairingId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/messaging/whatsapp/onboarding/${encodeURIComponent(pairingId)}`, { method: 'DELETE' })
}

export function getPairing(profile?: string): Promise<PairingPayload> {
  return apiFetch(`/api/pairing${scopedQuery(profile)}`)
}

export function approvePairing(
  platform: string,
  requestId: string,
  profile?: string,
): Promise<{ ok: boolean }> {
  return apiFetch('/api/pairing/approve', {
    method: 'POST',
    body: JSON.stringify({ platform, request_id: requestId, ...(profile ? { profile } : {}) }),
  })
}

export function revokePairing(platform: string, userId: string, profile?: string): Promise<{ ok: boolean }> {
  return apiFetch('/api/pairing/revoke', {
    method: 'POST',
    body: JSON.stringify({ platform, user_id: userId, ...(profile ? { profile } : {}) }),
  })
}

/**
 * Config form for a platform. Only allowlists (`is_list`) echo their value;
 * everything else is a secret: show `is_set`/redacted, never the stored value.
 */
export function platformConfigFields(p: MessagingPlatform): ConfigField[] {
  return p.env_vars
    .filter(v => !v.advanced)
    .map(v => {
      const help = v.description ?? v.prompt ?? v.help ?? ''
      if (v.is_list) {
        return { kind: 'list', key: v.key, label: v.key, value: v.value ?? '', help, required: v.required }
      }
      return {
        kind: 'secret',
        key: v.key,
        label: v.key,
        isSet: v.is_set,
        redacted: v.redacted_value ?? undefined,
        help,
        url: v.url ?? undefined,
        required: v.required,
      }
    })
}
