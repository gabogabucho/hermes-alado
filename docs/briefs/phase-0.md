# Phase 0 brief — Foundations (transport, auth, design system, layout)

You are implementing Phase 0 of `PLAN-droidbot-v2.md` (§6 "Fase 0"). App code is in `repo/`.
Read `repo/AGENTS.md` first — its hard rules apply to everything below.
Work on the current git branch `feat/phase-0-foundations`. Commit in small conventional commits.

The architect already verified the Hermes contract for the points below. Where this brief
says "verify", open the cited file and confirm before coding.

---

> **Source of truth: `.hermes-ref/` (Hermes git checkout pinned at `bf0203a`, = our VPS).**
> All Hermes paths below are relative to `.hermes-ref/`. Line numbers are approximate —
> search by symbol. Never read `%LOCALAPPDATA%\hermes\hermes-agent` (stale).
>
> Our real backend: `https://droidbot.gabrielurrutia.com.ar` (Caddy → `hermes serve`,
> **gated mode** with the `basic` dashboard-auth provider: password form at `/login` →
> `__Host-` session cookie → ws-ticket). Gated is the primary mode; loopback is secondary.

## 0. Install

`cd repo && npm install`. `@fontsource-variable/manrope` is already added. Add other deps only if listed here.

## 1. Transport: vendor the official client + generated contract (do NOT write your own)

Copy **verbatim** from `.hermes-ref/apps/shared/src/` into `repo/src/lib/hermes/vendor/`:
`json-rpc-gateway.ts`, `json-rpc-channel.ts`, `gateway-events.ts`,
`gateway-contract.generated.ts`, `reconnect-backoff.ts`, `websocket-url.ts`
(plus anything they import, transitively — list it in the report).
- Add the MIT header (AGENTS.md rule 3) and `// vendored from hermes-agent@bf0203a` on line 1–2.
- Keep the `.js` import specifiers if `moduleResolution: bundler` accepts them; otherwise the
  only allowed edit is the import specifier. Report every edit.
- If `oxlint`/`tsc` flag the vendored code, exclude `src/lib/hermes/vendor/**` from lint and
  fix types only through our wrapper, not inside vendor files.
- Read `json-rpc-gateway.ts` + `json-rpc-channel.ts` fully: understand heartbeat, replay
  (`session.events.since`, `replay_epoch`), and whether it reconnects by itself. Use
  `reconnect-backoff.ts` for our backoff instead of inventing one.
- See how the desktop wires it: `apps/desktop/src/api/client.ts` and
  `apps/desktop/src/app/gateway/hooks/use-gateway-boot.ts`.

## 2. Auth: support the two Hermes modes

Verified in `hermes_cli/web_server.py` (re-verify at `bf0203a`):

| Mode | How to detect | REST auth | WS auth |
|---|---|---|---|
| **loopback** (`hermes dashboard` on localhost, no public_url) | GET the Hermes root page; it contains `window.__HERMES_SESSION_TOKEN__="…"` and `window.__HERMES_AUTH_REQUIRED__=false` (see ~L18072–18150) | header `X-Hermes-Session-Token: <token>` (`_SESSION_HEADER_NAME`, L639) | `/api/ws?token=<token>` |
| **gated** (public_url / OAuth) | root page has no token, or `__HERMES_AUTH_REQUIRED__=true` | session cookie (`credentials: 'include'`), login via `/login?next=` | `POST /api/auth/ws-ticket` → `{ticket}` → `/api/ws?ticket=<ticket>` (single use, ~30 s: mint a fresh one on EVERY connect) |

Verify the non-headless dashboard index injection (search `__HERMES_SESSION_TOKEN__` and
`__HERMES_AUTH_REQUIRED__` in web_server.py) and how `/api/auth/me` behaves in loopback mode.

Implement `repo/src/lib/hermes/auth.ts`:
- `resolveAuth(): Promise<AuthState>` where
  `AuthState = { mode: 'loopback'; token: string } | { mode: 'gated'; user: UserInfo } | { mode: 'gated-anonymous' } | { mode: 'unreachable'; error: string }`.
- Token page path: `import.meta.env.DEV ? '/__hermes_root' : '/'` — but when a custom backend
  URL is configured (`lib/config.ts`), use `${backend}/`. Parse the token with a regex; never
  `eval`/inject the HTML.
- Token kept **in memory only** (module variable). Never persisted.
- Update `lib/api.ts` `apiFetch` to send `X-Hermes-Session-Token` when a token is known.
  Same for `lib/files.ts` upload.
- `store/auth.ts` uses `resolveAuth()`. LoginPage only shows the OAuth button in gated mode;
  in `unreachable` mode show the error + "Configurar backend" + "Reintentar".

## 3. Connection manager

`repo/src/lib/hermes/connection.ts` — a singleton `hermes` that owns one `JsonRpcGatewayClient`:
- `connect()`: builds a **fresh** WS URL each time (ticket or token, per auth mode) from
  `lib/config.ts` `wsUrl('/api/ws')`, then `client.connect(url)`.
- Reconnect with exponential backoff + jitter (1 s → 30 s cap) whenever the state becomes
  `closed`/`error` and we did not close on purpose. Also reconnect immediately on
  `window 'online'` and on `document.visibilitychange` → visible. Reset backoff on `open`.
- On close code `4401` (auth) re-run `resolveAuth()` before retrying; if it becomes
  `gated-anonymous`, stop and set auth to anonymous.
- Expose: nanostore `connectionState` (`'idle'|'connecting'|'open'|'closed'|'error'`),
  `request<T>(method, params, timeoutMs?)`, `on(type, handler)`, `onAny(handler)`, `close()`.
- `prompt.submit` must be called with timeout `1_800_000` ms (the ACK can take minutes;
  completion arrives via events — see `apps/desktop/src/api/client.ts`).
- Small UI: a thin "Reconectando…" banner at the top of the app when state is not `open`
  after having been open once.

## 4. Typed contract — use the GENERATED one

Hermes ships a generated contract: `vendor/gateway-contract.generated.ts` (from
`tui_gateway/contracts`, also `gateway-contract.openrpc.json`). It has a method map like
`'prompt.submit': { params: PromptSubmitParams; result: PromptSubmitResult }` and
`BackendGatewayEventMap` for event payloads. **Do not hand-write RPC types.**
- In `connection.ts`, expose a typed `request<M extends keyof <MethodMap>>(method, params)` and
  typed `on<E extends keyof BackendGatewayEventMap>(type, handler)` built on those maps.
- Key semantics to respect (verify in `tui_gateway/methods_session.py` / `methods_prompt.py`):
  `session.create`/`session.resume` return a **live sid**; `prompt.submit` takes that live sid,
  NOT the state.db id; `session.resume` accepts the db id (or title).
- `src/lib/hermes/contract-version.ts`: `export const HERMES_CONTRACT_COMMIT = 'bf0203a'`.
  On boot, call `GET /api/version` (read its shape) and `console.warn` if it doesn't report the
  same commit (no UI yet).

## 5. Minimal chat on the new transport (proves the phase)

Rewrite `store/chat.ts` to use `hermes` instead of `ConsoleClient`:
- Open chat for profile → `session.create({ profile })` → keep the returned live `session_id`.
- Send → append user msg + pending assistant msg → `prompt.submit`.
- `message.delta` appends text to the pending assistant message (filter by `session_id`);
  `message.complete` finalizes it (use its final text if present); `error` shows inline.
- Stop button → `session.interrupt`.
- Message keys: stable ids (`crypto.randomUUID()`), not indexes.
- History/resume, markdown, approvals UI are **Phase 1** — do not build them now. Leave
  `lib/console.ts` in place but unused (it is deleted in Phase 1).

## 6. Dev proxy (`repo/vite.config.ts`)

- Default target: `process.env.HERMES_URL || 'https://droidbot.gabrielurrutia.com.ar'`
  (`secure: true`, `changeOrigin: true`). Local Hermes: `HERMES_URL=http://localhost:9119`.
- Keep `/api`, `/auth`, `/login` proxies (login form and its POST must round-trip so the
  `__Host-` cookie lands on `localhost` — verify the login redirect `next=` returns to the dev
  server and not to the remote domain; if Hermes sends an absolute `Location`, rewrite it
  in the proxy).
- Add `/__hermes_root` → Hermes `/` (rewrite path) so dev can read the loopback token.
- The WS upgrade on `/api/ws`: Hermes rejects an `Origin` that is not its bound/public host
  (`_ws_host_origin_reason`). In the proxy `configure` hook, on `proxyReqWs` set the
  `origin` header to the proxy target origin. (`changeOrigin` already fixes `Host`.)
- Do the same `origin` rewrite on normal `proxyReq` for non-GET requests if Hermes checks it.
- `server.host: true` (LAN access), but note in the README that gated-mode login from a phone
  over plain `http://<lan-ip>` won't work (Secure cookies) — phones test against an HTTPS deploy.

## 7. Reorganize (plan D9)

Move code into:
```
src/app/            App.tsx, router, Shell, ReconnectBanner
src/lib/hermes/     json-rpc-gateway.ts, auth.ts, connection.ts, rpc-types.ts
src/lib/            api.ts, config.ts, files.ts, types.ts (keep)
src/ui/             design system (section 8)
src/features/auth/      LoginPage, store
src/features/chat/      ChatPage, MessageList, Composer, store
src/features/bots/      ProfilesPage, store (profiles)
src/features/connectors/ ConnectorsPage
src/features/settings/  SettingsPage, store
```
Keep the current routes and BottomNav working (navigation is redesigned in Phase 1).
Pure moves + import fixes; don't rewrite page logic beyond what sections 2/5 need.

## 8. Design system `src/ui/` (presentational only, no stores)

**Two themes from day one.** All components consume semantic tokens only (never raw hex),
so a theme is just a token set on `<html data-theme="…">`:

| Token role | `hermes` (dark, default in dark mode) | `clean` (light, default in light mode) |
|---|---|---|
| bg | `#17120c` warm near-black | `#f2f2f4` soft gray |
| surface 1/2/3 | evolve current `#1f1710 / #2a2015 / #33271a` | `#ffffff / #f7f7f8 / #ececef` |
| glass (floating buttons/header) | `rgba(42,32,21,.72)` + blur | `rgba(255,255,255,.78)` + blur + hairline border |
| text 1/2/3 | `#f3ecdf / #a8947a / #6d5f4d` | `#111114 / #5c5c66 / #9a9aa3` |
| brand accent (user bubble, active toggle, primary button) | gold `#e0b34c`, dark text on it | ink `#111114`, white text on it |
| bot bubble | surface 2 | `#ffffff` with subtle shadow |
| borders | `#3d3020` | `rgba(0,0,0,.08)` hairline |
| danger / ok | keep current | `#d6453d / #1f9d55` |

Do NOT use GrokBot's green in either theme. `clean` is GrokBot-like in feel (airy, white cards on
gray, big radii, soft shadows), not a copy.

- Theme selection: `system` (default: light→`clean`, dark→`hermes`), `hermes`, `clean`.
  Store `features/settings` keeps the choice in `localStorage` (`droidbot.theme`, not a secret),
  applies `data-theme` on `<html>` before first paint (tiny inline script in `index.html`), and
  updates `<meta name="theme-color">`. Add the picker to SettingsPage. `/__ui` gets a theme switch.

- `src/ui/tokens.css`: colors per theme (bg, surface 1/2/3, glass + `backdrop-filter`, text 1/2/3,
  accent + on-accent, bot bubble, border, danger, ok, per-bot accent var `--bot-accent`), radii (`--r-sm 12px`, `--r-md 20px`,
  `--r-lg 28px`, `--r-full`), spacing scale (4-pt), type scale, shadows, motion
  (durations + easing), safe-area vars (`env(safe-area-inset-*)`). Import it from `index.css`
  and migrate existing variables to the tokens.
- Font: `@fontsource-variable/manrope` (add dep), body + UI. Monospace: system
  `ui-monospace, 'Cascadia Code', Menlo, monospace`.
- Primitives (each a small `.tsx` + co-located CSS module or a section in a `ui.css`):
  - `IconButton` — circular glass button (40 px), variants `glass | solid | ghost`.
  - `Pill` — rounded label/header pill; optional leading avatars.
  - `ListRow` — leading slot, title, subtitle (1 line ellipsis), trailing slot (time/badge/chevron),
    pressed state.
  - `Toggle` — accessible switch (`role="switch"`, `aria-checked`), gold when on.
  - `Sheet` — bottom sheet with backdrop, drag handle, closes on backdrop/Escape, focus trap light.
  - `Avatar` — the "creature": read the existing `src/components/BotAvatar.tsx` (it has `mood`)
    and evolve it. Deterministic from the bot name (hash) unless `shape`/`color` props are given:
    6 body shapes (blob, drop, bean, square-ish, ghost, star-ish) as SVG paths, a curated palette of
    10 warm/jewel hues, two eyes with `mood` = `idle | thinking | happy | sleeping`, sizes
    `xs 24 | sm 32 | md 44 | lg 72 | xl 112`. Optional `ring` (accent ring) and `badge` (star).
    `AvatarStack` for groups (overlap, `+N`).
  - `Icon` — inline SVG set, 24 px grid, 1.75 stroke, `currentColor`: back, plus, more, search,
    grid, mic, send, stop, settings, chevron-right, check, arrow-down, paperclip, close, bolt,
    calendar, folder, monitor, bell.
  - `Skeleton` (shimmer line/circle).
- Dev-only route `/__ui` (only when `import.meta.env.DEV`) rendering every primitive and every
  avatar shape × mood, so the architect can review visually.

## 9. README

Replace the Vite template README: what DroidBot is, the two auth modes, how to run dev against a
local Hermes (`hermes dashboard`, `HERMES_URL=http://localhost:9119 npm run dev`), how to open
it from a phone on the LAN, and the license note about vendored MIT code.

---

## Definition of done

- `npx tsc -p tsconfig.app.json --noEmit` and `npm run lint` pass.
- You cannot log in yourself (password is the user's). So: `npm run dev` must start cleanly,
  `curl -s http://localhost:5173/api/status` must return Hermes JSON through the proxy, and
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/api/auth/me` must return `401`
  (proxy reaches the gated VPS). Stop the dev server afterwards. The architect does the
  end-to-end login + streaming test.
- `/__ui` shows all primitives.
- Final report (print it at the end): files created/moved, any deviation from this brief and why,
  anything in Hermes that did not match the brief (with file:line), open questions.
