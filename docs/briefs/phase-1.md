# Phase 1 brief — Home + bot chats (GrokBot-level product feel)

Implements `PLAN-droidbot-v2.md` §6 "Fase 1" + navigation decision D8, on branch
`feat/phase-1-home-chat` (already checked out). App code in `repo/`.

**Read first, fully:** `repo/AGENTS.md` (hard rules — note rule 7: never run the dev server in
the foreground), `docs/research/phase-1-chat-contract.md` (the verified contract for everything
below — it cites `path:line` in `.hermes-ref/`), and the Phase 0 code in `repo/src/lib/hermes/`.
Source of truth for Hermes: `.hermes-ref/` (pinned `bf0203a`). Verify anything this brief marks
"verify" there before coding. Never invent shapes; if reality differs, follow reality and report it.

**Quality bar:** this must feel like a polished native messaging app (GrokBot / OpenBot class),
in BOTH themes (`hermes`, `clean`). Use only the `src/ui/` primitives and semantic tokens.
Mobile first (390×844), safe areas, 44 px touch targets, no layout jumps, no raw hex.

---

## Product model (architect decision)

**One bot = one chat.** Each bot (Hermes profile) has one canonical conversation: the session
titled exactly `"Bot Chat"` on that profile (desktop Bot Mode convention — research §2.3).
Home lists bots (groups join in Phase 2), each row driven by its Bot Chat. Older sessions of a
bot are out of scope (Phase 5 "Biblioteca").

## 1. Navigation (D8) — no tabs

- Delete `BottomNav`. Routes:
  - `/` Home
  - `/chat/:profile` bot chat
  - `/settings` (existing page, restyled header with back button; keep its content)
  - `/connectors` stays reachable from Settings ("Conectar aplicaciones" row) until Phase 3.
- Home → chat and back use a horizontal slide (View Transitions API when available,
  `document.startViewTransition`; plain swap otherwise). Respect `prefers-reduced-motion`.
- Android back / browser back must work naturally (router history), swipe-from-edge not required.

## 2. Home screen (GrokBot screen 1)

Layout top→bottom:
1. **Top bar** (floating, glass): left = user avatar `IconButton` → `/settings`; right = `+`
   `IconButton` → `Sheet` with "Nuevo bot" (reuse existing create-profile flow from
   `features/bots`) and "Nuevo grupo" (disabled, label "Próximamente").
2. **Principal bot hero**: the active profile (`GET /api/profiles/active` → `active`), big
   `Avatar` (xl, star badge, accent ring), display name, one-line subtitle (model or
   description). Tap → its chat.
3. **Unified list** of the other bots (and the principal too, as a normal row below the hero is
   NOT needed — hero only), each a `ListRow`:
   - leading: bot `Avatar` (md); show the real avatar image when the profile has one
     (`profiles.list` → `has_avatar`, then `profiles.get_asset {name, asset:'avatar'}` →
     data URL; cache per session in memory) — else the generated creature.
   - title: display name (`display_name` || `name`).
   - subtitle: preview of the Bot Chat's last message (`preview`). Apply bot-to-bot prefixes:
     incoming `Message from 🤖 X (@h): body` → `Mensaje de X: body`; if the last row is the bot
     messaging another agent → `Le escribió a X`. Empty chat → muted "Sin mensajes todavía".
   - trailing: relative time (today `HH:mm`, yesterday `Ayer`, last 7 days weekday name,
     else `dd/MM`) + unread dot (accent) when `unread`.
   - order: by Bot Chat `last_active` desc; bots without a Bot Chat at the end, alphabetical.
   - long-press / context: not needed.
4. **Bottom search pill** (fixed, glass, above safe area): tapping expands an input that filters
   the list by name locally; when the query has ≥2 chars also show a "En conversaciones"
   section from `GET /api/sessions/search?q=` (rows open the matching bot's chat).

**Data (verify every shape):** use RPC `profiles.list` — research says it returns per-profile
`has_avatar` and `canonical_session` (resolved server-side by title) — check
`tui_gateway/methods_profiles.py` (~L162–280) for params (e.g. `include_sessions`) and the row
shape (preview, last_active, unread available?). If `canonical_session` lacks preview/unread,
join with `GET /api/profiles/sessions/sidebar` or `GET /api/sessions?profile=…`. Pick the
smallest number of calls; document the choice in a comment.
**Live refresh:** re-fetch (debounced 500 ms) on the `sessions.changed` gateway event
(observed live on the VPS) and when the app becomes visible.
**States:** skeleton rows while loading, friendly empty state, inline error with retry.

## 3. Opening a bot chat

Mirror the desktop exactly — read `apps/desktop/src/plugins/hermes-bots/canonical-chat.ts`
(and `data.ts`, `profile-ops.ts`) first:
- Resolve the Bot Chat (`session.list { title: 'Bot Chat', include_hidden: true, profile }` or
  whatever canonical-chat.ts does). If found → `session.resume { session_id: <stored id>,
  profile }`. If not → adopt-before-mint: re-check, then `session.create { profile, title:
  'Bot Chat', hidden: true, … }` exactly as the desktop does.
- Keep the **live sid** for RPC and the **stored id** for REST.
- Render `messages` from the resume result (role/text/tool rows per `TranscriptMessage`), plus
  `inflight` (rebuild an in-progress assistant bubble), `pending_approval` / `open_requests`
  (render their cards).
- "Load older": when scrolled to top and more exist, page with
  `GET /api/sessions/{stored}/messages?order=latest&offset=…&limit=50&inline_images=false`.
- Mark read: `PATCH /api/sessions/{stored}` `{unread:false}` on open and after each
  `message.complete` while the chat is visible (verify the body field).
- Leaving the chat does NOT close the session server-side.

## 4. Chat screen (GrokBot screen 3)

- **Header** (floating glass pill): back button, bot avatar + name (tap opens a `Sheet` with
  name, model, description — full profile screen is Phase 5), right side: stop button while a
  turn runs (`session.interrupt`), else `…` (disabled for now).
- **Messages**: user bubbles right, accent bg; bot messages left, bot-bubble token, no avatar;
  grouped consecutive messages with tighter spacing; timestamps on tap (optional).
  - **Markdown** for assistant text: add `react-markdown` + `remark-gfm` (no raw HTML). Code
    blocks and inline code in monospace with surface bg and horizontal scroll; links open in a
    new tab; paths/@mentions in monospace.
  - **Streaming**: append `message.delta` text (null = segment boundary); show a subtle typing
    indicator (animated dots, or the avatar `thinking` mood) before the first delta.
  - **Reasoning**: `reasoning.delta`/`thinking.delta` → collapsed "Pensando…" line, expandable.
  - **Tools**: `tool.start` / `tool.progress` / `tool.complete` → compact activity rows
    ("Usando terminal…", "✓ terminal · 1.2 s"), collapsible details (args/summary). Keep quiet:
    consecutive tool rows collapse into one group.
  - **Bot-to-bot** (screen 3): implement research §5.3/§5.4 exactly — outgoing deliveries
    (terminal tool command matching the desktop `DELIVERY_COMMAND_RE`, see
    `apps/desktop/src/components/assistant-ui/thread/agent-delivery.tsx`) render as a centered
    separator "Escribió a [avatar] X"; incoming user rows matching `AGENT_MESSAGE_RE`
    (`user-message.tsx`) render "Mensaje de [avatar] X" with the body behind "ver mensaje".
    Port the two regexes verbatim with the MIT header.
  - Errors from `message.complete` (`status:'error'`) as an inline error row with "Reintentar"
    (re-submit the last user text).
- **Server requests (approvals/clarify)** — research §4: register a handler via the vendored
  client's `onRequest(handler)` (`json-rpc-gateway.ts` ~L416; expose it from
  `lib/hermes/connection.ts`). Handle:
  - `approval` → card in the chat: command (monospace), description, buttons from `choices`:
    "Permitir una vez" / "Esta sesión" / "Siempre" / "Denegar". Resolve the server request with
    `{ choice }`. Show which bot asks.
  - `clarify` → card with each question; choices as chips, free-text input otherwise; submit
    resolves `{ answers }`; "Cancelar" resolves `{}`.
  - `sudo`, `secret` → resolve `{ value: '' }` immediately (not supported on mobile; plan D4).
  - anything else → reject with -32601 (let the vendored default handle it if it does).
  - `request.cancel` event → remove the card.
  - Cards for requests of OTHER sessions: show a small banner on Home ("X necesita tu
    aprobación") that opens that chat. Cards survive reconnect via `open_requests`.
- **Composer** (bottom, glass): auto-growing textarea (max 6 lines), Enter sends on desktop,
  newline on mobile (detect coarse pointer); left `+` → attach: images via
  `image.attach_bytes`, PDFs via `pdf.attach`, other files via `file.attach` (`data_url`) —
  show attachment chips before sending; right: mic when empty / send when text / stop while
  running. **Mic**: `MediaRecorder` → base64 data URL → `POST /api/audio/transcribe`
  `{data_url, mime_type}` → put transcript in the textarea (don't auto-send). Recording state
  with timer and cancel.
- **Scroll**: stick to bottom while streaming unless the user scrolled up; floating "ir al
  final" button (arrow-down `IconButton`) with unread count when new messages arrive above.
- **Haptics**: `navigator.vibrate?.(10)` on send and on approval tap (guarded).

## 5. Cleanup

- Delete `src/lib/console.ts` and any leftover v1 code it orphaned.
- Remove `BottomNav` and the tab styles. Keep `features/connectors` page reachable from Settings.
- PWA manifest: name `DroidBot`, short_name `DroidBot`, `theme_color`/`background_color` per
  default theme; `display: standalone`. (Icons stay for now.)

## 6. Verification (no dev server in the foreground!)

- `npx tsc -p tsconfig.app.json --noEmit` and `npm run lint` pass.
- Commit in small conventional commits (navigation, home, chat open/resume, rendering,
  server requests, composer/attachments/voice, cleanup). No AI attribution.
- The architect will run the E2E against the VPS (login, home, open chat, history persists
  after reload, approval card, bot-to-bot rendering).

## 7. Final report (print at the end)

Files created/changed, every deviation from this brief and why, every place Hermes did not
match the research doc (file:line), and open questions.
