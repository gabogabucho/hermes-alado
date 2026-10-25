# Phase 1b brief — Use Hermes Desktop's bot avatars (identical look in both apps)

Branch: `feat/phase-1-home-chat` (continue on it). App code in `repo/`.
Read `repo/AGENTS.md` first (rules apply; never run the dev server in the foreground).
Source of truth: `.hermes-ref/` pinned `bf0203a`.

## Goal

A bot must look **exactly the same** in DroidBot and in Hermes Desktop: same shape, color, face,
eyes, moods and custom photo. Replace our home-made creature in `repo/src/ui/Avatar.tsx` with a
port of the desktop avatar system. Keep `Avatar`'s public props backward compatible
(`name`, `size`, `mood`, `ring`, `badge`) so every screen already using it upgrades for free;
add an optional `appearance` prop.

## Sources to port (MIT, Nous Research — keep the header from AGENTS.md rule 3)

- `apps/desktop/src/plugins/hermes-bots/avatar.tsx` (render part: shapes, sigils, blob shapes,
  `BotFace`, the face clock/moods, `avatarColor`, `botAppearance`, `defaultShapeFor`,
  `parseBlobShape`). **Not** the picker/editor (`avatar-picker.tsx`) — editing is Phase 5.
- `apps/desktop/src/lib/profile-color.ts` (`profileColor`, `PROFILE_SWATCHES`, `profileColorSoft`).
- Relevant types from `apps/desktop/src/plugins/hermes-bots/types.ts` (`AvatarAppearance`,
  `AvatarShape`, `FaceMood`, the `BotMeta` fields used for looks).
- Blob faces come from the npm package **`blobatar`** — install the **exact** version the desktop
  uses: `npm i blobatar@2.0.0 --save-exact` (desktop imports `blobatar/blob`, re-exported in
  `apps/desktop/src/sdk/index.ts` ~L2011 as `blobatarSvg`). It's MIT.
- `createBudgetedLoop` (used by the face clock) lives in the desktop SDK
  (`apps/desktop/src/lib/budgeted-loop.ts`) — port it too, or the minimal part the clock needs.
- Replace `@hermes/plugin-sdk` imports with our local ports. Remove desktop-only concerns.

Port into `repo/src/ui/avatar/` (e.g. `bot-face.tsx`, `face-clock.ts`, `shapes.ts`,
`profile-color.ts`, `appearance.ts`). Behaviour-preserving port: same math, same output.
Our `Avatar` becomes a thin wrapper over the ported `BotFace` that adds our extras
(`ring`, `badge`/star, size tokens xs/sm/md/lg/xl).

## Where the appearance comes from (verify)

The desktop stores each bot's look in the profile's `ui_meta['hermes-bots']` (see
`plugins/hermes-bots/data.ts` ~L320–430: `row.ui_meta?.['hermes-bots']`, written via
`profiles.configure` with CAS). It arrives in RPC **`profiles.list`** rows. Fields used for
looks: `shape` (`'circle'|'squircle'|…|'sigil-N'|'blobatar:<seed>:<kind>'`), `color`, `image`,
`imageKind` (`'photo'|'shape'`), `custom`. Also the uploaded photo asset: `has_avatar` +
`profiles.get_asset {name, asset:'avatar'}` (research doc §7). Read
`botAppearance(name, meta)` to see how the desktop resolves meta + photo into one appearance,
and mirror it.

- Create `repo/src/features/bots/appearance-store.ts`: loads `profiles.list` once (and on
  `sessions.changed` / visibility, debounced), maps `profile name → AvatarAppearance`, fetches
  photo assets lazily (in-memory cache only, never persisted), exposes
  `useBotAppearance(name)`. Read-only: DroidBot does NOT write `ui_meta` in this phase.
- Wire Home rows, the hero, the chat header and bot-to-bot separators to pass `appearance`.
  If Phase 1 already fetches `profiles.list`, reuse that data instead of a second call.
- Bots with no stored look must render the desktop's deterministic default for their name
  (`defaultShapeFor`, `profileColor`) — i.e. still identical to the desktop.

## Moods

Map our moods to desktop `FaceMood`: chat idle → idle, turn running → thinking/working
(whatever the desktop uses while a bot streams — check where BotFace gets `mood` in
`plugins/hermes-bots/`), waiting for approval → the desktop's attention mood if it exists.
Respect `prefers-reduced-motion` (static face). The face clock must pause when the tab is hidden.

## Gallery

Update `/__ui`: show every shape kind, a few blobatar seeds, a photo avatar, all moods, both themes.

## Verification

`npx tsc -p tsconfig.app.json --noEmit` + `npm run lint` pass. Conventional commits, no AI
attribution. Final report: files, deviations, anything in Hermes that didn't match (file:line),
open questions.
