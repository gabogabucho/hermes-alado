# Phase 2 — Groups contract (server-side rooms vs client orchestrator)

Source of truth: `.hermes-ref/` pinned at `bf0203a`. This document answers the three questions in
`docs/briefs/research-phase-1-2.md` Output 2, with `path:line` citations.

> **Headline finding (surprises vs the plan):** the plan's §4.3 claim — "todavía no hay una API
> pública estable para clientes" and "hoy la app de escritorio los orquesta en
> `hermes-bots`" — is **out of date for this commit**. The desktop already ships a **canonical
> server-side group client** (`canonical-groups.ts` + `canonical-group-capabilities.ts`) that calls
> `groups.*` RPC, and auto-falls back to the legacy client orchestrator only when the hosted-room
> driver is not running. See §2 and §3.

---

## 1. Server-side groups

### 1.0 Two separate `groups.*` implementations exist — know which transport you're on

| | `/api/ws` (tui_gateway) | canonical `hermes-gateway-v1` (native) |
|---|---|---|
| Dispatch | `tui_gateway/methods_groups.py` | `gateway/session_group_controls.py` |
| Contract models | `tui_gateway/contracts/groups_bot_relay.py` | `tui_gateway/contracts/canonical.py` (`canonical_method(...)`) |
| Who uses it | the TUI/Desktop embedded `/api/ws` server | the **Desktop app** (`apps/desktop`, via the plugin SDK) |

DroidBot Phase 0 connects over **`/api/ws`**, so the relevant surface is
`tui_gateway/methods_groups.py` — but the desktop's reference behavior is the canonical path, and
the two differ in a few methods (see §3).

### 1.1 `tui_gateway/methods_groups.py` (the `/api/ws` contract)

Method catalog (`methods_groups.py:18-22`, `_METHODS`):
```
groups.capabilities, groups.list, groups.create, groups.state, groups.send,
groups.rename, groups.log, groups.disband, groups.replicate, groups.replica_state,
groups.promote, groups.demote, groups.stop, groups.retry, groups.approve,
groups.peer.invite, groups.peer.revoke, groups.peer.register
```
Every one runs on the RPC pool (`methods_groups.py:17`); registered onto `server.py` via
`methods_groups.register` (called from `methods_bot_relay.register`,
`methods_bot_relay.py:142-151`).

Per-method contract (the `_room_method` / `_passthrough` envelope adds a hosted-room error shape;
`db=True` methods open the default room DB):

- **`groups.capabilities`** (`methods_groups.py:216-245`) → `{ protocol_version, driver,
  persistent_process, authority_gateway_id, room_link: {enabled, profile, catalog, endpoint},
  features: [...], methods: [...], max_log_limit }`. `driver` = `bool(service and
  service.runtime.status()["running"])` (`methods_groups.py:220-221`); `room_link` is enabled only
  when durable run-idempotency storage + a `gateway_room_grant_secret` exist, else
  `{enabled:false, reason}` (`methods_groups.py:225-236`).
- **`groups.list`** (`methods_groups.py:344-354`) → params `{ limit (MAX_ROOM_LIST_LIMIT),
  offset (0), include_disbanded }`; result `{ rooms, next_offset }`.
- **`groups.create`** (`methods_groups.py:357-364`) → params `{ room_id?, name?, members? }`;
  result `{ room }`. Idempotent; authority = this gateway's install identity.
- **`groups.state`** (`methods_groups.py:367-378`) → params `{ room_id, include_disbanded }`;
  result `{ room, driver_status? }` (replay cursor + fenced authority state).
- **`groups.send`** (`methods_groups.py:381-393`) → params `{ room_id, event_id, payload }`;
  result `{ event, client_event_id, accepted, driver_started }`. **Inert `message.user` only —
  the actor is server-owned** (docstring `methods_groups.py:385`).
- **`groups.rename`** (`methods_groups.py:483-486`) → params `{ room_id, event_id, name }`;
  result `{ room }` (atomic with its replay event).
- **`groups.log`** (`methods_groups.py:487-493`) → params `{ room_id, since_seq (0), limit (100),
  include_disbanded }`; result = `gateway.hosted_rooms.read_events` page (monotonic room-log delta
  after `since_seq`).
- **`groups.disband`** (`methods_groups.py:396-426`) → params `{ room_id, cancel_id? }`; result
  `{ tombstone }`. Permanently tombstones a room id; checks authority conflict.
- **`groups.stop`** (`methods_groups.py:429-434`) → params `{ room_id, cancel_id? }`; result
  `{ cancelled: n }` (durably cancel queued/running work).
- **`groups.approve`** (`methods_groups.py:437-445`) → params `{ room_id, member_id, task_id,
  execution_generation, choice, request_id }`; result `{ approved: true, result }`.
- **`groups.retry`** (`methods_groups.py:448-462`) → params `{ room_id, task_id }`; result
  `{ retried: true, task }`.
- Replication/peer (`methods_groups.py:248-342,494-522`): `groups.replicate`,
  `groups.replica_state`, `groups.promote`, `groups.demote`, `groups.peer.invite/revoke/register`
  — RoomLink peer machinery (multi-gateway authority), not needed for a single-VPS phone client.

### 1.2 `gateway/session_group_controls.py` (the canonical path the Desktop uses)

- `GROUP_METHODS` maps each method to a required capability (`session_group_controls.py:13-28`):
  `groups.capabilities/list/state/log` → `session:read`; `groups.create/rename/disband/stop/retry/
  discard` → `session:control`; `groups.send` → `session:submit`; `groups.approve` → `session:approve`.
- Extra methods vs the tui_gateway set: **`groups.discard`** (`session:control`), and
  **`groups.attachment.upload` / `groups.attachment.download`** (`session:submit` / `session:read`)
  (`session_group_controls.py:22-23,26`).
- `dispatch_group_control` validates capability, profile match, and the allowed param set
  (`_FIELDS`, `session_group_controls.py:29-46`), then runs `_group`/`_execution_control` under
  `_profile_runtime_scope` (`session_group_controls.py:49-85`).
- `groups.capabilities` here returns `{ protocol_version, driver: service is not None,
  persistent_process: True, authority_gateway_id, room_link: {enabled: False, reason:
  'canonical_driver_required'}, features: ['room_identity','monotonic_log','replayable_disband'],
  methods: [...], max_log_limit, seatable_profiles: [...] }` (`session_group_controls.py:126-136`).
- `groups.approve` here only accepts `choice ∈ {'once','deny'}` and requires a string `request_id`
  (`session_group_controls.py:254-260`); `groups.retry`/`groups.discard` require
  `execution_generation ≥ 1` + `member_id` + `task_id` (`session_group_controls.py:240-252`).

### 1.3 Events the groups emit

There is **no `groups.*` event notification** in `BackendGatewayEventMap`
(`gateway-contract.generated.ts:7026-7187`). Room activity is surfaced as:
- typed room-log events (e.g. `message.user`) replayed via `groups.log` (`read_events`);
- `groups.state` → `driver_status` with `member_activity` (live tasks) and `pending_actions`
  (approval/retry) — see `RoomDriverStatus` in the vendored contract
  (`repo/src/lib/hermes/vendor/gateway-contract.generated.ts:1631-1650`).
The "authority_epoch", "monotonic_log", "typed_events" features are in `groups.capabilities.features`
(`methods_groups.py:241-244`).

### 1.4 Enabled by default? Gating? True server-side rounds?

- **Enabled automatically by the canonical gateway runtime** — not gated by any client connection.
  `gateway/run_runtime.py` calls `ensure_hosted_service(runner)` (`run_runtime.py:546-547`) and
  `start_ready_hosted_services(runner)` (`run_runtime.py:580-581`) during runtime init; the service
  is a process-owned `CanonicalHostedRoomService` (`gateway/session_hosted_service.py:16,238-273`)
  started once the session-runtime descriptor reaches `'ready'` and the fleet isn't draining
  (`session_hosted_service.py:263-273`).
- **True server-side rounds: yes.** The `HostedRoomService` + driver (`gateway/hosted_room_driver.py`
  lease + queued/running/settled task state machine) run inside the gateway process; member turns
  run in their own sessions. `groups.capabilities.driver` is `service is not None` (i.e. the driver
  is live), and the desktop's `groupExecutionMode` keys off exactly that (§2). Nothing requires a
  client to hold the loop — a round continues while the gateway runs.
- **Execution policy / api_server key gating** applies to the *peer / RoomLink* surface, not the
  local canonical driver: `_profile_execution_policy` → `gateway.hosted_room_execution_policy.py::
  execution_policy_mapping` resolves the API-server policy from the served profile's config
  `{ version, target_profile, enabled_toolsets, approval_mode, max_iterations, policy_digest }`
  (`hosted_room_execution_policy.py:87-110`). `room_link` (cross-gateway) additionally requires
  durable run-idempotency storage and `gateway_room_grant_secret` (the `API_SERVER_KEY` secret
  scope) (`methods_groups.py:112-125,140-154,225-236`); in the canonical path `room_link.enabled`
  is always `False` (`session_group_controls.py:133`).

---

## 2. Desktop usage at this commit

The desktop uses **both**, selected dynamically by `groups.capabilities`:

- **Canonical (server-side) path** — `apps/desktop/src/plugins/hermes-bots/canonical-groups.ts`:
  `discoverCanonicalGroups` calls `groups.capabilities` + `groups.list` (`canonical-groups.ts:74-98`);
  `createCanonicalGroup` calls `groups.create { room_id, name, members }` with 2–6 members and
  unique, non-reserved handles (`canonical-groups.ts:100-145`); `actCanonicalGroup` maps
  `retry → groups.retry`, `discard → groups.discard`, `approval → groups.approve`
  (`canonical-groups.ts:147-176`, with `groups.approve` params `choice ∈ {once,deny}` +
  `request_id`).
- **Legacy (client-side) path** — `group-chat.ts` / `group-rounds.ts` / `group-turns.ts` /
  `group-membership.ts` / `routing.ts` / `relay.ts` under `hermes-bots/`. It orchestrates
  round-robin turns in hidden per-member sessions and **projects rooms into the default profile's
  `ui_meta`** under the key `hermes-bots-groups` (a "v3 envelope": `{ deleted, rooms, updatedAt,
  version }`, each room `{ roomId, name, members, image, log, omitted, revision, holdDetection }`)
  (`group-chat.ts:49-81`). The projection is written via `profiles.configure { ui_meta,
  ui_meta_expected_revisions }` with **CAS** and read-back of the advanced revision
  (`group-chat.ts:1175-1208`), bounded to `GROUP_CHAT_SYNC_MAX_BYTES = 48000` / 16 messages /
  1200 chars/message (`group-chat.ts:50-56`).
- **The switch** — `apps/desktop/src/plugins/hermes-bots/canonical-group-capabilities.ts`:
  `groupExecutionMode(value)` returns:
  - `'canonical'` when `capability.driver === true` (`canonical-group-capabilities.ts:25`);
  - `'legacy'` when `driver === false && persistent_process === false && !ownsRooms`
    (`canonical-group-capabilities.ts:31-33`, `ownsRooms` = has `protocol_version` /
    `authority_gateway_id` / `groups.create` method / `canonical_session_owner` feature);
  - `'unavailable'` otherwise.
  `useGroupCapability(active)` polls `groups.capabilities` and `seatableGroupBots` filters the New
  Group picker by mode + `seatable_profiles` (`canonical-group-capabilities.ts:72-157`).

So the desktop is **already on the hosted-room driver by default** where the gateway exposes it,
and the client-side orchestrator is the fallback. Note the plan's `ui_meta` lock (D3) is the
**legacy** path's projection; the canonical path uses `groups.*` RPC + server authority fencing
(`authority_epoch`, `coordinator_fencing` features) instead.

---

## 3. Recommendation for decision D2

**Can DroidBot skip `ClientGroupEngine` and use the server groups directly? Yes — and it should.**

- The server surface DroidBot would hit is `tui_gateway/methods_groups.py` (same `/api/ws`
  transport as Phase 0). It exposes everything a mobile group UI needs:
  `groups.capabilities → list → state → send → log → stop → approve → retry → rename → disband`.
- The desktop's `canonical-groups.ts` is a working reference for a thin `HostedGroupEngine`
  (discover rooms with `groups.list`, create with `groups.create`, read the log with
  `groups.log`, answer member approvals with `groups.approve {once|deny}` + `request_id`).
- Porting the legacy client orchestrator (`group-chat.ts`/`group-rounds.ts`/`group-turns.ts` +
  its MIT tests) is now **unnecessary** for the happy path, and it would re-introduce the
  "room only advances while a client holds it" limitation the plan already flags (§4.3).

### What a `HostedGroupEngine` would call (over `/api/ws`)

| Action | RPC | Params |
|---|---|---|
| Probe capability | `groups.capabilities` | `{}` → read `driver` |
| List rooms | `groups.list` | `{ limit, offset, include_disbanded? }` |
| Create | `groups.create` | `{ room_id?, name, members }` |
| Read state/driver | `groups.state` | `{ room_id }` |
| Send (human message) | `groups.send` | `{ room_id, event_id, payload }` |
| Read replay log | `groups.log` | `{ room_id, since_seq, limit }` |
| Answer approval | `groups.approve` | `{ room_id, member_id, task_id, execution_generation, choice, request_id }` |
| Retry a task | `groups.retry` | `{ room_id, task_id }` |
| Stop a round | `groups.stop` | `{ room_id, cancel_id? }` |
| Rename | `groups.rename` | `{ room_id, event_id, name }` |
| Disband | `groups.disband` | `{ room_id, cancel_id? }` |

### Risks / missing pieces

1. **Transport mismatch.** DroidBot speaks `/api/ws`; the desktop's canonical client speaks the
   native `hermes-gateway-v1` transport. The `/api/ws` `groups.*` set is missing `groups.discard`
   (use `groups.stop` + `groups.retry` instead), `groups.attachment.upload/download`, and
   `seatable_profiles` (the tui_gateway `groups.capabilities` at `methods_groups.py:237-245` does
   NOT include it). Verify these against the VPS before relying on them.
2. **`driver` may be `false`.** If the VPS `/api/ws` server hasn't started `HostedRoomService`
   (its `start_hosted_room_service` at `methods_groups.py:41-56` is not obviously invoked by the
   tui_gateway server path — the canonical gateway starts its own via `session_hosted_service`),
   `groups.capabilities.driver` is `false` and `groups.create/send/…` fail with the
   `_WORKER_UNAVAILABLE` / driver-unavailable errors (`methods_groups.py:30-31`). **This is the
   #1 thing to verify on the VPS** (can't be confirmed here — READ-ONLY, no VPS access).
3. **Inert `message.user` only.** `groups.send` accepts only a `message.user` payload; the actor is
   server-owned (`methods_groups.py:385`). A human "send into the group" must be shaped as the
   event the driver expects — mirror the desktop's `committed_submission_payload`
   (`session_group_controls.py` / `canonical-group-send.ts`).
4. **No live event push.** There is no `groups.*` event in `BackendGatewayEventMap` — a mobile
   client must **poll** `groups.log { since_seq }` + `groups.state { driver_status }` to render
   rounds (the desktop does exactly this for `pending_actions`/`member_activity`).
5. **Approval choice narrowing.** The canonical path only accepts `once|deny` for room approvals
   (`session_group_controls.py:254-260`); the tui_gateway `groups.approve` passes `choice` through
   verbatim (`methods_groups.py:443`). Confirm the VPS's accepted set.
6. **Lock (D3) is a non-issue on the canonical path.** Server-side authority fencing
   (`authority_epoch`, `coordinator_fencing` features) replaces the `ui_meta` TTL lock — D3 only
   matters if you keep the legacy orchestrator.

### Bottom line

Recommend **`HostedGroupEngine` over `groups.*` RPC** (mirror `canonical-groups.ts`), and drop
`ClientGroupEngine` for v2 — but first **verify on the VPS** that (a) the `/api/ws` server starts
the hosted-room service (or is multiplexed into the canonical gateway's service) so
`groups.capabilities.driver === true`, and (b) the `groups.send` payload shape matches what the
driver expects. Keep a `ui_meta`-compatible read-only fallback only if the VPS turns out not to
expose `groups.*` over `/api/ws`.
