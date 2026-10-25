import { apiUrl } from '../config'

export const HERMES_CONTRACT_COMMIT = 'bf0203a'

/**
 * Warn in the console when the running backend reports a different commit than
 * the one this client was verified against (`/api/health` carries `commit`,
 * from `hermes_cli/web_routers/status.py`). Non-fatal: only a dev-console hint.
 */
export async function verifyContractCommit(): Promise<void> {
  try {
    const res = await fetch(apiUrl('/api/health'), { credentials: 'include' })
    if (!res.ok) return
    const body = (await res.json()) as { commit?: string | null }
    if (body.commit && !body.commit.startsWith(HERMES_CONTRACT_COMMIT)) {
      console.warn(
        `[hermes] backend commit ${body.commit} differs from the tested contract ${HERMES_CONTRACT_COMMIT}`,
      )
    }
  } catch {
    // backend unreachable at boot; the connection manager surfaces that
  }
}
