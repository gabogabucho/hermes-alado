# Phase 1 — Chat contract (REST + JSON-RPC `/api/ws`)

Source of truth: `.hermes-ref/` pinned at `bf0203a`. Generated TS contract:
`apps/shared/src/gateway-contract.generated.ts` (method map `RpcMethods`, server→client
`ServerRequestMap`, events `BackendGatewayEventMap`). Python impl: `tui_gateway/methods_*.py`,
`tui_gateway/contracts/*.py`, `hermes_cli/web_routers/*.py`, `hermes_cli/web_server_gateway.py`,
`hermes_state_sessions.py`.

> Conventions: `path:line` cites the source file in `.hermes-ref/`. "RPC" = JSON-RPC over `/api/ws`
> (`tui_gateway/server.py` + `ws.py`). "REST" = HTTP under `hermes_cli/web_server.py` /
> `web_routers/*`.

---

## 1. Home list data

### 1.1 `GET /api/profiles`

- Route: `hermes_cli/web_routers/profiles.py:807-809` (`list_profiles_endpoint` → `_read_profiles`).
- `_read_profiles` (`profiles.py:796-804`) returns `{"profiles": [...]}` using `list_profiles(lazy_skill_count=True)`.
- Per-profile shape is `_profile_to_dict` (`profiles.py:84-100`):
  `name, path, is_default, model, provider, has_env, skill_count, gateway_running,
  description, description_auto, display_name, bot_title, distribution_name,
  distribution_version, distribution_source, has_alias`.
- **No `has_avatar`, no `ui_meta`, no session fields** here — the REST roster is metadata only.
  Those come from the **RPC** `profiles.list` (see §7) and the sidebar/sessions endpoints.

### 1.2 `GET /api/profiles/active`

- Route: `profiles.py:885-903`. Returns `{"active": <name>, "current": <name>}`.
- `active` = sticky default written by `hermes profile use`; `current` = the profile this running
  dashboard/process is scoped to (`profiles.py:887-901`). DroidBot's "principal bot" = `active`
  (or its `current` fallback).

### 1.3 `GET /api/profiles/sessions/sidebar`

- Route: `profiles.py:521-650` (`get_profiles_sessions_sidebar`), singleflight-cached.
- Query params (`profiles.py:523-525`): `recents_profile` (default `all`), `recents_limit` (default
  `20`, clamped `1..500`), `recents_exclude`, `cron_limit` (default `50`), `messaging_limit`
  (default `100`), `messaging_exclude`.
- Response (`profiles.py:636-650`):
  ```json
  {
    "recents":  { "sessions": [...], "profiles_truncated": {...}, "profiles_usage": {...} },
    "cron":     { "sessions": [...] },
    "messaging":{ "sessions": [...], "total": N },
    "errors": [...], "storage": {...},
    "profiles_failed": {...}            // only when a profile scan failed
  }
  ```
- Slices come from `db.list_sessions_rich(...)` with `min_message_count=1`, `archived=exclude`,
  `order_by_last_active=True`, `compact_rows=True`, `include_pinned=True` (`profiles.py:553-563`).
- Rows are stamped by `_tag_rows` (`profiles.py:243-254`): adds `profile`, `is_default_profile`,
  `is_active` (300 s heuristic: `ended_at is None and now - last_active < 300`), and coerces
  `archived`/`pinned` to real booleans.

### 1.4 `GET /api/sessions`

- Route: `hermes_cli/web_routers/sessions.py:183-273` (`get_sessions`).
- Query params (`sessions.py:183-187`): `limit` (default `20`, `0..100`), `offset` (default `0`),
  `min_messages` (default `0`), `archived` (`exclude|only|include`), `order` (`created|recent`),
  `source`, `sources`, `exclude_sources`, `cwd_prefix`, `full` (bool), `profile`.
- `order=recent` sorts by chain-tip `last_active` (compression-aware) via a recursive CTE
  (`hermes_state_sessions.py:1390-1428`).
- Response (`sessions.py:241-242`): `{"sessions": [...], "total", "limit", "offset", "storage"}`.
- Per-row: `list_sessions_rich` (`hermes_state_sessions.py:1345+`) then `_list_row`
  (`hermes_state_sessions.py:1337-1343`) which sets `preview` and drops internal ordering columns,
  plus `unread` via `session_unread` (`hermes_state_sessions.py:1473-1475`). `get_sessions` adds
  `is_active`, `profile`, `is_default_profile`, `archived`, `pinned` (`sessions.py:227-235`).
- `full=1` keeps `system_prompt`/`model_config`; otherwise `_strip_session_list_rows`
  (`hermes_cli/web_server_gateway.py:721-725`) strips only `_SESSION_LIST_HEAVY_FIELDS =
  ("system_prompt", "model_config")` (`web_server_gateway.py:718`).

### 1.5 `GET /api/sessions/search`

- Route: `sessions.py:286-458` (`search_sessions`).
- Query params (`sessions.py:287-289`): `q`, `limit` (default `20`, capped `100`), `profile`,
  `source`, `sources`, `exclude_sources`.
- Empty `q` → `{"results": []}` (`sessions.py:297-298`).
- Semantics (`sessions.py:290-296`): search by session **ID first**, then FTS5 message content;
  results deduped by compression lineage (branches are NOT collapsed into the parent).
- Result rows (`hit_payload`, `sessions.py:397-404`): `id, title, started_at, last_active,
  snippet/preview, role, session_started` (and `profile` tagging on id-match rows).

### 1.6 Which field gives what (the mobile home list)

| Need | Field | Where |
|---|---|---|
| Last-activity time | `last_active` (chain-tip `COALESCE(last_activity_at, started_at)`), also raw `last_activity_at` | `hermes_state_sessions.py:1419,1473-1475`; `profiles.py:267-268` |
| Last message preview | `preview` (≤80-char excerpt of newest active user/assistant message) | `_shape_preview` `hermes_state_common.py:149`; `_latest_message_preview` `methods_profiles.py:109-123` |
| Unread state | `unread` (bool) | `SessionDB.session_unread` `hermes_state_sessions.py:1068-1074` |
| Profile/avatar | **NOT in any of these rows.** `profile`/`is_default_profile` are the only profile markers | `sessions.py:230-231`, `profiles.py:247-248` |

### 1.7 Does Hermes track read state? YES.

- `unread` is **derived server-side** from a `last_read_at` watermark on the session row:
  `session_unread(row)` = `last_active > last_read_at`; `NULL last_read_at` = read
  (`hermes_state_sessions.py:1068-1074`).
- The write path is `SessionDB.set_session_read` (read/unread across the compression lineage,
  `hermes_state_sessions.py:1063-1065`): `last_read_at = now` (read) or `0` (unread).
- Exposed on the row as `unread` (`hermes_state_sessions.py:1333,1475`) and returned by
  `/api/sessions` and the sidebar.
- **REST write**: `PATCH /api/sessions/{id}` accepts `unread` in the body (`sessions.py:930`,
  model `web_models.py` "Read-state watermark … True = unread, False = read now, None = leave").
  The desktop syncs via `store/session-unread-remote.ts` (`setSessionUnreadRemote` / auto
  clear-on-open).

---

## 2. Open a chat

### 2.1 `session.create`

Params (`gateway-contract.generated.ts:3097-3116`, `SessionCreateParams`):
`profile, cols, source, cwd, cwd_explicit, messages (SeedMessage[]), parent_session_id, title,
model, provider, reasoning_effort, fast, service_tier, close_on_disconnect, hidden,
room_plumbing, follow_profile_config, idempotency_key`.

Result (`gateway-contract.generated.ts:3125-3131`, `SessionCreateResult`):
```ts
{ session_id: string, stored_session_id: string, message_count: number,
  messages: TranscriptMessage[], info: SessionLiveInfo }
```

### 2.2 `session.resume`

Params (`gateway-contract.generated.ts:3177-3188`, `SessionResumeParams`):
```ts
{ session_id: string   // STORED id OR an exact title
  , profile?, cols?, source?
  , lazy?: boolean
  , defer_history?: boolean
  , omit_messages?: boolean
  , eager_build?: boolean
  , close_on_disconnect?: boolean
  , inline_images?: boolean }
```

Result (`gateway-contract.generated.ts:3189-3210`, `SessionResumeResult`):
```ts
{ session_id, message_count, messages: TranscriptMessage[], info: SessionLiveInfo,
  stored_session_id?, resumed?, session_key?, messages_omitted?, hydrating?, running?,
  turn_started_at?, started_at?, status?,
  inflight?: InflightTurn,        // live/retained turn a reconnecting client rebuilds bubbles from
  queued?: QueuedPrompt,
  pending_approval?: PendingApproval,
  open_requests?: OpenRequestEntry[],  // unanswered server→client requests to re-render
  pending_connection?, todo_state?, auto_continue? }
```

- `omit_messages` / `defer_history` semantics: `omit_messages` returns no `messages`;
  `defer_history` opts into deferred resume hydration, streamed as `session.resume_progress`
  events (`gateway-contract.generated.ts:5862-5869`); `lazy` builds the agent lazily
  (`SessionLiveInfo.lazy`, `gateway-contract.generated.ts:573`).
- `session_id` may be a **stored id or an exact title** (`gateway-contract.generated.ts:3176`).

### 2.3 How the desktop picks a bot's canonical chat ("Bot Mode")

The canonical chat's only identity is **the session titled exactly `"Bot Chat"` on the profile**
(the `UNIQUE(title)` index makes it a registry of at most one row). From
`apps/desktop/src/AGENTS.md` (Bot Mode section) and the server side:

- Resolve via `session.list { title, include_hidden: true }` (hidden rows resolve because canonical
  chats are always hidden; compression lineages resolve to the live tip).
- If no row → `session.create` titled `"Bot Chat"`, born hidden, seeded with the bot's intro.
  Creation re-runs the lookup first ("adopt-before-mint") so a concurrent/pre-existing row is
  opened, never forked.
- **No session-id pin** is stored; the gateway reports the registry row as `canonical_session` on
  `profiles.list` (resolved server-side by title). See `methods_profiles.py:162-196`
  (`_canonical_session_row`: identity is the NAME, `get_session_by_title("Bot Chat")`,
  `resolved_id` = compression tip) and its use at `methods_profiles.py:244-245`.

### 2.4 History loading — REST vs resume

`GET /api/sessions/{id}/messages` (`sessions.py:739-783`):

- Params: `limit` (`None` → default latest page of `500`), `offset` (0), `order`
  (`None|oldest|latest`), `include_compacted` (bool), `inline_images` (bool, default `true`).
- Resolves the stored id and compresses to the live tip (`_resolve_session_id` +
  `resolve_resume_session_id`, `sessions.py:748-751`), includes compression ancestors
  (`include_ancestors=True`, `sessions.py:763-765`).
- Response (`sessions.py:774-783`):
  ```ts
  { session_id, profile, messages: [...], pagination: { limit, offset, order, returned } }
  ```
- Message projection = `_project_for_display` (`sessions.py:671-736`): hides untyped `[System: …]`
  scaffold notices, projects compaction summaries to `display_content`, adds tool-call `labels`.
- Per-message fields (matches `TranscriptMessage`, `gateway-contract.generated.ts:3133-3148`):
  `role, text, content, tool_call_id, timestamp, row_id, display_kind, display_metadata,
  name, context, args, labels, reasoning, …`.

**Recommendation for a mobile client:** use `session.resume` as the single open-chat call — it
returns `messages` + `info` + `inflight`/`pending_approval`/`open_requests` in one round trip,
which is exactly what you need to rebuild a live chat after reconnect. Use REST
`GET /api/sessions/{id}/messages` only for explicit history paging / "load older" (it supports
`offset`/`order` and `inline_images=false` to avoid re-downloading stored image bytes). Do NOT
rely on `session.resume` for full history paging — its `messages` are the transcript head plus
open-state snapshots, not a paginated window.

---

## 3. Streaming turn lifecycle

### 3.1 Ordered event sequence for one user turn

Emitted over `/api/ws` as JSON-RPC `event` notifications (`BackendGatewayEventMap`,
`gateway-contract.generated.ts:7026-7187`). Payload fields are the generated interfaces cited
inline. Typical order:

1. `message.start` — `{ display_kind?, display_text?, notification_category?, text? }`
   (`gateway-contract.generated.ts:5645-5651`). Empty for an ordinary admission; automation turns
   carry an async-result card.
2. `message.delta`* — `{ text: string|null, rendered?, verbose? }`
   (`gateway-contract.generated.ts:5653-5657`). **`text: null` is a segment boundary** (the agent's
   `stream_delta_callback(None)`, before tool lines); other viewers ignore empty chunks.
3. `reasoning.delta` / `thinking.delta` (legacy) — `{ text, rendered?, verbose? }`
   (`gateway-contract.generated.ts:5658-5663`); `reasoning.available` for non-streaming providers.
4. `message.interim` — `{ text, already_streamed }` (interim assistant commentary sealed as its own
   segment) (`gateway-contract.generated.ts:5664-5668`).
5. Tool activity:
   - `tool.start` — `{ tool_id, name, context?, args?, args_text?, preview?, labels? }`
     (`gateway-contract.generated.ts:5792-5801`).
   - `tool.generating` — `{ name }` (`gateway-contract.generated.ts:5816-5819`).
   - `tool.progress` — `{ tool_id, name, progress, total?, percent?, message? }` (MCP
     notifications, throttled to 1/500 ms/call) (`gateway-contract.generated.ts:5828-5836`).
   - `tool.complete` — `{ tool_id, name, args?, duration_s?, result?, summary?, result_text?,
     inline_diff?, todos?, revision?, labels? }` (`gateway-contract.generated.ts:5802-5815`).
   - `tool.output_risk` — `{ tool_id, name, risk, findings[], redacted }`
     (`gateway-contract.generated.ts:5820-5827`).
6. `status.update` — `{ kind, text }`; `kind` ∈ `status|lifecycle|compacting|goal|loop|heartbeat|
   process|…` (`gateway-contract.generated.ts:5742-5746`).
7. `message.complete` — `{ text?, usage?, status? (complete|error|interrupted), reasoning?,
   warning?, billing?, failure_reason?, rendered?, error?, recoverable?, error_surface?,
   partial?, persisted_turn? }` (`gateway-contract.generated.ts:5669-5687`).
8. `session.usage` — `{ usage?, … }` (status-bar view; `message.complete.usage` is authoritative)
   (`gateway-contract.generated.ts:5747-5774`).
9. `error` — `{ message }` (session-level failure outside a turn)
   (`gateway-contract.generated.ts:5637-5640`).

### 3.2 How deltas are batched

`message.delta` frames arrive **grouped in lots** over the WebSocket (plan §4.1). Each frame carries
`text`; a frame with `text: null` closes the reply segment before tool lines. Reasoning streams on
`reasoning.delta` / legacy `thinking.delta`, both `StreamDeltaPayload { text, rendered?, verbose? }`
(`gateway-contract.generated.ts:5658-5663`).

### 3.3 `prompt.submit` return

Params (`gateway-contract.generated.ts:2769-2787`, `PromptSubmitParams`):
`session_id, profile?, text?, display_kind?, interrupted?, queued?, surface?, voice_context?,
voice_turn?, title_preview?, truncate_before_user_ordinal?, truncate_before_row_id?,
truncate_before_message_id?, confirm_truncate?, confirm_empty_truncate?, confirm_deep_truncate?,
rebind_survivor_row_ids?`.

Returns (`gateway-contract.generated.ts:2789-2798`, `PromptSubmitResult`):
```ts
{ status?: 'streaming'|'queued'|'steered'|'redirected', voice_stopped?, user_row_id?,
  survivor_user_row_ids?, survivor_row_id_map?, turn_isolation?, admission_id?, forwarded? }
```
`status` is absent only on the typed-stop-phrase reply (`voice_stopped`). `survivor_*` fields let
the client rebind its cached `rowId`s after a truncation.

---

## 4. Approvals & clarify (server→client requests)

These are **server→client JSON-RPC requests**, not events: the backend sends a request frame with a
string id `srq-<12 hex>` and blocks the agent until the client responds with the **same id**
(`tui_gateway/server_requests.py:1-34`). A client must advertise
`client.capabilities { server_requests: true }` once per connection
(`server_requests.py:30-34`). Unanswered requests are replayed as `open_requests` by
`session.resume` (`server_requests.py:15-18,365-369`). Cancellation arrives as
`request.cancel { id, method, reason }` (`server_requests.py:9-13`).

### 4.1 `approval.request` (method name `approval`)

Params (`tui_gateway/contracts/server_requests.py:166-196`, `ApprovalRequestParams`):
```ts
{ request_id: string, command?: string (redacted), description?: string,
  choices?: ApprovalChoice[], allow_permanent?, allow_session?, smart_denied?,
  tool_name?, session_id, ...extra }
```
`ApprovalChoice = 'once' | 'session' | 'always' | 'deny'` (`server_requests.py:166-170`).

Result (`server_requests.py:190-193`, `ApprovalResult`): `{ choice: ApprovalChoice, all?: bool }`.

### 4.2 `approval.respond` (RPC method)

Params (`gateway-contract.generated.ts:2967-2973`, `ApprovalRespondParams`):
```ts
{ session_id: string, choice?: 'once'|'session'|'always'|'deny', all?: boolean, request_id?: string }
```
Result `{ resolved: number }`. `choice` is one of the offered `approval` choices; `all` resolves
every pending approval, `request_id` a specific one, neither = the oldest
(`gateway-contract.generated.ts:2966`). Related: `approval.pending` (list unresolved, returns
`{ approvals: PendingApproval[] }`, `gateway-contract.generated.ts:2937-2943`) and
`approval.received` (tells the backend the card is on screen so its timeout starts,
`gateway-contract.generated.ts:2958-2965`).

### 4.3 `clarify.request` (method name `clarify`)

Params (`server_requests.py:36-48`, `ClarifyRequestParams`):
```ts
{ questions: [{ qid: string, question: string, choices?: string[], multi_select?: boolean }],
  answers?: { [qid]: string|null }, session_id }
```
Result (`server_requests.py:50-56`, `ClarifyResult`):
`{ answers?: { [qid]: string|null }, outcome?: 'submitted'|'timed_out'|'cancelled' }`.
A response without `answers` = cancel-all.

Batch clarify answers **one question at a time** via `clarify.lock` (`gateway-contract.generated.ts:
2917-2927`, `ClarifyLockParams { request_id, question_id, answer? }` → `{ status: 'ok'|'expired',
remaining? }`) or the generic `request.answer { id, result }`. The last lock resolves the request.

> `clarify.respond` (`ClarifyRespondParams { session_id, execution_generation, prompt_id, answer }`,
> `gateway-contract.generated.ts:4807-4812`) is the **older** prompt-based clarify, distinct from the
> server→client `clarify` request + `clarify.lock`. A mobile client should implement the
> `clarify` request + `clarify.lock` / `request.answer` path.

### 4.4 `sudo.request` and `secret.request`

Both are one-string prompts returning `ValueResult { value: string }` (`''` = skipped/declined)
(`server_requests.py:26-30`):

- `sudo` — `{ command? (redacted) }` → masked sudo password for the terminal tool
  (`server_requests.py:206-213`).
- `secret` — `{ env_var, prompt, metadata? }` → masked value for a named env var (skills / setup)
  (`server_requests.py:216-223`).

**Does a phone client need to handle them?** Approval + clarify are **required** (they gate shell /
risky actions and the clarify tool). `sudo` only fires for the terminal tool's masked sudo, and
`secret` only for skills/setup flows requesting a masked env value — DroidBot's Bóveda is
read-only/never-reveal (plan D4), so `secret` should be answered with an empty value or surfaced
only if you ship those flows. A client that never advertised `server_requests: true` makes `send()`
fail fast (agent is not stalled) (`server_requests.py:30-34,191-201`).

---

## 5. Bot-to-bot events (plan screen 3)

### 5.1 The `message_agent` tool

- Lives in `tools/bot_mode_dm.py`. It is **injected, not registered** — the schema is added only to a
  Bot Chat session's agent on a Bot-Mode-managed install (`bot_mode_dm.py:1-13`, `ensure_message_agent_tool`
  `bot_mode_dm.py:140-166`; dispatch re-checks the gate so a forged call returns a structured error).
- Schema (`bot_mode_dm.py:67-120`): `{ target: string, message: string }`, max message 16000 chars
  (`MESSAGE_MAX_CHARS`, `bot_mode_dm.py:43`). Description: fire-and-forget, returns an ack
  (`status: queued` + `delivery_id`), does NOT return the reply.
- Handler `message_agent_tool` (`bot_mode_dm.py:201-297`): validates target against the live roster;
  prefixes the message server-side with the sender signature:
  `"Message from 🤖 {display_name} (@{handle}): "` (`bot_mode_dm.py:243`); author id
  `"bot:{me}"` (`bot_mode_dm.py:246`).
- Transport: **it is a `terminal` tool call** — local `hermes -p <name> chat --in ~ -c "Bot Chat"
  --create-if-missing -Q --query-file <tmp>` (peer: `hermes peer dm`) run with
  `terminal_tool(background=True, notify_on_complete=True)` (`bot_mode_dm.py:11-13,266,296`). The
  reply arrives later as a background-process completion notification.

### 5.2 `bot_relay.*` (cross-connection A2A)

RPC methods (`tui_gateway/methods_bot_relay.py`):
- `bot_relay.roster.sync` — `{ agents }` → `{ count }`; pushes OTHER connections' agents so
  `message_agent` can resolve them (`methods_bot_relay.py:31-53`).
- `bot_relay.outbox.drain` — `{}` → `{ envelopes }`; claim pending cross-connection envelopes
  (`methods_bot_relay.py:56-64`).
- `bot_relay.deliver` — `{ profile, message, from_profile, from_handle, from_connection, … }` →
  one-turn Bot Chat delivery on the target gateway (`methods_bot_relay.py:67-121`).
- `bot_relay.reply` — `{ id, reply?, error?, reason? }` → `{ ok }`; write the reply/error back for
  the sender-side waiter (`methods_bot_relay.py:124-139`).
- Event `bot_relay.outbox.pending` (ChangeSignalPayload) tells the client an envelope is queued
  (`gateway-contract.generated.ts:7037-7038`).

### 5.3 Live rendering — the "Escribió a X" / "Mensaje de X" separators

The desktop renders bot-to-bot traffic as **timeline events, not bubbles**:

- **Sender side** (outgoing): the delivery is a `terminal` tool call whose `command` matches
  `DELIVERY_COMMAND_RE` = `… hermes -p <agent> chat … -q "Message from …"`
  (`apps/desktop/src/components/assistant-ui/thread/agent-delivery.tsx:14-15`).
  `deliveryTargetFromCommand(command)` extracts the target (`agent-delivery.tsx:17-21`).
  `AgentDeliveryNotice` renders `Messaging {target}` / `Messaged {target}` and, once the quiet run
  returns the recipient's reply, `Message from {target}` with the reply in a collapsible `show
  message` (`agent-delivery.tsx:150-195`).
- **Recipient side** (incoming): arrives as a `role="user"` message whose text matches
  `AGENT_MESSAGE_RE` = `Message from 🤖 <name> (@<handle>): <body>` (plus the legacy
  `[Message from agent '<name>'] <body>` form) (`apps/desktop/src/components/assistant-ui/thread/
  user-message.tsx:85-94`). It renders as `AgentMessageNote` — a compact centered notice
  (`Message from {sender}`) with the body behind `show message` (`user-message.tsx:181-234`).

So for DroidBot: detect outgoing `message_agent`/delivery by (a) the terminal tool command matching
the delivery regex, or (b) the `message_agent` tool-call part with `args.target`
(`agent-delivery.tsx:71-79`); detect incoming by matching `AGENT_MESSAGE_RE` on a user-role row.
Avatar = resolved via `resolveAgentAvatar(handle)` (§7).

### 5.4 Persisted history (`/messages`) shape

- **Incoming** bot message = an ordinary `role="user"` row whose `content` is literally
  `"Message from 🤖 X (@handle): <body>"` (the recipient's turn runs on it, `user-message.tsx:89-91`).
  It persists and is returned by `GET /api/sessions/{id}/messages` as-is (so the mobile client can
  apply `AGENT_MESSAGE_RE` on replay).
- **Outgoing** delivery = the `terminal` tool call (a `role="assistant"` row with a tool-call part
  `name="message_agent"`? No — see note) → concretely the sender's transcript has the `terminal`
  tool row whose `args.command` is the delivery command, and its `result` carries the recipient's
  reply text (`replyTextFromResult`, `agent-delivery.tsx:86-119`). `message_agent` is dispatched
  through the terminal tool, so there is no dedicated `message_agent` tool row in history — the
  `dispatchedTo` scan reads `toolName === 'message_agent'` for the **synthetic/UI** tool-call parts
  the composer emits, not persisted storage.

---

## 6. Interrupt, attachments, voice

### 6.1 `session.interrupt`

Params (`gateway-contract.generated.ts:3597-3606`): `{ session_id, profile?, expected_hosted_task_id? }`.
Result `{ status: 'interrupted'|'not_interrupted', interrupted?, turn_isolation? }`.

### 6.2 Attachments

- `file.attach` (`gateway-contract.generated.ts:2859-2874`): params
  `{ session_id, path?, data_url?, name? }` (`path` when gateway-visible, else `data_url`);
  result `{ attached, name, path, ref_path, ref_text, uploaded }`.
- `image.attach_bytes` (`gateway-contract.generated.ts:2823-2831`): params
  `{ session_id, content_base64?, data?, filename?, ext? }` (magic bytes decide format);
  result `AttachedImageResult { name?, width?, height?, token_estimate?, attached, path?, count?, … }`
  (`gateway-contract.generated.ts:2804-2817`).
- `pdf.attach` (`gateway-contract.generated.ts:2832-2850`): params
  `{ session_id, path?/content_base64?/data?, filename?, first_page?, last_page? }`;
  result `{ attached, filename, pages_attached, pages, count, text }` (per-call page cap enforced
  server-side).
- There is no size limit exposed on the RPC params; limits (e.g. image/PDF page caps) are
  server-side and reported in results/errors.

### 6.3 `POST /api/audio/transcribe`

- Route: `hermes_cli/web_routers/audio.py:86-146` (`transcribe_audio_upload`).
- Body (`web_models.py:86-88`, `AudioTranscriptionRequest`): `{ data_url: string, mime_type?: string }`.
- Must be a base64 data URL (`audio.py:90-96`); mime must be `audio/*` or `video/webm`
  (`audio.py:98-101`); max 25 MB (`_MAX_TRANSCRIPTION_UPLOAD_BYTES = 25*1024*1024`, `audio.py:49`).
- Response (`audio.py:143-146`): `{ ok: true, transcript: string, provider: string }`.
  "empty transcript" is normalized to `{ ok: true, transcript: "", provider }` (`audio.py:139-140`).
- Uses `tools.voice_mode.transcribe_recording` (filters Whisper hallucinations) (`audio.py:127-129`).

---

## 7. Avatars

### 7.1 Where avatars are stored (write)

- RPC `profiles.set_asset` (`tui_gateway/methods_profiles.py:412-447`): params
  `{ name, asset: "avatar", data (data URL or base64, PNG/JPEG/WebP ≤ 2 MB, format sniffed),
    clear?: true }`. Writes `<profile_home>/assets/avatar.{png|jpg|webp}` atomically (one canonical
  file per asset, `methods_profiles.py:426,442-446`). `asset` is **`"avatar"` only**
  (`methods_profiles.py:419-420`). Magic bytes `_ASSET_MAGIC` at `methods_profiles.py:19-20`.
- Desktop avatar flows: `avatar-image.ts`, `avatar-picker.tsx`, `avatar.tsx` under
  `apps/desktop/src/plugins/hermes-bots/` (the "criatura" appearance is the profile avatar asset;
  plan §3 note).

### 7.2 Reading it back

- RPC `profiles.get_asset` (`methods_profiles.py:450-464`): params `{ name, asset }` →
  `{ found: true, mime, size, data: "data:<mime>;base64,…" }` or `{ found: false }`.
- `profiles.list` (RPC) stamps `has_avatar` (cheap existence check) per row
  (`methods_profiles.py:279`; canonical gateway `gateway/session_group_controls.py:413`).
- Desktop resolution order (`user-message.tsx:143-164`): `profiles.list { include_sessions:false }`
  → find profile by handle (alias `hermes` → `default`) → check `has_avatar` →
  `profiles.get_asset { asset:'avatar', name }` → data URL.
- **There is NO REST endpoint for the avatar** (`/api/profiles` does not return it, no
  `/api/profiles/{name}/avatar` route exists in `web_routers/profiles.py`). Avatar read-back is
  **RPC-only** (`profiles.get_asset` / `profiles.list.has_avatar`).

### 7.3 Stored-data shape

`assets/avatar.{png|jpg|webp}` (a single canonical file, ext decided by sniffed magic, ≤ 2 MB) under
the profile home; the RPC re-encodes it as a base64 data URL on read. No metadata beyond the file
itself is persisted (`methods_profiles.py:17,443-447`).
