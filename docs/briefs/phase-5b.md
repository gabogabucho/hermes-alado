# Phase 5b brief — Bot profile screen (GrokBot screen 6)

Implements `PLAN-droidbot-v2.md` §6 "Fase 5" (profile part). App code in `repo/`. Hermes source of
truth: `C:\Users\gabog\orca\projects\Hermes-Droidbot\.hermes-ref\` (pinned `bf0203a`). Rules in
`repo/AGENTS.md` apply (never run the dev server in the foreground).

**Parallel work:** others are restyling (1c) and building groups (2). Write only in
`repo/src/features/bot-profile/**` and NEW files in `repo/src/lib/hermes/`. You may add route lines
in `repo/src/app/Shell.tsx` (`/bots/:profile`, `/bots/:profile/edit`). The architect links the chat
header to it. Sub-screens `/bots/:profile/routines|library|working` already exist on another branch —
just link to those paths. Reuse `src/ui/*`, the ported avatar system in `src/ui/avatar/*` and
`features/bots/appearance-store.ts` (read-only imports).

## Screen `/bots/:profile`

Big avatar (xl) + display name + model/description, "Editar" button, then rows (GrokBot screen 6):
- **Programando** — "N trabajando" (`GET /api/plugins/kanban/workers/active?profile=`; plugin
  missing → "—") → `/bots/:profile/working`
- **Rutinas** — "N activadas" (count enabled cron jobs + webhooks) → `/bots/:profile/routines`
- **Biblioteca** → `/bots/:profile/library`
- **Computadora** — computer_use status ("Activo"/"Inactivo") → `/settings/control`
- **Notificaciones** toggle "Cuando este bot termine o te esté esperando" — plan §4.7: there is no
  Web Push; implement as a stub that stores nothing and shows a sheet explaining it will use ntfy /
  Telegram (to be decided), unless you find an existing per-profile notification setting in Hermes
  (check `plugins/platforms/ntfy/`, config schema) — then wire it and report.

## Edit `/bots/:profile/edit`

Mirror the desktop editors (read `apps/desktop/src/plugins/hermes-bots/` profile editing,
`edit-profile-look.ts`, `avatar-picker.tsx`, `profile-ops.ts`, `data.ts saveBotMeta`):
- Name/title, description (`/api/profiles/{name}/description` or the RPC the desktop uses),
  soul (`/api/profiles/{name}/soul`), model (`/api/profiles/{name}/model` + model list endpoint).
- **Avatar picker**: port `avatar-picker.tsx` (MIT header): shapes, blobatar seeds/kinds, colors
  (`PROFILE_SWATCHES`), photo upload → `profiles.set_asset {name, asset:'avatar', data}` (PNG/JPEG/WebP
  ≤ 2 MB). Look fields saved like the desktop: `profiles.configure` with `ui_meta['hermes-bots']`
  patch + `ui_meta_expected_revisions` CAS, sending only changed fields (`editedLook`). Handle a
  CAS conflict by reloading and showing a notice.
- After save, refresh `profiles.list`-driven stores (call the existing home/appearance loaders).

Mobile first, both themes, skeletons/error states, semantic tokens only.

## Done when

`npx tsc -p tsconfig.app.json --noEmit` + `npm run lint` pass; conventional commits, no AI
attribution. Final report: files, deviations, Hermes mismatches (file:line), open questions.
