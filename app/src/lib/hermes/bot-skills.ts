// Per-bot skills over the gateway: list + toggle via profiles.describe /
// profiles.configure (profile-scoped, so each bot manages its own skills
// dir), and SKILL.md view/edit via learning.detail / learning.edit (which
// resolve against the server's skills roots — a profile-isolated skill that
// the server cannot resolve reports `ok: false` and the UI shows it read-only).

import { request } from './connection'
import type {
  LearningDetailResult,
  LearningMutationResult,
  ProfilesConfigureParams,
  ProfilesDescribeResult,
} from './vendor/gateway-contract.generated'

export interface BotSkill {
  name: string
  enabled: boolean
}

/** The bot's installed skills with their enabled state (profiles.describe). */
export async function listBotSkills(profile: string): Promise<BotSkill[]> {
  const described = await request('profiles.describe', { name: profile })
  const rows = (described as ProfilesDescribeResult).skills ?? []
  return rows
    .map(row => ({ name: row.name, enabled: row.enabled !== false }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Toggle skills by writing the FULL disabled list (skills.disabled in the
 * profile's config). `keep` = the skills that stay enabled; everything else
 * known to the bot gets disabled.
 */
export async function setEnabledBotSkills(
  profile: string,
  skills: BotSkill[],
): Promise<void> {
  const disabled = skills.filter(s => !s.enabled).map(s => s.name)
  const params: ProfilesConfigureParams = { name: profile, disabled_skills: disabled }
  const result = await request('profiles.configure', params)
  if (!result?.ok) throw new Error(result?.confirm_message ?? 'configure failed')
}

export interface SkillContent {
  ok: boolean
  /** Failure reason when ok is false (e.g. a profile-isolated skill). */
  message?: string
  content: string
}

/** SKILL.md content for the edit prefill (learning.detail). */
export async function readSkillContent(name: string): Promise<SkillContent> {
  const detail = await request('learning.detail', { id: name })
  const result = detail as LearningDetailResult
  return { ok: Boolean(result.ok), message: result.message ?? undefined, content: result.content ?? '' }
}

/** Rewrite a SKILL.md (learning.edit). */
export async function writeSkillContent(name: string, content: string): Promise<void> {
  const result = (await request('learning.edit', { id: name, content })) as LearningMutationResult
  if (!result?.ok) throw new Error(result?.message ?? 'edit failed')
}
