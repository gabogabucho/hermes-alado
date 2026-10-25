# Curated bot catalog — research & recommendation

Source of truth: `.hermes-ref/` pinned at `bf0203a`; DroidBot PWA in `repo/`.
Goal: DroidBot offers "Nuevo bot desde catálogo" (name, emoji/look, SOUL, suggested
toolsets/skills) reusing Hermes machinery where viable.

---

## 1. Profile distributions

### 1.1 The metadata fields

- `distribution_name`, `distribution_version`, `distribution_source` are `Optional[str]` on
  `ProfileInfo` (`hermes_cli/profiles.py:676-678`), read from a **`distribution.yaml`** at the
  profile root (`_read_distribution_meta`, `profiles.py:745-753`), never stored in a DB.
- Exposed over REST only by `GET /api/profiles` (`hermes_cli/web_routers/profiles.py:97-99`);
  the JSON-RPC `profiles.list` does **not** carry them (`tui_gateway/methods_profiles.py:282-303`).

### 1.2 What a distribution is

- "A distribution is a git repo (or local dir) with a manifest that installs a shareable profile"
  (`hermes_cli/profile_distribution.py:1-6`). Manifest schema `DistributionManifest`
  (`profile_distribution.py:104-150`): `name` (required, `:122-124`), `version` (default `0.1.0`),
  `description`, `hermes_requires`, `env_requires`, `distribution_owned`, plus `source`/
  `installed_at` stamped at install (never authored).
- Payload: `DEFAULT_DIST_OWNED = ("SOUL.md", "config.yaml", "mcp.json", "skills", "cron",
  distribution.yaml)` (`profile_distribution.py:38`); when `distribution_owned` is omitted the whole
  payload ships (`profile_distribution.py:349`). Toolset enablement is plain config
  (`enabled_toolsets` in `config.yaml`), not a packaged file (`toolsets.py:74`).
- **Do not confuse with `toolset_distributions.py`** — that's a batch-runner sampling distribution,
  unrelated (`toolset_distributions.py:2-7`).

### 1.3 Install / share / update

- **CLI only**: `hermes profile install <git-url|local-dir>` (`hermes_cli/subcommands/profile.py:129-145`,
  handler `profile_cmd.py:509-539`), `hermes profile update` (`profile_cmd.py:542-570`),
  `hermes profile info` (`profile_cmd.py:583-608`). No parallel `distribution` command tree exists.
- Git sources are shallow-cloned and `.git/` stripped (`profile_distribution.py:238-262`);
  `source` is recorded into the manifest at install (`profile_distribution.py:333`).
- **There is NO REST or JSON-RPC endpoint to install/update a distribution** — `install_distribution`
  is reachable only from `profile_cmd.py` (`profile_distribution.py:584-604`). `POST /api/profiles`
  has no distribution parameter (`web_routers/profiles.py:812-882`).

### 1.4 Official catalog / hub?

- **None for bot distributions.** Official sharing = "author's own git repo, installed by URL";
  unsigned by default (`website/docs/user-guide/profile-distributions.md:731-742`).
- `plugin-catalog/` is a curated catalog of **plugins** (`plugin-catalog/README.md:1-4`); the
  Skills Hub (`hermes_cli/skills_hub.py:2`) federates **skills** only
  (`github, clawhub, lobehub, browse-sh`, `skills_hub.py:32-38`).

---

## 2. Desktop "new bot" flow (reference client)

- `CreateAgentDialog` (`apps/desktop/src/plugins/hermes-bots/create-dialog.tsx:283-1139`) offers
  **no templates/presets**: name, title, description, avatar, and a **clone-from** picker
  (`__none__` = fresh profile, or an existing roster profile, `create-dialog.tsx:422,526,893-916`).
- Creation is `profiles.create` JSON-RPC (`create-dialog.tsx:519-545`); SOUL is composed
  client-side (`hermes-bots/soul.ts:160-184`).
- No `intro-*` template files exist — the bot "intro" is a localized one-line kickoff string
  (`canonical-chat.ts:360-375`, i18n default at `i18n.ts:223`), not a file.
- `catalog-curation.json` (`apps/shared/src/catalog-curation.json:2-28`) curates **skills and
  plugins** for the catalogs (featured + artwork), consumed as a static build-time import
  (`apps/desktop/src/app/capabilities/catalog/catalog-curation.ts:3`) — nothing to do with bots.

---

## 3. Recommendation for DroidBot

### 3.1 Verdict

Reusing **distributions for in-app creation is not viable**: install is CLI-only (§1.3) and
DroidBot is a PWA. Recommended: a **repo-hosted, static, versioned catalog JSON** shipped with the
PWA (same pattern as `catalog-curation.json`), and creation through the existing dashboard REST +
RPC surface.

### 3.2 Catalog artifact — `bot-catalog.json` (in `repo/`)

Schema per entry:

```json
{
  "id": "triage-droid",
  "name": "Triage Droid",
  "emoji": "🤖",
  "look": { "theme": "hermes", "avatar": "droid-7" },
  "soul": "# Triage Droid\n**Role:** ...\n**Mission:** ...",
  "toolsets": ["terminal", "file"],
  "skills": ["autonomous-ai-agents/triage"],
  "mcp": [],
  "description": "...",
  "distribution": "https://github.com/<org>/bots-triage-droid.git"
}
```

- `soul` is the full SOUL.md text — creation can pass it directly (`POST /api/profiles` accepts
  `soul`, `web_routers/profiles.py:831`).
- `toolsets` → applied via `profiles.configure` RPC `enabled_toolsets`
  (`tui_gateway/methods_profiles.py:390,404,745-746`).
- `skills` → hub installs: `POST /api/profiles` accepts `hub_skills` and the server spawns
  `hermes -p <name> skills install <ident> --yes` subprocesses, returning PIDs to poll
  (`web_routers/profiles.py:868-882`).
- `distribution` (optional) keeps each entry installable on the CLI as a real distribution
  (`hermes profile install <url>`, `subcommands/profile.py:129-145`) — a later catalog→distribution
  sync can auto-generate the git repos from the JSON.

### 3.3 Creation flow (in-app)

1. Fetch catalog (static import like `catalog-curation.ts:3`, or fetch from the repo CDN with a
   build-time snapshot fallback).
2. Card picker → `POST /api/profiles` with `name`, `soul`, `mcp_servers`, `hub_skills`,
   `no_skills=false` (`web_routers/profiles.py:812-882`).
3. After create, `profiles.configure` with `enabled_toolsets` + `disabled_skills`/`keep_skills`
   (`methods_profiles.py:404,724-746`).
4. Apply `look` client-side (DroidBot owns theme/avatar semantics — do not expect Hermes to store
   them; the roster REST has no UI-meta fields, `web_routers/profiles.py:84-100`).

### 3.4 Risks / notes

- No distribution install over REST (`profile_distribution.py:584-604` is CLI-only) — catalog is
  JSON-first; distributions are a best-effort mirror.
- Trust: the JSON is static, reviewed, versioned with the app; no code execution. Distribution git
  repos stay unsigned (`profile-distributions.md:731-742`) — the `distribution` field is opt-in.
- SOUL text duplicated between `bot-catalog.json` and any distribution repo — generate one from the
  other in CI.
- `keep_skills` has replace semantics and is skipped when empty (`web_routers/profiles.py:864-866`);
  fresh profiles get bundled skills seeded server-side (`web_routers/profiles.py:835-836`).
