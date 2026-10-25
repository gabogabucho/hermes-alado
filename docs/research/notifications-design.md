# Push notifications via a Hermes plugin — design

Source of truth: `.hermes-ref/` pinned at `bf0203a`. PWA side: `repo/` (DroidBot).
Goal: phone push when a bot **finishes** a turn or **is waiting for you** (approval/clarify),
per-bot toggle, **without modifying Hermes core** — as an installable Hermes plugin
(`~/.hermes/plugins/`).

> Conventions: `path:line` cites the file in `.hermes-ref/` (or `repo/` for DroidBot files).
> `ctx` = the `PluginContext` a plugin receives in `register(ctx)`.

---

## 1. Plugin system — what a plugin can and cannot do

### 1.1 Manifest (`plugin.yaml`)

- Schema: `_KNOWN_MANIFEST_FIELDS` (`hermes_cli/plugins_manifest.py:32-39`), parsed into
  `PluginManifest` (`plugins_manifest.py:346-400`). Relevant fields: `name`, `version`,
  `description`, `kind` ∈ `standalone|backend|exclusive|platform|model-provider`
  (`plugins_manifest.py:27`), `python_dependencies` (`plugins_manifest.py:170-175`, legacy alias
  `pip_dependencies` `plugins_manifest.py:35`), `config_schema`, `requires_hermes`.
- No `permissions:`/`entry_points:` fields exist; capabilities are the consent layer
  (`plugins_manifest.py:373-375`).

### 1.2 Discovery & layout

- User plugins live in `~/.hermes/plugins/` (`plugins_discovery.py:209-211`); a plugin dir needs
  `plugin.yaml` + `__init__.py` exposing `register(ctx)` (`hermes_cli/plugins.py:6-8`), imported
  and `register()`-ed at load (`plugins_loader.py:469-479`).
- Enablement is opt-in via `plugins.enabled` allow-list; `plugins.disabled` wins
  (`plugins_discovery.py:112-131`). Install: `hermes plugins install <git-url|owner/repo|name>`
  (`hermes_cli/subcommands/plugins.py:18-23`).

### 1.3 Lifecycle hooks

- Registration: `ctx.register_hook(name, callback)` (`hermes_cli/plugins.py:943-945`); registry is
  `VALID_HOOKS` (`plugins.py:108-203`). Dispatch: `invoke_hook` facade (`plugins.py:1834-1845`) →
  `PluginDispatchMixin.invoke_hook` (`plugins_dispatch.py:256-294`), sync; async callbacks bridged
  with a 30s bound (`plugins_dispatch.py:195-226`). Per-callback error isolation
  (`plugins_dispatch.py:290-318`); bounded hooks run on a daemon worker with
  `plugins.hook_callback_timeout` (default 30s, `plugins_dispatch.py:26-67`).
- Turn hooks include: `pre_tool_call` (`plugins.py:114`), `post_llm_call`,
  `on_stream_start/delta/end`, `on_session_start/end` (`plugins.py:131`),
  `pre_approval_request`/`post_approval_response` + `on_human_input_request/resolved`
  (`plugins.py:146`), `on_room_member_activity` (`plugins.py:147-152`).

### 1.4 REST routes from a plugin

- A plugin mounts FastAPI routes by shipping `dashboard/manifest.json` with an `api` field pointing
  at a Python file in its `dashboard/` dir (`hermes_cli/web_server_dashboard.py:537-561`); the file
  must expose a module-level `router` (`web_server_dashboard.py:1181-1184`).
- Routes are mounted at **`/api/plugins/<plugin-name>/`** on the dashboard app, with a
  profile/secret-scope dependency (`web_server_dashboard.py:1185-1190`), wired at web-server startup
  (`web_server.py:824`).
- **Auth is inherited automatically**: the middleware chain runs before the plugin router
  (`web_server.py:399-426`). Loopback mode = header `X-Hermes-Session-Token` (`web_server.py:226`,
  middleware `web_server.py:444-463`); gated mode = HttpOnly cookie `hermes_session_at` + rotating
  `hermes_session_rt` (`hermes_cli/dashboard_auth/cookies.py:27-31`, `SameSite=Lax` `:59-63`) via
  `gated_auth_middleware` (`dashboard_auth/middleware.py:160-219`). → The subscription endpoints
  get the same dashboard session cookie for free; DroidBot's dev proxy already covers `/api`
  (`repo/vite.config.ts:73`), so no new proxy rules.

### 1.5 Storage

- `plugin_data_dir(name)` → `<hermes home>/plugin-data/<name>/` (`plugins/plugin_storage.py:27-33`)
  and `plugin_db(name)` → SQLite with WAL (`plugins/plugin_storage.py:36-46`).
- `ctx.state` = profile-scoped durable JSON state (`hermes_cli/plugins.py:281-284`,
  `plugins_state.py:134-195`); `ctx.get_config/set_config` = `plugins.entries.<id>.settings.*`
  (`plugins.py:265-279`). Both follow `get_hermes_home()`, so state is per-profile.

### 1.6 Python dependencies

- Declared as `python_dependencies` in `plugin.yaml` **or** a plugin-level `pyproject.toml`
  (`pm/plugin_declarations.py:117-166`). Discovery only *validates and surfaces* them — never
  auto-installs (`plugins_manifest.py:383-386`).
- Install is consent-gated (`hermes_cli/plugins_cmd_install.py:69-117`); **non-interactive
  installs are refused** (`plugins_cmd_install.py:144-150`) — deploy must pass `--yes-deps`
  (`subcommands/plugins.py:33-40`). Deps land in the shared PM environment
  (`hermes_cli/plugins_transaction.py:45-49`).
- `pywebpush` is **not** in `uv.lock`/`pyproject.toml` today; but `cryptography==50.0.1`
  (`pyproject.toml:117`), `httpx` (`pyproject.toml:51`) and `requests` (`pyproject.toml:61`) are
  already core deps. → `pywebpush` is pip-installable via the normal plugin dep path.

### 1.7 Where hooks run (process map)

- Hooks fire **in the process that runs the turn**. `hermes serve` runs TUI/Desktop/dashboard
  agents in-process (`tui_gateway/server.py:741-745`); `hermes gateway run` runs messaging turns.
  Both processes discover/load the same user plugins (`plugins_discovery.py:209-211`).
- There is **no cross-process hook bridge** — serve↔gateway link relays frames, not hooks
  (`tui_gateway/owner_forward.py:78-92`). A hook registered in the serve process only sees serve
  turns, and vice versa.

---

## 2. Event mapping — what fires for each notification case

### 2.1 Turn complete ✅ (fires)

- **`on_session_end`** — per-turn, at finalization, in the turn process
  (`agent/turn_finalizer.py:797-808`). Payload: `session_id, task_id, turn_id, completed, failed,
  interrupted, turn_exit_reason, model, platform`. Observer-only (`hermes_cli/lifecycle.py:72`).
- Alternatives: `on_stream_end` fires per stream attempt (not per turn) with
  `turn_id, iteration, session_id, model, provider, surface, final_text, finished, error`
  (`agent/stream_delivery.py:282-296`); `post_llm_call` carries `assistant_response`
  (`agent/turn_finalizer.py:469-479`).
- ⚠ **No profile name in any turn hook.** Plugin must resolve it via `ctx.profile_name`
  (`hermes_cli/plugins.py:400-408`).

### 2.2 Approval / clarify requested ⚠ (no direct hook)

- Server→client requests (`approval`, `clarify`, `sudo`, `secret`, …) are created by
  `send`/`send_async` in `tui_gateway/server_requests.py:191-246` and registered in-memory
  (`_register` `server_requests.py:168-188`) — **no `invoke_hook` anywhere on that path**.
- Closest available hooks, which fire in the turn process *around* the prompt:
  - `pre_approval_request` / `post_approval_response` — payload `command, description,
    pattern_key(s), session_key, surface` + auto-injected `turn_id, tool_call_id, session_id`
    (`tools/approval_context.py:66-70`; invoke sites e.g. `tools/approval_prompt.py:242,252`).
  - `on_human_input_request` / `on_human_input_resolved` — `kind` ∈ approval/clarify/sudo
    (`tools/approval_prompt.py:51,244`, `tools/clarify_tool.py:121`), payload `request_id,
    session_id, session_key, platform, prompt` — **`prompt` is force-redacted**
    (`tools/human_input_hooks.py:29-35,52-72`). Observer-only.
- These cover the "bot is waiting for you" case with a push title/body we compose ourselves
  (e.g. "Bot <profile> needs your approval"), without leaking the prompt.

### 2.3 Cron run finished ⚠ (no hook)

- `run_job` (`cron/scheduler.py:2600-2701`) fires **no hook** on completion (zero `invoke_hook`
  call sites in `cron/`); results flow to chat delivery (`cron/scheduler_delivery.py`).
- Turn-scoped hooks DO fire during the run with `platform=cron` — so `on_session_end` catches
  "cron turn done" too (`agent/turn_finalizer.py:797-808`). Per-bot opt-in applies by profile.

### 2.4 Group room needs you ⚠ (indirect)

- Only room hook: `on_room_member_activity` (`tui_gateway/hosted_room_member_activity.py:18-41`).
  An approval pending in a room surfaces as `kind="request.opened"` (`:44-45`) with `room_id,
  member_id, turn_id, task_id` — usable to push "Room <room> is waiting on a member's approval".

---

## 3. Plugin design — `hermes-webpush`

### 3.1 File list

```
~/.hermes/plugins/hermes-webpush/
  plugin.yaml                # kind: standalone, python_dependencies: [pywebpush]
  __init__.py                # register(ctx): register_hook(...) x4, lazy VAPID ensure
  webpush.py                 # hook callbacks, dedupe/rate-limit, send()
  dashboard/
    manifest.json            # {"api": "plugin_api.py"}
    plugin_api.py            # module-level `router` (FastAPI APIRouter)
```

### 3.2 Hooks used

| Case | Hook | Cite |
|---|---|---|
| Turn finished (chat, cron) | `on_session_end` | `agent/turn_finalizer.py:797-808` |
| Waiting: approval | `pre_approval_request` | `tools/approval_prompt.py:242` |
| Waiting: clarify/other prompts | `on_human_input_request` | `tools/human_input_hooks.py:61-72` |
| Room waiting on approval | `on_room_member_activity` (`kind=request.opened`) | `tui_gateway/hosted_room_member_activity.py:44-45` |

Each callback resolves the profile via `ctx.profile_name` (`plugins.py:400-408`), checks per-profile
opt-in in `ctx.state`, dedupes, then sends.

### 3.3 VAPID + Web Push

- VAPID keypair generated lazily on first load (`cryptography` is a core dep, `pyproject.toml:117`);
  private key kept in `ctx.state` (0600 JSON, `hermes_cli/plugins_state.py:134-195`), public key
  served read-only by the plugin REST route. Sending via `pywebpush` (declared dep, §1.6).
- Payload: `title`, `body`, `url` (deep link into DroidBot: `/chat/<profile>` or `/group/<room>`),
  `icon`/`badge`, sensible TTL.
- **Dedupe/rate limit**: in-memory dict keyed `(session_id, turn_id)` + last-sent timestamp;
  optionally mirror into `plugin_db` SQLite (`plugins/plugin_storage.py:36-46`) so the serve and
  gateway processes don't double-send the same turn (hooks are per-process, §1.7).

### 3.4 REST endpoints (under `/api/plugins/hermes-webpush/`)

- `GET /config` → VAPID public key + per-profile opt-in state.
- `POST /subscribe` → `{endpoint, keys, profile}`; `POST /unsubscribe`; `GET /subscriptions`;
  `POST /test` → test push. Auth = the dashboard session automatically (§1.4).
- Per-profile toggle lives in `ctx.state` (profile-scoped, §1.5); subscription rows keyed by
  profile name + endpoint.

### 3.5 PWA side (DroidBot, `repo/`)

- Today: `VitePWA` default **generateSW**, `registerType: 'autoUpdate'`, manifest
  `display: 'standalone'` (`repo/vite.config.ts:45-68`).
- Change to **`strategies: 'injectManifest'`** with a custom `src/sw.ts`: generateSW cannot carry
  custom `push`/`notificationclick` handlers. The custom SW must keep precaching via
  `precacheAndRoute(self.__WB_MANIFEST)` (add `workbox-precaching` dev dep) and preserve the
  `navigateFallbackDenylist` for `/api/`, `/auth/`, `/login/` (`repo/vite.config.ts:49-51`).
- Flow: `Notification.requestPermission()` → `PushManager.subscribe({userVisibleOnly: true,
  applicationServerKey: <VAPID public key from GET /config>})` → POST subscription to the plugin.
- `notificationclick` → `self.clients.openWindow(url)` with the deep link from the payload.
- **iOS**: Web Push requires an **installed PWA** (added to Home Screen) and iOS/iPadOS **16.4+**;
  `display: standalone` is already set (`repo/vite.config.ts:59`) and push needs https (prod origin
  is https). Android/desktop Chrome work without installation.

### 3.6 Fallback: ntfy

- The ntfy platform plugin is a **chat surface + cron delivery channel**, not a completion
  notifier: streaming-subscribe inbound (`plugins/platforms/ntfy/adapter.py:160,202-222`), POST
  replies out (`adapter.py:274-299`, 4096-char cap `adapter.py:44-45`), cron delivery to a home
  channel via `cron_deliver_env_var="NTFY_HOME_CHANNEL"` + `standalone_sender_fn`
  (`adapter.py:369-370`). No mention/completion triggers, no per-bot toggle, no deep links.
- Value today: the `hermes-webpush` plugin can *also* POST to an ntfy topic (same mechanics as the
  adapter) as a cheap secondary channel for cron "done" notifications; approval/waiting
  notifications need the hook-based Web Push path.

---

## 4. Risks & open questions

1. **No hook fires at server-request creation** (`tui_gateway/server_requests.py:168-188`) — the
   design leans on `pre_approval_request`/`on_human_input_request`, which fire in the turn process
   *before* the UI prompt. Timing is "about to ask", not "asked"; acceptable for v1.
2. **Process locality**: hooks only fire in the process running the turn (§1.7). If `hermes serve`
   (dashboard) and `hermes gateway run` are separate processes on the VPS, the plugin must be
   loaded in both (it is, once in `~/.hermes/plugins/` + `plugins.enabled`) — dedupe via SQLite.
3. **Profile resolution** relies on `ctx.profile_name` (`plugins.py:400-408`) — verify it returns
   the *turn's* profile under the multiplex gateway; if process-wide, notifications may mislabel
   multi-profile homes.
4. **Deps install is consent-gated** and refuses non-interactive runs
   (`plugins_cmd_install.py:144-150`) — deployment must run
   `hermes plugins install ... --yes-deps` explicitly.
5. VAPID rotation invalidates all subscriptions; `pushsubscriptionchange` handler in `sw.ts` +
   resubscribe on app boot mitigate.
6. iOS support is inherently limited (installed PWA, 16.4+); approval prompts on iOS require the
   app in foreground — push only deep-links.
7. `injectManifest` switch is a build change on DroidBot; keep the login/API denylist or auth
   breaks (`repo/vite.config.ts:49-51`).

## 5. Deployment checklist

1. Vendor plugin into `~/.hermes/plugins/hermes-webpush/` on the VPS.
2. `hermes plugins enable hermes-webpush --yes-deps` (or install from git).
3. PWA: switch to injectManifest, add `src/sw.ts`, publish.
4. Opt-in per bot from DroidBot UI → `POST /api/plugins/hermes-webpush/subscribe` + toggle in
   `ctx.state`.
