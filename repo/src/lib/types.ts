export type Profile = {
  name: string
  path?: string
  is_default?: boolean
  model?: string | null
  provider?: string | null
  has_env?: boolean
  skill_count?: number
  gateway_running?: boolean
  description?: string
  description_auto?: boolean
  display_name?: string
  has_alias?: boolean
}

export type Session = {
  session_id?: string
  id?: string
  title?: string
  created_at?: number
  started_at?: number
  last_active?: number
  ended_at?: number | null
  is_active?: boolean
  archived?: boolean
  pinned?: boolean
  profile?: string
  message_count?: number
  source?: string
  [key: string]: unknown
}

export type Message = {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  [key: string]: unknown
}

export type UserInfo = {
  user_id?: string
  email?: string
  display_name?: string
  provider?: string
  expires_at?: number
}

export type StatusPayload = {
  gateway?: {
    running?: boolean
    platforms?: unknown[]
    [key: string]: unknown
  }
  [key: string]: unknown
}
