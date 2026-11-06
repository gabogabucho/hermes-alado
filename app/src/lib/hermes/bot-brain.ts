// Per-bot "brain" selector: auto (fast ↔ thinking) / fast / smart, backed by
// the server's LiteLLM router (http://127.0.0.1:4000/v1, Alado-exclusive).
//
// Two layers, honestly separated:
// 1. INTENT always persists in the bot's ui_meta['hermes-bots'].brain via
//    `profiles.configure` (works on any gateway, survives router downtime).
// 2. APPLY pins the profile's model to the router provider (PUT
//    /api/profiles/<name>/model) when the server actually exposes a provider
//    whose catalog contains auto+fast+smart — detected from
//    /api/model/options, so it follows whatever slug the server wired.
//    No router provider → the choice stays saved and the UI says so.

import { apiFetch } from '../api'
import type { ProfileLookPatch } from './profile-edit'

export type BrainChoice = 'auto' | 'fast' | 'smart'

export const BRAIN_CHOICES: BrainChoice[] = ['auto', 'fast', 'smart']

interface ModelOptionProvider {
  models?: Array<string | { id?: string; name?: string }>
  name?: string
  slug: string
}

/** The provider wired to the Alado router: its catalog has auto+fast+smart. */
export function detectRouterProvider(
  providers: ModelOptionProvider[],
): ModelOptionProvider | null {
  const wanted = new Set(BRAIN_CHOICES)
  return (
    providers.find(provider => {
      const models = new Set(
        (provider.models ?? [])
          .map(m => (typeof m === 'string' ? m : String(m?.id ?? m?.name ?? '')))
          .filter(Boolean),
      )
      for (const need of wanted) if (!models.has(need)) return false
      return true
    }) ?? null
  )
}

export async function fetchModelOptions(profile: string): Promise<ModelOptionProvider[]> {
  const res = await apiFetch<{ providers?: ModelOptionProvider[] }>(
    `/api/model/options?profile=${encodeURIComponent(profile)}`,
  )
  return res.providers ?? []
}

export function isBrainChoice(value: unknown): value is BrainChoice {
  return typeof value === 'string' && (BRAIN_CHOICES as string[]).includes(value)
}

export interface BrainSaveResult {
  /** Intent persisted in ui_meta. */
  persisted: boolean
  /** The profile's model pin was applied to the router provider. */
  applied: boolean
  /** Provider slug when applied. */
  provider?: string
  error?: string
}

/** Save the choice; apply the model pin when the router is wired. */
export async function saveBrainChoice(
  profile: string,
  choice: BrainChoice,
  routerProvider: ModelOptionProvider | null,
): Promise<BrainSaveResult> {
  // Lazy: profile-edit pulls the live websocket module (window at import);
  // keeping it out lets the pure helpers run in node tests.
  const { saveProfileMeta } = await import('./profile-edit')
  const patch: ProfileLookPatch = { brain: choice }
  const meta = await saveProfileMeta(profile, patch)
  const persisted = meta.serverOutcome === 'persisted'
  let applied = false
  let error: string | undefined
  if (persisted && routerProvider) {
    try {
      await apiFetch(`/api/profiles/${encodeURIComponent(profile)}/model`, {
        method: 'PUT',
        body: JSON.stringify({ provider: routerProvider.slug, model: choice }),
      })
      applied = true
    } catch (e) {
      error = e instanceof Error ? e.message : 'model pin failed'
    }
  }
  return { persisted, applied, provider: routerProvider?.slug, error }
}
