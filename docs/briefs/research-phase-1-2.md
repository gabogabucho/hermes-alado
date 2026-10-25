# Research brief — contract map for Phases 1 & 2 (READ-ONLY)

You are a researcher. **You write no app code** and you **do not commit** (another agent is
committing on this branch). Only create files under `docs/research/`.

Source of truth: `.hermes-ref/` (Hermes git checkout pinned at `bf0203a`, same as our VPS).
Do not read `%LOCALAPPDATA%\hermes\hermes-agent`. Do not touch `repo/` or the VPS.
Context: `PLAN-droidbot-v2.md` §3, §4, §6 (Fase 1 and Fase 2).

For every claim, cite `path:line` (or symbol). If something is ambiguous, say so — never guess.
Use the generated contract `apps/shared/src/gateway-contract.generated.ts` (method map +
`BackendGatewayEventMap`) as the first stop, then the Python implementation.

## Output 1 — `docs/research/phase-1-chat-contract.md`

1. **Home list data.** Exact request/response of `GET /api/profiles`, `GET /api/profiles/active`,
   `GET /api/profiles/sessions/sidebar`, `GET /api/sessions` (query params, pagination, sorting),
   `GET /api/sessions/search`. Which field gives last-activity time, last message preview, unread
   state (does Hermes track read state at all?), and profile/avatar info.
2. **Open a chat.** `session.create` vs `session.resume` params/results; how the desktop "Bot Mode"
   picks the canonical chat of a bot (`apps/desktop/src/plugins/hermes-bots/`). How history is
   loaded: `GET /api/sessions/{id}/messages` shape vs `session.resume` returning messages vs
   `omit_messages` / `defer_history`. Recommend one approach for a mobile client.
3. **Streaming turn lifecycle.** Ordered list of events for one turn (`message.start`,
   `message.delta`, `reasoning.*`, `tool.start/progress/complete`, `message.complete`,
   `status.update`, `error`) with payload fields used for rendering. How deltas are batched.
   What `prompt.submit` returns.
4. **Approvals & clarify.** `approval.request` / `clarify.request` payloads and the exact
   `approval.respond` / `clarify.respond` params (choices like once/session/always/deny).
   `sudo.request`, `secret.request`: what they are and whether a phone client must handle them.
5. **Bot-to-bot events (plan screen 3).** How a `message_agent` tool call and `bot_relay.*`
   replies appear (a) live as events and (b) in persisted history (`/messages`). Exact fields to
   render "Escribió a X" / "Mensaje de X" separators. Look at `tools/` for `message_agent`,
   `gateway/relay/*`, `tui_gateway/methods_bot_relay.py`, and how the desktop renders them.
6. **Interrupt, attachments, voice.** `session.interrupt`; `file.attach` / `image.attach_bytes` /
   `pdf.attach` params and limits; `POST /api/audio/transcribe` request/response.
7. **Avatars.** Where the desktop stores bot avatar/appearance (`profiles.set_asset`, avatar
   files in `hermes-bots`), and how a client reads it back (REST or RPC). Shape of the stored data.

## Output 2 — `docs/research/phase-2-groups-contract.md`

1. **Server-side groups.** Full contract of `tui_gateway/methods_groups.py`: `groups.capabilities`,
   `list`, `create`, `state`, `send`, `rename`, `disband`, `stop`, `approve`, `retry`, `log`,
   and the `groups.*` events they emit. Is it enabled by default? What config/conditions gate it
   (`start_hosted_room_service`, execution policy, api_server key)? Does it run without any
   client connected (true server-side rounds)?
2. **Desktop usage.** Does the desktop at this commit use `groups.*` RPC, or still the
   client-side orchestrator in `apps/desktop/src/plugins/hermes-bots/group-*.ts`? Is there a
   switch/flag between them?
3. **Recommendation** for plan decision D2: can DroidBot skip `ClientGroupEngine` and use the
   server groups directly? List risks, missing pieces, and what a `HostedGroupEngine` would call.

## Report

At the end, print a 10-line summary: key findings, surprises vs the plan, open questions.
