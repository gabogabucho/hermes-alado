// Human labels for the Bóveda. A raw env-var name ("BRAVE_SEARCH_API_KEY") is
// hostile in a friendly list, so each row is titled by a short human label and
// the var name is shown small in mono below. Strategy, in priority order:
//   1. a small exact map for common keys whose backend prose is awkward
//   2. the provider catalog label (provider_label) when present
//   3. the description's first clause, with trailing credential suffixes trimmed
//   4. the key itself, prettified (SPLIT_ON_UNDERSCORE → "Split On Underscore")
import type { EnvVarInfo } from './credentials'

const KEY_LABELS: Record<string, string> = {
  ANTHROPIC_API_KEY: 'Anthropic',
  AIRTABLE_API_KEY: 'Airtable',
  BRAVE_SEARCH_API_KEY: 'Brave Search',
  CLAUDE_CODE_OAUTH_TOKEN: 'Claude Code',
  DISCORD_BOT_TOKEN: 'Discord',
  ELEVENLABS_API_KEY: 'ElevenLabs',
  EXA_API_KEY: 'Exa',
  GITHUB_TOKEN: 'GitHub',
  GH_TOKEN: 'GitHub',
  GITLAB_TOKEN: 'GitLab',
  GMAIL_PASSWORD: 'Gmail',
  HONCHO_API_KEY: 'Honcho',
  HONCHO_BASE_URL: 'Honcho',
  LINEAR_API_KEY: 'Linear',
  NOTION_API_KEY: 'Notion',
  OPENAI_API_KEY: 'OpenAI',
  SLACK_BOT_TOKEN: 'Slack',
  SLACK_APP_TOKEN: 'Slack',
  SUPABASE_ACCESS_TOKEN: 'Supabase',
  TELEGRAM_BOT_TOKEN: 'Telegram',
  TELEGRAM_ALLOWED_USERS: 'Telegram',
  TENOR_API_KEY: 'Tenor',
  TAVILY_API_KEY: 'Tavily',
  WHATSAPP_BOT_TOKEN: 'WhatsApp',
}

const CREDENTIAL_SUFFIXES = [
  'API subscription token',
  'personal access token',
  'integration token',
  'subscription token',
  'access token',
  'API token',
  'API key',
  'service account JSON path',
  'base URL',
  'bot token',
  'secret',
  'token',
  'API',
  'key',
  'URL',
]

const ACRONYMS = new Set(['API', 'URL', 'ID', 'AI', 'AWS', 'SMS', 'TTL', 'SQL', 'JSON', 'MCP', 'GPT'])

/** The description's first clause (before the first parenthetical, dash, colon,
 *  semicolon or period), trimmed. */
function firstClause(description: string): string {
  return description.split(/[(:;.—]/)[0].trim()
}

/** Strip a trailing credential descriptor ("… API key", "… subscription token"). */
function trimCredentialSuffix(clause: string): string {
  let out = clause.trim()
  let changed = true
  while (changed) {
    changed = false
    for (const suffix of CREDENTIAL_SUFFIXES) {
      if (out.toLowerCase().endsWith(suffix.toLowerCase())) {
        const next = out.slice(0, -suffix.length).trim()
        if (next) {
          out = next
          changed = true
          break
        }
      }
    }
  }
  return out
}

function prettifyKey(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map(word =>
      ACRONYMS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(' ')
}

/** The human title for an env var row. */
export function vaultLabel(key: string, info: EnvVarInfo): string {
  const mapped = KEY_LABELS[key]
  if (mapped) return mapped

  if (info.provider_label) {
    const trimmed = trimCredentialSuffix(info.provider_label)
    if (trimmed) return trimmed
  }

  const clause = firstClause(info.description)
  if (clause) {
    const trimmed = trimCredentialSuffix(clause)
    if (trimmed) return trimmed
  }

  return prettifyKey(key)
}
