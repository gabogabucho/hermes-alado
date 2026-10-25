# Phase 8 brief — Push notifications ("muy importante")

Read first: `docs/research/notifications-design.md` (verified design, path:line citations) — follow it.
Hermes source of truth: `C:\Users\gabog\orca\projects\Hermes-Droidbot\.hermes-ref\` (pinned `bf0203a`).
Read `repo/AGENTS.md` (Product principle: light, everyday). Never start a dev server. You never SSH or
deploy (the architect installs the plugin on the VPS via the preparer).

## Goal
The phone gets a push when **a bot finishes a turn** or **is waiting for you** (approval / clarify /
group needs you), with a per-bot toggle — like GrokBot's "Notificaciones: cuando este bot termine o te
esté esperando". Tapping opens `/chat/<profile>` or `/group/<room>`.

## A. Hermes plugin `hermes-plugin/droidbot-push/` (new folder at repo root)
- `plugin.yaml` + `register(ctx)`: hooks `on_session_end` (turn finished; resolve profile via
  `ctx.profile_name`), `pre_approval_request` / `on_human_input_request` (waiting for you),
  `on_room_member_activity` with `kind="request.opened"` (group needs you), cron completion via
  `on_session_end` `platform=cron`. Skip turns started by the same device that is currently viewing the
  chat if the design doc says it's knowable; otherwise always notify but collapse with `tag`.
- REST routes under `/api/plugins/droidbot-push/` (dashboard auth inherited): `GET vapid-public-key`,
  `POST subscribe` (endpoint+keys, device label), `DELETE subscribe`, `GET/PUT prefs` (per-profile
  on/off for "termina" and "te necesita"), `POST test`.
- VAPID keys generated once and stored in plugin state; subscriptions + prefs + dedupe in the plugin
  SQLite/state as the design doc proposes (hooks fire in whichever process runs the turn: serve and
  gateway — dedupe across both). Sending with `pywebpush` declared in `python_dependencies`.
  Payload: `{title: <bot name>, body: <first 120 chars or "Te necesita para aprobar…">, url, tag}`.
  Rate-limit per profile. Expired subscriptions (404/410) are pruned.
- `hermes-plugin/droidbot-push/README.md`: install steps (copy to `~/.hermes/plugins/`, enable, restart).
  Add an `install-push` module to `provisioner/prepare.sh`? → NO (another agent owns provisioner/);
  instead document the commands in the README and in `docs/provisioner-push.md` for the architect to wire.
- Python unit tests for the pure parts (payload building, dedupe, prefs) with `pytest` if feasible.

## B. PWA (`repo/`)
- Switch `vite-plugin-pwa` to `injectManifest` with `src/sw.ts` keeping precache + the existing
  `navigateFallbackDenylist` behaviour, and add `push` + `notificationclick` handlers (focus an open
  client and navigate, else open the URL).
- `src/lib/push.ts`: feature-detect, permission request **only on user gesture**, subscribe with the
  VAPID key from the plugin, register with the plugin, unsubscribe. If the plugin is not installed
  (404), the UI shows "Las notificaciones requieren el complemento del servidor" + the preparer hint.
- Settings → "Notificaciones" section: master switch for this device + "Probar". Bot profile →
  replace the Phase 5b stub toggle with the real per-bot pref ("Cuando termine" / "Cuando te necesite").
- iOS: if not installed as PWA, explain "Instalá la app para recibir notificaciones" (link to the
  install invite from Phase 9 if present).
- Unit tests for push helpers where pure.

## Done when
`npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm test` pass; plugin passes `python -m
py_compile` (+ tests if added). Conventional commits on your branch, no AI attribution. Final report:
hooks used (file:line), plugin file list, REST contract, install steps, risks, open questions.
