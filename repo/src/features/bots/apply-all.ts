/**
 * Shared "Aplicar a todos mis bots" plumbing. Screens that write a per-bot
 * value (vault key, approvals mode, toolset toggles) reuse this to fan the
 * write out to every chosen profile, strictly in order, collecting a summary
 * of results. The write for each profile is a caller-provided closure — the
 * sheet never reads values back from the server.
 */

export interface ApplyOutcome {
  name: string
  ok: boolean
  error?: string
}

export interface ApplySummary {
  applied: number
  failed: number
  outcomes: ApplyOutcome[]
}

/**
 * Run `applyOne` for each `name` sequentially (never in parallel — each write
 * is a server round-trip and order makes progress honest). One failure must
 * not stop the rest.
 */
export async function applySequential(
  names: readonly string[],
  applyOne: (name: string) => Promise<void>,
): Promise<ApplySummary> {
  const outcomes: ApplyOutcome[] = []
  for (const name of names) {
    try {
      await applyOne(name)
      outcomes.push({ name, ok: true })
    } catch (e) {
      outcomes.push({
        name,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return {
    applied: outcomes.filter(o => o.ok).length,
    failed: outcomes.length - outcomes.filter(o => o.ok).length,
    outcomes,
  }
}
