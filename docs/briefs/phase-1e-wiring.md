# Phase 1e brief — Wire the merged features together + bring Groups/Profile to the new design

Branch `feat/phase-1-home-chat` (main checkout). Everything is merged: phases 1, 1b, 1c, 1d
(design system), 2 (groups), 3, 4a, 5a, 5b (bot profile). App code in `repo/`. Read
`repo/AGENTS.md` first — **never start the dev server** (rule 7). Hermes source of truth:
`.hermes-ref/` pinned `bf0203a`.

## 1. Groups into Home (GrokBot screen 1: one unified list)
- `features/groups` exports `useGroupRows()` (`{roomId,name,members,preview,lastActivity,needsYou}`
  + `available: boolean|null`). Render group rows **in the same grouped list** as bots, sorted
  together by last activity; leading = `AvatarStack` of members; preview prefixed with the author
  ("Pancho: …"); "te necesitan" badge when `needsYou`; tap → `/group/:roomId`.
- Hide groups entirely when `available === false`.
- Home `+` sheet: "Nuevo grupo" enabled → `/groups/new` (disabled with note when unavailable).

## 2. Bot profile entry points
- Chat header: tapping the avatar+name opens `/bots/:profile` (replace the info sheet).
- Home row `…` menu: add "Ver perfil" next to "Destacar como principal".
- Group chat: tapping a member avatar/name opens that bot's profile.

## 3. Avatar cache after edits
- After saving a profile/avatar in `bot-profile`, invalidate the photo cache in
  `features/home/store.ts` (`avatarCache`) and `features/bots/appearance-store.ts`, then reload, so
  the new look shows immediately everywhere. Add a small exported `invalidateBotAppearance(name)`.
- Fix the desktop "clear color" quirk on OUR side only: when the user picks "Igualar al nombre",
  send `color: null` explicitly in the ui_meta patch so it really clears (note it in a comment).

## 4. Restyle Groups and Bot Profile with the Phase 1d system
Use `PageShell`/`PageHeader`, `Section`/`Row` (icon tiles), `EmptyState`, `StatusDot`, `Badge`,
`Disclosure`, gold accent tokens — same look as Settings/Vault/Control:
- `/bots/:profile`: hero (avatar xl with soft halo, name, model) + "Editar" tonal button; one
  grouped section with icon-tile rows: Programando (value "N trabajando"), Rutinas ("N activadas"),
  Biblioteca, Computadora (status dot), Notificaciones (toggle).
- `/bots/:profile/edit`: grouped form sections (Identidad, Personalidad/Soul, Modelo, Avatar);
  avatar picker in a `Sheet` with the shape/color grid.
- `/groups/new` and `/group/:roomId`: new header pill/PageHeader, grouped member picker with
  checkmarks, `EmptyState` for empty rooms, pending-action cards in the same card style as chat
  approval cards.

## 5. Consistency sweep
grep for leftover ad-hoc headers (`page-header`, `subpage-header`, raw `navigate(-1)`) and old
card-per-row lists; migrate them. Every back button uses `useBack(fallback)`.

## Done when
`npx tsc -p tsconfig.app.json --noEmit`, `npm run lint`, `npm test` pass. Small conventional
commits, no AI attribution. Final report: what changed per item, deviations, open questions.
