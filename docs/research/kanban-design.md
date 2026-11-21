# Hermes Kanban on the phone — research + design (Alado)

Source of truth: `.hermes-ref/` pinned at `bf0203a` (commit `bf0203a794 fix(launchers): …`).
Citations are `path:line` relative to `.hermes-ref/`; Alado-side files are prefixed `app/` or
`hermes-plugin/`. Read-only brief `docs/briefs/research-kanban.md`. If something is not in the
source it is marked **NOT FOUND** — never invented.

---

## 1. What Hermes Kanban is (system summary, 1 page)

**A SQLite task board shared across all profiles of one Hermes home — the cross-profile
coordination primitive** (`hermes_cli/kanban_db.py:1`). One file per board: the `default` board at
`<root>/kanban.db`, named boards at `<root>/kanban/boards/<slug>/kanban.db` (`kanban_db.py:3-5`,
`:562-565`). Boards themselves are **directories + a `board.json` marker** (slug, name, icon,
`project_id`, …), not DB rows (`hermes_cli/kanban_db_boards.py:19-25`); a board can be scoped to a
first-class Hermes project so new tasks inherit a worktree/branch (`kanban_db_boards.py:49-50`).

**Tasks** (`tasks` table, `kanban_db.py:776-877`): `id` (`t_` + 4 hex bytes, `:987-990`), `title`,
`body`, `assignee` (a **profile name**, `:780`), `status`, `priority`, `created_by`, timestamps,
`workspace_kind/path`, `project_id`, `claim_lock`/`claim_expires`, `consecutive_failures`,
`worker_pid`, `last_heartbeat_at`, `model_override`/`provider_override`, `skills`, `goal_mode`,
`session_id` (originating chat, verified against `state.db`, `:857-863`), `block_kind`, `max_runtime_seconds`.
**NOT FOUND: due dates/deadlines** — `scheduled` is a status park with a free-text reason, not a
timestamp (`kanban_db.py:3868-3894`). Side tables: `task_links` (parent/child dependencies,
`:879-883`), `task_comments` (`:885-891`), `task_events` (immutable audit stream with `kind` +
JSON `payload`, `:893-900`), `task_runs` (one row per dispatcher claim, `:909-933`),
`task_attachments` (blobs on disk, 25 MB cap, `:935-950`), `kanban_notify_subs` (chat backchannel
per task: platform/chat_id/thread_id, `:956-971`).

**Columns/statuses** (board order, `hermes_cli/kanban_workflow.py:114-138`):
`triage → todo → scheduled → ready → running → blocked → review → done`, plus `archived` as a
filter toggle, never a column (`:27-28`). Lifecycle kernel in `kanban_db.py`: the dispatcher
**claims** `ready → running` via compare-and-swap on `status`/`claim_lock` and opens a run
(`:2170-2202`); workers **heartbeat** to extend the 15-min claim TTL (`:2290-2305`, `:279`);
`complete_task` (`running|ready|blocked|review → done`, `:2639-2743`) requires non-empty evidence
or review approval (`EmptyCompletionError` `:2668`) and promotes children; `block_task` routes by
typed kind — `dependency | needs_input | capability | transient` (`:110`, `:3124-3244`); explicit
blocks are **sticky** (only `unblock_task` exits, `:2039-2060`); a circuit breaker trips to
`blocked` after `failure_limit` (default 2, `hermes_cli/kanban_db_dispatch.py:37, :1372-1492`).
Review is a handoff: `request_review(reviewer=X)` reassigns to X and dispatches a reviewer run
(`kanban_db.py:3262-3273`); `request_changes` bounces back to the implementer (`:3411-3478`).

**Who runs the cards**: the **dispatcher embedded in the gateway** (default on,
`kanban.dispatch_in_gateway`, `hermes_cli/config_defaults.py:1910`; loop
`gateway/kanban_watchers.py:257-332`) ticks every **60 s** (`config_defaults.py:1915`) and spawns
a worker subprocess per ready+assigned task: `python -m hermes_cli.kanban_worker_client` run as
the assignee profile (`kanban_db_dispatch.py:2698-2701, :2769, :2855`). Bots get **15 tools** in
the `kanban` toolset (`tools/kanban_tools.py:1295-1315`) — see §2.1. The gateway **notifier**
(`gateway/kanban_watchers_notifier.py`) tails `task_events` and pings subscribed chats / fires
synthetic wake turns for terminal kinds (`:47-50`, `gateway/kanban_watchers.py:60-121`). The old
standalone systemd unit is **deprecated** (`plugins/kanban/systemd/hermes-kanban-dispatcher.service:1-14`).

**Multi-bot coordination is native**: any profile (or the user) can create a card assigned to
**another** profile; that profile's dispatcher claims and runs it — no "pick up" step in chat
(`tools/kanban_tools_schemas.py:407-412`, `kanban_db_dispatch.py:1695-1720, :2769`). Cross-bot
talk goes through comments/links; a worker may only mutate its own task
(`tools/kanban_tools.py:250-263`).

---

## 2. Client contract

### 2.1 Agent tools (what the bots get) — toolset `kanban`

Registered at `tools/kanban_tools.py:1295-1315` (`toolset="kanban"`); every schema adds an
optional trailing `board` arg (`tools/kanban_tools_schemas.py:34-44`). Key tools:

| Tool | Args (required / notable optional) | Result | Citation |
|---|---|---|---|
| `kanban_create` | `title`, `assignee` (required — unassigned tasks are never dispatched); `body`, `parents[]`, `tenant`, `priority`, `workspace_kind`, `triage`, `idempotency_key`, `model/provider`, `goal_mode`, `initial_status` | `{ok, task_id, status, workspace_kind, workspace_path, project_id, gated?, gated_by?, subscribed}` | schema `kanban_tools_schemas.py:407-412`; handler `tools/kanban_tools.py:1094-1154` |
| `kanban_list` | `assignee`, `status`, `limit≤200` | `{tasks:[…], count, truncated}` | `:695-722` |
| `kanban_show` | `task_id?` (defaults to own worker task) | full task + parents/children/comments/events/runs/worker_context | `:666-692` |
| `kanban_complete` | `summary` or `result` (empty → `EmptyCompletionError`); `artifacts[]` | `{ok, task_id, run_id, attachments[]}` | `:725-808` |
| `kanban_block` | `reason`; `kind` (dependency/needs_input/capability/transient) | `{ok, status:"blocked", block_kind}` | `:811-849` |
| `kanban_request_review` | `summary`; `reviewer` (must be an installed profile, `:890-898`) | `{ok, status:"review"}` | `:873-916` |
| `kanban_request_changes` | `reason` | `{ok, status:"ready", implementer}` | `:919-929` |
| `kanban_comment` | `task_id`, `body` | `{ok, comment_id}` | `:949-973` |
| `kanban_attach` / `kanban_attach_url` / `kanban_attachments` | file/base64 or URL (SSRF-checked ≤25 MB) | attachment rows | `:976-1073` |
| `kanban_unblock` | `task_id` | `{ok, status}` | `:1260-1271` |
| `kanban_link` | `parent_id`, `child_id` | `{ok, gated?}` | `:1274-1288` |
| `kanban_schedule` / `kanban_heartbeat` | `reason` / `note` | `{ok}` | `:852-870`, `:932-946` |

Gating: dispatcher-spawned workers see their own task's lifecycle tools; orchestrators get
`kanban_list`/`kanban_unblock`; other profiles need the `kanban` toolset opted in
(`tools/kanban_tools.py:83-102`). **Enablement per profile**: `hermes tools enable kanban
--platform <p>` (or `tools.<p>.enabled` in config).

### 2.2 REST — dashboard plugin, mounted at `/api/plugins/kanban`

Router: `plugins/kanban/dashboard/plugin_api.py:43`; mounted by the web server with
`/api/plugins/<name>` prefix and host-level auth only (no route-level decorators,
`hermes_cli/web_server_dashboard.py:1181-1190`). Auth = the dashboard's own middleware chain:
loopback `X-Hermes-Session-Token` (`web_server.py:218-226, :444-463`) or gated OAuth cookies;
Alado's `apiFetch` already carries it (same path `app/src/lib/push.ts:85` uses for
`/api/plugins/droidbot-push/*`). No kanban JSON-RPC methods exist over `/api/ws` — board state is
REST-only (**NOT FOUND** in `tui_gateway/methods_*.py`; the only RPC is the dispatcher-internal
`kanban.run` canonical method, `tui_gateway/contracts/canonical.py:427-441`).

Main routes (full inventory in `plugin_api.py`; params/results from the source):

| Method + path | Params | Result | Citation |
|---|---|---|---|
| GET `/board` | q: `tenant?`, `include_archived?`, `board?` | `{columns:[{name, tasks:[task…]}], tenants[], assignees[], latest_event_id, now}` — task includes `latest_summary` (200-char), `progress`, `warnings?`, `current_run_started_at`, `comment_count` | `:290-374` |
| GET `/tasks/{task_id}` | q: `board?` | `{task (full), comments[], events[], attachments?, links{parents,children}, link_tasks?, runs[]}` | `:379-409` |
| POST `/tasks` | body: `title` req, `body?, assignee?, tenant?, priority, workspace_kind?, parents[], triage, idempotency_key?, goal_mode, model_override?, project_id?` | `{task, warning?}` (warning if dispatcher not running) | body `:414-432`, route `:435-457` |
| PATCH `/tasks/{task_id}` | body: `status?, assignee?, priority?, title?, body?, block_reason?, summary?, model_override?, …` | `{task}` — `status: done`→complete(force), `blocked`→block(reason), `scheduled`, `review`→request_review, `ready/todo/triage` drag; `running` **rejected** | body `:533-551`, route `:692-716`, `:576` |
| POST `/tasks/bulk` | body: `ids[]` + any patch fields incl. `archive`, `reclaim_first` | `{results:[{id, ok, error?}]}` | `:554-569`, `:858-877` |
| DELETE `/tasks/{task_id}` | — | `{deleted, task_id}` | `:719-724` |
| POST `/tasks/{task_id}/comments` | body: `body` (req), `author?` (default `"dashboard"`) | `{ok}` | `:797-809` |
| POST `/tasks/{task_id}/reassign` | body: `profile?` (empty = unassign), `reclaim_first?`, `reason?` | `{ok, task_id, assignee}` (409 if running w/o reclaim) | `:1033-1050` |
| POST `/tasks/{task_id}/reclaim` | body: `reason?` | `{ok, task_id}` | `:1004-1015` |
| POST `/dispatch` | q: `dry_run?`, `max?` | `DispatchResult` (spawned/reclaimed/skipped_…) | `:1269-1277` |
| GET `/boards` / POST `/boards` | — / body `slug` req + meta | `{boards:[meta+counts], current}` | `:1411-1454` |
| GET `/workflow` | — | columns order/labels + manual-move allow-list | `:1625-1630` |
| GET `/stats` | q: `board?` | per-status + per-assignee counts + oldest-ready age | `:1240-1244` |
| GET `/assignees` | q: `board?` | known assignees on the board | `:1247-1252` |
| GET `/profiles` | — | `{profiles:[{name, is_default, model, description, …}]}` | `:1553-1564` |
| GET/PUT `/orchestration` | — | orchestrator_profile, default_assignee, auto_decompose… | `:1633-1694` |
| GET `/orchestration`, `/config`, `/diagnostics`, `/workers/active`, `/runs/*`, `/tasks/{id}/log`, attachments, `/home-channels`, `/links`, estimates, board export/import | see §2.3 table in `plugin_api.py` | admin/deep-detail surfaces (Desktop territory) | `:882-1030`, `:1149-1157`, `:1196-1298` |

### 2.3 Events / live updates

- **WebSocket** `GET /api/plugins/kanban/events?board=<slug>&since=<cursor>` (WS upgrade) pushes
  `{events:[{id, task_id, run_id, kind, payload, created_at}], cursor}` — it tails `task_events`
  on a 300 ms short-poll (`plugin_api.py:1802-1847`, `:1700`, `:1759-1773`). Board pinned at
  handshake; auth re-checked via the dashboard's canonical WS gate (`?token=`/`?ticket=`/
  `?internal=`, `plugin_api.py:50-58`). `since` baseline = `/board`'s `latest_event_id` (Desktop
  pattern, `apps/desktop/src/plugins/kanban/api.ts:100-111`).
- Desktop subscribes to it for instant board invalidations **and** completion notifications
  (terminal kinds `blocked, block_loop_detected, completed, crashed, gave_up, timed_out`,
  `apps/desktop/src/plugins/kanban/completion-notify.ts:45-55`), with 60 s board / 30 s drawer
  polling as fallback (`board.tsx:1101-1107`, `drawer.tsx:849-855`).
- Gateway-side, the notifier tails the same `task_events` and pushes to chat backchannels
  (`kanban_notify_subs`): kinds `completed, blocked, gave_up, crashed, timed_out, status, review_requested, changes_requested, block_loop_detected` (`gateway/kanban_watchers_notifier.py:47-50, :472-485`); TUI/desktop sessions get `status.update` (kind `process`) events from the poller (`tui_gateway/session_notifications.py:148-151, :475-534`).

### 2.4 Desktop reference (what to mirror, what to skip)

Kanban is a first-class Desktop plugin — **ships OFF** (`defaultEnabled: false`,
`apps/desktop/src/plugins/kanban/plugin.tsx:8-10, :85`): a `/kanban` board page + sidebar nav row +
live statusbar count of `running + ready` (`:107-129`). The board renders the 9 backend columns
in order (`types.ts:235-249`); `running`/`review`/`scheduled` lanes are **locked** for drag-in
(`ui.tsx:48-55`); a card shows title, 2-line body preview, a machine-activity arc while running
(`board.tsx:299-306`), assignee chip (with `→` when auto-defaulted, `:163-195`), run clock,
block-kind chip, priority/progress/comment counts (`:152-248`). The card detail dialog
(`drawer.tsx`) has: status menu, inline description edit, result/summary markdown, Comments /
Activity / Runs / Worker-log tabs, comment composer (on a running task the note steers the live
turn, `:342-429`), assignee dropdown (reassign `reclaim_first: true`), priority, tenant, model
override, dependency chips, attachments (`:1049-1177`). Every board write fires a debounced
`POST /dispatch` nudge (`api.ts:412-437`).

**Alado should NOT copy the board.** Desktop is for sitting down; the phone gets a filtered
"my cards / waiting on me" surface (§3).

### 2.5 Enablement checklist (what the preparer needs)

1. Kanban is a **bundled** plugin (in-tree `plugins/kanban/`, manifest `dashboard/manifest.json:1-14`);
   backend plugin opt-in: `hermes plugins enable kanban` (`hermes_cli/plugins_cmd.py:695-737`,
   bundled = no capability consent). The dashboard API mounts **by default** unless explicitly
   disabled (`web_server_dashboard.py:798-811`).
2. Agent toolset per bot profile: `hermes tools enable kanban --platform <p>` (Desktop's switch
   does plugin+toolset together via `PUT /api/tools/toolsets/{name}`,
   `apps/desktop/src/lib/desktop-toolsets.ts:26-34`).
3. Dispatcher needs **no service**: gateway-embedded by default (`kanban.dispatch_in_gateway`);
   the systemd unit is deprecated (`plugins/kanban/systemd/hermes-kanban-dispatcher.service:1-14`).
4. Key config (`hermes_cli/config_defaults.py:1900-1970`): `kanban.default_assignee` (cards
   without assignee auto-run for this profile, `kanban_db_dispatch.py:2105-2111`),
   `dispatch_interval_seconds` (60), `max_in_progress_per_profile`, `dispatch_profiles` (per-home
   claim allowlist), `notify_in_gateway`, `auto_subscribe_on_create`.
5. No `requires_plugins`/`python_dependencies` in the kanban manifest — no deps
   (`manifest.json:1-14`).

---

## 3. Phone UX proposal (product principle: light, one-hand, glanceable)

**Placement.** Not a 10th tab and not a full board: a **Home badge** (count of cards "waiting on
me" = `ready`+`review` assigned to my profile, same glance as the Desktop statusbar pill
`plugin.tsx:41-79`) and a **"Board" entry under "Avanzado"** opening the light board. Inside a
bot's chat, the header shows that bot's running card (tap → card detail). Group room "Agencia"
gets the board link too. The full 9-column board is NOT on the phone: we show three glanceable
lanes only.

**Glanceable default — "Waiting on me":**

```
┌──────────────────────────────┐
│ ← Agencia            ⌘ filter │
├──────────────────────────────┤
│ WAITING ON YOU         (2)   │
│ ┌──────────────────────────┐ │
│ │● review  "Informe META   │ │
│ │          Q3"  ← Nico     │ │
│ │  3 comentarios · 12:40   │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │● ready   "Propuesta VTR  │ │
│ │          Brief"  → Lola  │ │
│ │  espera despacho         │ │
│ └──────────────────────────┘ │
│ MY BOTS IN FLIGHT        (3) │
│  🟢 Lola  "Landing Cliente"  │
│     working · 4m             │
│  🟢 Nico  "Q3 benchmarks"    │
│  ⏸ Tomi  "Presupuesto"       │
│     bloqueado: needs_input   │
└──────────────────────────────┘
```

**Card detail** (one tap): title, body/latest summary, status stepper (one-tap move), assignee
chip, comments (last 3 + composer), quick actions. **Open the bot's chat** is the primary CTA for
every card with an assignee (reuses the existing chat feature — the card IS context, the chat is
the conversation).

```
┌──────────────────────────────┐
│ ● review         t_3f9a  ⋯  │
│ Informe META Q3              │
│ ──────────────────────────── │
│ Resumen: "Datos de ads …"    │
│                              │
│ STATUS                       │
│ [running]→[review]→[done]    │
│  ↑ tap = move (respecta      │
│    backend)                  │
│ Asignado a: Nico ▾           │
│ ──────────────────────────── │
│ 💬 3 comentarios   + Agregar │
│                              │
│ [ Abrir chat de Nico ]       │
│ [ Pedir cambios ] [ Aprobar ]│
└──────────────────────────────┘
```

Quick actions map 1:1 to REST: move = `PATCH /tasks/{id}` with allowed statuses
(`plugin_api.py:533-551, :576`); approve = `status: done`; request changes = `status: ready`
(via review semantics) + comment; reassign = `POST /tasks/{id}/reassign`; comment =
`POST /tasks/{id}/comments`. Card creation on the phone: title + assignee + priority only (full
fields stay on Desktop).

---

## 4. How the agency team takes advantage (workflows)

Setup: one shared board (e.g. `agencia`), `kanban.default_assignee` unset, each bot profile with
the `kanban` toolset, the "Agencia" group room subscribed via `home-subscribe`
(`plugin_api.py:1211-1225`) so completions land in the room.

1. **Brief → Pancho splits → bots run → user approves from the phone.** User tells Pancho (in
   his chat): "campaña META para Cliente X". Pancho `kanban_create` one triage card
   (`triage: true`), then `decompose_triage_task` fans out children
   (`hermes_cli/kanban_db_graph.py:90-166`). Cards assigned to Nico/Tomi/Vera run automatically
   on the next dispatch tick (≤60 s). Vera's review lands in "Waiting on you" → user taps
   **Aprobar** (`PATCH status: done`) → children promote automatically
   (`kanban_db.py:2738`).
2. **"Waiting on me" as the daily ritual.** Phone badge = review cards assigned to the user +
   blocked cards with `needs_input` (typed block kind is visible per card, `block_kind`). User
   unblocks (`POST /tasks/{id}` `status: ready`) or comments; sticky blocks need an explicit
   unblock (`kanban_db.py:2039-2060`).
3. **Cross-bot pipeline with dependencies.** Lola creates parent cards and links children
   (`kanban_link`); a child stays `todo` until parents are terminal
   (`kanban_db.py:2099-2106`) — the phone shows `progress {done,total}` per card (already in
   `/board` payload).
4. **Failures surface as push, recovery is one tap.** Breaker trips → `blocked` (or `gave_up`);
   droidbot-push sends "Tomi: Presupuesto blocked — needs_input". Phone: open card → reclaim
   (`POST /tasks/{id}/reclaim`) or reassign to another bot.
5. **Client updates from the room.** Cards auto-subscribe the originating session
   (`kanban.auto_subscribe_on_create` default true, `config_defaults.py:1904`); completions ping
   the Agencia room and the user's own chat — the phone just opens the chat to read them.

**What the `alado-companion` skill should teach bots:**
- Always `kanban_create` with a real `assignee` (unassigned never dispatches) and
  `tenant: agencia`; body = the full brief; `priority` for ordering.
- On a running card: `kanban_heartbeat` on long work; never touch other bots' cards — coordinate
  with `kanban_comment` or child cards; a worker may only mutate its own task
  (`tools/kanban_tools.py:250-263`).
- Complete with a real `summary` (empty evidence raises `EmptyCompletionError`,
  `kanban_db.py:2668`); block with a typed `kind` + reason (a `dependency` block re-kinds to
  sticky `needs_input` when there's no open parent, `:3128-3133`).
- Review etiquette: `kanban_request_review` names an installed reviewer with a summary; the
  reviewer answers with `kanban_request_changes` or `kanban_complete` — the user only sees cards
  that truly need a human decision.

---

## 5. Phased plan (MVP read-only → actions → push)

Files live in the Alado app (`app/src`). REST client follows the existing `apiFetch` pattern
(`app/src/lib/push.ts:85`); no JSON-RPC for kanban (REST-only, §2.2).

- **Phase A — Read-only "Waiting on me" (2–3 d).** New `app/src/lib/hermes/kanban.ts`
  (typed `GET /api/plugins/kanban/board`, `/tasks/{id}`, `/workflow`, `/stats`, `/profiles`),
  new `app/src/features/kanban/` (store + list + card detail, lazy-loaded route `app/src/app/`),
  Home badge via `/stats` (per-assignee counts). i18n keys in `app/src/i18n/en.ts`/`es.ts`.
  Requires live checks §6.1–6.5.
- **Phase B — Actions (2–3 d).** `PATCH /tasks/{id}` (status/assignee), `POST /tasks` (light
  create), `POST /tasks/{id}/comments`, `POST /tasks/{id}/reassign`, `POST /dispatch` nudge after
  writes (Desktop pattern, `apps/desktop/src/plugins/kanban/api.ts:412-437`). Optimistic updates
  with rollback on 409 (`plugin_api.py:651-655`).
- **Phase C — Live + push (2–3 d).** Optional WS `/events` (fallback: 20–30 s poll of `/board`
  scoped to the user's cards); extend `hermes-plugin/droidbot_push/plugin.yaml` +
  `__init__.py` with `kanban_task_completed`, `kanban_task_blocked` (and evaluate
  `on_kanban_task_updated` with `changed_fields` for "assigned to you", `plugins.py:170-171`) —
  pushes reuse the existing `_enqueue`/webpush path (`hermes-plugin/droidbot_push/__init__.py:40-49`).

---

## 6. Risks, unknowns, live-server checks

**Risks/unknowns**
- Board is shared across all profiles of the home: the phone must filter, never render the full
  board (perf + noise). `/board` size is unmeasured on our VPS.
- **NOT FOUND: due dates** — do not promise calendar/scheduling UX.
- `on_kanban_task_updated` carries `changed_fields` **names only** (`plugins.py:170-171`) — enough
  to detect `assignee`, but not the value; "a card was assigned to YOU" push needs the value →
  read from `task_events` payload or compare in the phone. Verify live.
- WS `/events` auth differs from REST (token/ticket) — if it's fragile behind the VPS reverse
  proxy, Phase C falls back to polling (Desktop does exactly that for OAuth remotes,
  `apps/desktop/src/api/plugins.ts:191-195`).
- `kanban_task_claimed` fires inside the dispatch lock (`plugins.py:158-159`) — push must be
  fire-and-forget (our `_enqueue` already is).
- Cards assigned to bots require those profiles to exist **on the VPS home** (multiplex serves
  them); a typo'd assignee parks the card with a one-time `skipped_nonspawnable` event
  (`kanban_db_dispatch.py:2077-2092`).
- Phone actions are single-user per backend — no extra authorization needed beyond the existing
  dashboard auth, but any Alado user can edit any card on the board. Acceptable for the agency
  (one operator), noted as a product decision.

**Exact checks for the architect on the VPS (do not run from here):**
1. `hermes plugins list` → `kanban` bundled, runtime `enabled`.
2. `hermes kanban list` → board `default` (or `agencia`) exists, no lock errors.
3. `curl -H "X-Hermes-Session-Token: $TOKEN" https://<vps>/api/plugins/kanban/board` → 200,
   JSON `{columns[…], latest_event_id}`.
4. `curl … /api/plugins/kanban/workflow` and `/api/plugins/kanban/stats` → columns/assignee counts.
5. `hermes -p lola tools list` (or config) → toolset `kanban` enabled for each of the 5 bots.
6. Create a card assigned to `lola` (`hermes kanban create -a lola "probe"`); within ≤60 s a
   worker spawns (gateway log / `/api/plugins/kanban/workers/active`); then `hermes kanban show`.
7. `wss://<vps>/api/plugins/kanban/events?token=…` (or loopback session token): PATCH a card and
   confirm an `{events, cursor}` frame arrives.
8. PATCH reassign from one profile to another via REST (Pancho → Lola) and confirm dispatch.
9. `hermes plugins list` shows `droidbot-push` enabled (prereq for Phase C pushes).
10. Confirm `/api/plugins/kanban/` answers through the exact `apiFetch` auth Alado uses today
    (same-origin backend URL in the PWA).

---

## 10-line summary

1. Kanban = one SQLite DB per board shared across all profiles of the Hermes home (`hermes_cli/kanban_db.py:1`); columns are `triage→todo→scheduled→ready→running→blocked→review→done` (`kanban_workflow.py:114-138`).
2. Cards are run automatically: the gateway-embedded dispatcher claims ready+assigned tasks every 60 s and spawns a worker as the assignee profile (`kanban_db_dispatch.py:2698-2701`).
3. Bots get 15 `kanban_*` tools (create/complete/block/comment/review/link…) in the `kanban` toolset (`tools/kanban_tools.py:1295-1315`); cross-bot assignment is native (assignee = profile name).
4. No due dates in the schema (NOT FOUND); `scheduled` is a park status, not a timestamp.
5. Client contract is REST at `/api/plugins/kanban/` (`/board`, `/tasks`, `/tasks/bulk`, `/reassign`, `/comments`, `/dispatch`…) + a WS `/events` tail of `task_events` (`plugin_api.py:43, 359-374, 1802-1847`); no kanban JSON-RPC over `/api/ws`.
6. Desktop renders a full 9-column board (plugin OFF by default, `plugin.tsx:85`) with 60 s/30 s polling + WS invalidation — the phone should NOT copy it.
7. Enablement = `hermes plugins enable kanban` + `hermes tools enable kanban` per bot profile; dispatcher needs no systemd unit; key knobs: `default_assignee`, `dispatch_interval_seconds`, `dispatch_profiles`.
8. Phone UX: Home badge + "Waiting on me" (my review/ready cards + my bots in flight) behind "Avanzado", card detail with one-tap move/approve/comment and "open bot chat" CTA.
9. Agency: brief→Pancho decomposes→bots run→user approves from phone; failures push via new `kanban_task_completed/blocked` hooks in `droidbot-push` (`hermes_cli/plugins.py:157-161`).
10. Phases: A read-only (2-3 d) → B actions (2-3 d) → C live+push (2-3 d); architect must run the 10 live-server checks in §6 before Phase A coding.
