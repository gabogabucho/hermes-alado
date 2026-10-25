# Phase 10a brief — "Bot is working" indicator + startup latency

Branch `feat/phase-1-home-chat` (main checkout). Read `repo/AGENTS.md` first (Product principle; NEVER
start a dev server; never touch the VPS). Hermes source of truth: `.hermes-ref/` pinned `bf0203a`.

## 1. Working indicator on Home (user request)
When a bot is running a turn, Home must show it at a glance: the bot's avatar in the roster (and the
featured hero) gets a subtle live animation (e.g. a soft pulsing gold ring / orbiting dot using
`--accent`, respects `prefers-reduced-motion`) plus a tiny "trabajando…" caption under the name.
It must also work for bots whose chat is NOT open (e.g. a routine, a group turn, a turn started on
another device).

Research first, then implement — do not invent: find how the official desktop app knows a session /
profile is busy for its sidebar (search `apps/desktop/src` for busy/running/working indicators and the
events/RPC they consume: `session.list` fields, `sessions.changed`, `session.info`, `message.start` /
`message.complete`, `groups.*` activity, `display.*`...). Pick the cheapest reliable signal that covers
all profiles over our single `/api/ws` socket. Write the finding (file:line evidence) into the report.
Keep it light: no polling faster than every 10s; prefer events.

## 2. Startup latency (measured)
The VPS is in France, user in Argentina: every round trip costs ~250 ms. Measured cold reload to Home
(already logged in) = 2.4–2.9 s, all serial:
```
42   GET /api/auth/me            → 292
295  GET /api/profiles/active + /api/health → 574
297  GET /api/auth/me (DUPLICATE) → 574
575  POST /api/auth/ws-ticket    → 848
1856 WS open + gateway.ready (~1 s) → groups.capabilities, profiles.list, client.capabilities
2120 groups.list ; 2176 profiles.get_asset (120 KB) → 2944
```
Goals (measure each with the code path, not guesses):
- Remove the duplicate `/api/auth/me`; fire `ws-ticket` in parallel with `auth/me` (a 401 on the ticket
  just means logged out), and `profiles/active` / `health` in parallel with the WS open.
- Paint Home immediately from a last-known roster (bot names, titles, avatar appearance — not secrets;
  this is the one allowed exception to "only the backend URL may be persisted", document it in
  AGENTS.md) and refresh in the background (stale-while-revalidate).
- `profiles.get_asset` 120 KB: cache avatar assets (Cache Storage in the SW or IndexedDB keyed by
  profile + asset hash) so later boots don't refetch.
- Opening a chat: `session.list` → `session.resume` → history are serial; start the canonical lookup
  as soon as the user taps (or prefetch the featured bot's chat id on Home).
- Exclude the noVNC lazy chunks from the SW precache (they are 1.4 MB of the 1.49 MB precache; they
  should be runtime-cached on first use).

## Done when
`npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm test` pass (add tests for the roster
cache and the busy-state reducer). Conventional commits, no AI attribution. Final report: the busy
signal you chose (evidence file:line), before/after request waterfall (expected), open questions.
