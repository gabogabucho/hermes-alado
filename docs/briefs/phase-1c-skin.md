# Phase 1c brief — Hermes Desktop look ("skin")

Branch: `feat/phase-1-home-chat` (continue on it, after Phase 1b landed). App code in `repo/`.
Read `repo/AGENTS.md` first (never run the dev server in the foreground). Hermes source of truth:
`.hermes-ref/` pinned `bf0203a`.

## Direction (from the user)

Functionality targets GrokBot; **aesthetics target Hermes Desktop** ("la estética de Hermes es
GOD"). Reference screenshots: dark slate UI, a huge uppercase display wordmark "HERMES AGENT"
over a dim grayscale textured background, uppercase monospace labels with letter-spacing
(e.g. `CONNECT+--▒` loading text, `SESSIONS / BOTS` tabs), blob avatars, quiet thin borders,
pill composer "Dale una tarea a Hermes" with a round voice button.

## 1. Dark theme = desktop "nous" preset

- Read `.hermes-ref/apps/shared/src/theme-presets.ts` (preset `nous`, ~L125, and `nous-alt`)
  and `apps/desktop/src/themes/{presets,skin,types}.ts` + `apps/desktop/src/styles.css`
  (`--dt-*` variables). Map the `nous` **dark** palette onto our semantic tokens in
  `src/ui/tokens.css` for the dark theme (keep the theme id `hermes` so stored preferences keep
  working; rename its label to "Hermes"). Keep `clean` as the light theme, but align its neutrals
  with the `nous` **light** palette where it improves consistency (keep ink accent).
- Keep components on semantic tokens only. Re-check contrast (text on surfaces ≥ 4.5:1).

## 2. Typography — licensing matters (public product)

- **Do NOT ship `Collapse`, `Mondwest` or `Neuebit`** (they come from `@nous-research/ui` but
  are commercial typefaces — Collapse is Blaze Type's; we have no license).
- **Monospace: JetBrains Mono** (Apache-2.0, the desktop's bundled mono) via
  `@fontsource/jetbrains-mono` (400, 700). Use it for code, paths, and a new `.label-mono`
  style: uppercase, letter-spacing ~0.14em, small size, muted color — apply to section labels,
  status text, the reconnect banner and loading text.
- **Display wordmark:** add a `.wordmark` style (uppercase, bold, line-height 0.9,
  letter-spacing 0.06–0.08em, fluid size with `clamp`) using an **OFL** font with Collapse's
  sharp, condensed, high-contrast serif character. Install 3 candidates via `@fontsource`
  (e.g. `bodoni-moda`, `playfair-display`, `dm-serif-display` — pick the 3 closest, all OFL)
  and show "HERMES AGENT" in each on `/__ui` so the user can choose; default to the closest.
  Ship only the chosen weight subset (latin) to keep the PWA small.
- Body text stays Manrope unless the `nous` preset's sans looks clearly better — report.

## 3. Signature surfaces

- **Textured backdrop**: a subtle, dim grayscale noise/etching texture behind empty states and the
  home hero, done in CSS/SVG (`feTurbulence` or a tiny tiled SVG) — no large images, no
  copyrighted art. Opacity low enough that text stays readable; disabled in `clean` or toned down.
- **Empty chat state** (no messages yet): big wordmark with the bot's display name (or
  "HERMES AGENT" for the default bot) + one muted line under it, over the textured backdrop —
  like the desktop's new-session screen.
- **Loading / connecting text**: monospace animated `CONNECT+--` style (cycling `+--`, `-+-`,
  `--+` and a block glyph), used in the reconnect banner and the app boot screen.
- **Composer**: pill shape, placeholder "Dale una tarea a {bot}", round voice/send button.
- Apply to Home topbar labels (`label-mono`), settings section headers, tool-activity rows.

## 4. PWA chrome

Update `theme_color` / `background_color` in `vite.config.ts` and the `<meta name="theme-color">`
logic to the new dark/light backgrounds.

## Verification

`npx tsc -p tsconfig.app.json --noEmit` + `npm run lint` pass; conventional commits, no AI
attribution. Final report: files, the 3 wordmark candidates (with their licenses), deviations,
open questions.

## 5. Extra (answer to Phase 1b open question)

Wire `mood="working"` (desktop `work`) on Home rows and the hero when the profile row has an active
`worker_session` (already in `ProfileRow`), mirroring the desktop roster.
