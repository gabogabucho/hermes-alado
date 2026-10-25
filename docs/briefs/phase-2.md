# Phase 2 brief — Groups on the server-side room engine

Implements `PLAN-droidbot-v2.md` §6 "Fase 2" with revised D2 (see plan §0): **server-side groups**
over `groups.*` JSON-RPC on `/api/ws`. Verified live on our VPS: `groups.capabilities` →
`driver: true`, `persistent_process: true`, `protocol_version: 2`. App code in `repo/`.
Hermes source of truth: `C:\Users\gabog\orca\projects\Hermes-Droidbot\.hermes-ref\` (pinned
`bf0203a`). Rules in `repo/AGENTS.md` apply (never run the dev server in the foreground).

**Read first:** `docs/research/phase-2-groups-contract.md` (from the main checkout:
`C:\Users\gabog\orca\projects\Hermes-Droidbot\docs\research\`), then the desktop reference
`.hermes-ref/apps/desktop/src/plugins/hermes-bots/canonical-groups.ts`,
`canonical-group-capabilities.ts`, `canonical-group-send.ts` (send payload shape!) and how the
desktop renders a room (grep `groups.log`, `driver_status`, `pending_actions`, `member_activity`).
Python: `tui_gateway/methods_groups.py`, `gateway/hosted_rooms.py`, `hosted_room_driver.py`.

**Parallel work:** others are restyling Home/Chat (Phase 1c). Write only in
`repo/src/features/groups/**` and NEW files in `repo/src/lib/hermes/`. You may add route lines in
`repo/src/app/Shell.tsx` (`/group/:roomId`, `/groups/new`). Do NOT edit Home — instead export from
`features/groups` a `useGroupRows()` hook returning rows the Home list can render
(`{ roomId, name, members: string[], preview, lastActivity, needsYou: boolean }`); the architect
wires it into Home. Reuse `src/ui/*` (incl. `Avatar`, `AvatarStack`) and the chat's markdown
renderer (`features/chat/markdown`) read-only.

## Build

1. `lib/hermes/groups.ts` — thin `HostedGroupEngine` (no React): `capabilities()`,
   `list()`, `create({name, members})`, `state(roomId)`, `log(roomId, sinceSeq, limit)`,
   `send(roomId, text)` (event_id = uuid; payload shaped exactly like the desktop's
   `canonical-group-send.ts` / committed `message.user`), `stop`, `approve`, `retry`, `rename`,
   `disband`. If `driver !== true`, the UI shows "Grupos no disponibles en este Hermes".
2. **Live updates:** there are no `groups.*` push events → poll `groups.log { since_seq }` +
   `groups.state` every 2 s while a room is open and visible (backoff to 10 s when idle, pause when
   hidden); every 15 s for the list. Keep a per-room seq cursor; dedupe by event id/seq.
3. **Group chat screen** (`/group/:roomId`, GrokBot screen 2): floating header pill with stacked
   avatars (`+N`) + group name; each bot message has the **bot name above** the bubble and its
   **avatar at the bottom-left**; user messages right; markdown; `@mentions` and paths in mono;
   member activity row ("Pancho está escribiendo…/trabajando") from `driver_status.member_activity`;
   **pending actions** (`pending_actions`: approvals/retries) as cards → `groups.approve
   {choice: once|deny, request_id, …}` / `groups.retry`; "Detener ronda" button → `groups.stop`.
   Composer "Escríbele a {grupo}" with `@` autocomplete over members (insert `@handle`; check the
   mention syntax the driver parses: `@name`, `@"two words"`, `@everyone`).
4. **Create group** (`/groups/new`): name + pick 2–6 bots from `profiles.list` (unique handles,
   rules from `canonical-groups.ts` `createCanonicalGroup`), → `groups.create`.
5. Room menu (sheet): rename, disband (confirm).

Mobile first, both themes, skeletons/empty/error states, semantic tokens only.

## Done when

`npx tsc -p tsconfig.app.json --noEmit` + `npm run lint` pass; conventional commits, no AI
attribution. Final report: files, deviations, Hermes mismatches (file:line), what you couldn't
verify without a live backend, open questions.
