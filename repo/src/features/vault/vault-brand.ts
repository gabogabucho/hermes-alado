import type { EnvVarInfo } from '../../lib/hermes/credentials'
import { brandDomainByName } from '../../ui/brand/brand-domains'

/**
 * Brand name a vault icon may claim, derived only from the variable's own
 * identity — the first segment of its key (GITHUB_TOKEN → github) or its
 * catalog provider slug — never from URLs in the description. CAMOFOX_URL
 * links to github.com but is not GitHub, so it falls back to the initial
 * tile unless the key itself names the brand.
 */
export function vaultBrandName(key: string, info: EnvVarInfo): string | null {
  const prefix = key.split('_')[0] ?? ''
  if (brandDomainByName(prefix)) return prefix

  const provider = info.provider?.trim() ?? ''
  if (brandDomainByName(provider)) return provider

  return null
}
