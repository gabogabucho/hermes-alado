// Shapes mirrored from Hermes at bf0203a (cron/jobs.py, web_routers/cron.py,
// web_routers/ops.py, cron/blueprint_catalog.py) and the desktop client types
// (apps/desktop/src/types/hermes.ts). The backend stores per-job records
// loosely, so every field is optional-friendly.

export type CronJobSchedule = {
  kind?: string
  expr?: string
  minutes?: number
  run_at?: string
  display?: string
  [key: string]: unknown
}

export interface CronJob {
  id: string
  name?: string | null
  prompt?: string | null
  enabled: boolean
  state?: string | null
  schedule?: CronJobSchedule | string | null
  schedule_display?: string | null
  last_run_at?: string | number | null
  next_run_at?: string | number | null
  last_status?: string | null
  last_error?: string | null
  no_agent?: boolean
  script?: string | null
  skills?: string[]
  deliver?: string | null
  [key: string]: unknown
}

/** A cron run row: agent sessions plus script-only output docs, both projected
 *  to /api/sessions shape by the backend (`_list_cron_job_runs_sync`). */
export interface CronRun {
  id: string
  title?: string | null
  preview?: string | null
  started_at?: number
  last_active?: number
  ended_at?: number | null
  is_active?: boolean
  scheduler_owned?: boolean
  source?: string
  status?: string
  [key: string]: unknown
}

export interface WebhookRoute {
  name: string
  description: string
  events: string[]
  deliver: string
  deliver_only: boolean
  prompt: string
  script: string
  skills: string[]
  created_at: string | null
  url: string
  secret_set: boolean
  enabled: boolean
}

export interface WebhooksResponse {
  enabled: boolean
  base_url: string
  subscriptions: WebhookRoute[]
}

export interface BlueprintField {
  name: string
  type: 'enum' | 'text' | 'time' | 'weekdays'
  label: string
  default: string | null
  options: string[]
  optional: boolean
  strict?: boolean
  help: string
}

export interface Blueprint {
  key: string
  title: string
  description: string
  category: string
  tags: string[]
  fields: BlueprintField[]
  command: string
  appUrl: string
  source?: 'builtin' | 'plugin'
  plugin?: string | null
  schedule?: string
  scheduleHuman?: string
}
