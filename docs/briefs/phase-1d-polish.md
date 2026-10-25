# Phase 1d brief — From "text on text" to a friendly product (design pass)

Branch `feat/phase-1-home-chat` (main checkout; phases 0,1,1b,1c,3,4a,5a are merged here).
App code in `repo/`. Read `repo/AGENTS.md` first (never run the dev server in the foreground).
Hermes source of truth: `.hermes-ref/` (pinned `bf0203a`). Keep all UI text in Spanish (i18n
comes later — do not add an i18n system now).

## The problem (user feedback, real phone screenshots)

"Estética rudimentaria de texto sobre texto". Screens stack grey title+subtitle rows with no
hierarchy, no icons, raw technical dumps, three different page-header styles, letter tiles
instead of brand logos, blue accent that doesn't feel like Hermes. Goal: a calm, friendly,
**native-feeling** app (think iOS Settings / GrokBot polish) with the Hermes desktop vibe.

## A. Design system first (`repo/src/ui/`) — then apply everywhere

1. **Color — "Hermes" theme = slate + Hermes gold.** Keep the dark slate neutrals from the `nous`
   preset, but the **accent becomes Hermes amber/gold** (the Hermes skin colors sent in
   `gateway.ready` → `skin.colors`: `ui_accent #FFBF00`, `banner_title #FFD700`,
   `banner_border #CD7F32`, `banner_text #FFF8DC`). Tokens: `--accent` gold (slightly desaturated
   for large fills, e.g. `#E8B23A`), `--on-accent` near-black, `--accent-soft` (gold ~16% over
   surface) for selected states/user bubble, `--accent-line` bronze for hairlines/focus.
   Blue is used **only** for links. `clean` (light) keeps ink accent but adopts the same
   structure. Theme picker labels: "Automático" (was Sistema), "Hermes", "Clean".
2. **`PageShell` + `PageHeader`** — ONE header for every sub-screen: safe-area top padding,
   16 px side gutters, back `IconButton` (glass), title (20/600), optional trailing actions,
   becomes a compact blurred bar on scroll. Replace every ad-hoc header (Settings, Connectors,
   Vault, Control, Routines, Library, Working, detail pages). Large-title variant for top-level
   screens is fine if consistent.
3. **Grouped inset lists** (`Section` + `Row`), iOS-style: section label (small caps, muted) above
   a rounded card; rows inside the card separated by hairlines (inset after the icon), not
   separate floating cards per row. `Row` = **icon tile** (28–32 px rounded square with a tinted
   background per category, white/glyph inside) + title (16/500) + optional value/subtitle
   (1 line, muted) + trailing (chevron / toggle / badge / value). Subtitles only when they add
   info.
4. **`Disclosure`** — collapsible "Detalles técnicos" block (chevron, animated height) for any
   diagnostic or raw data.
5. **`EmptyState`** — icon in a soft circle (or the bot avatar), title (17/600), one helpful line,
   primary CTA button.
6. **`StatusDot` / `Badge`** — small colored dot + short label ("Conectado", "Requiere
   configuración", "Error"), not outlined pills full of text.
7. **`BrandIcon`** — port `.hermes-ref/apps/desktop/src/lib/brand-icon.ts` (MIT header) with
   `@icons-pack/react-simple-icons@13.11.1` (exact; Simple Icons are CC0). Same domain-keyed lookup
   as the desktop; see how the desktop derives a connector's domain/name for the lookup
   (grep `brandIcon`/`brand-icon` usages in `apps/desktop/src`) and mirror it. Fallback: a
   tinted tile with the initial (deterministic color per name). Keep bundle in check (named
   imports only; verify tree-shaking keeps the build reasonable).
8. **Typography rhythm**: one scale (34/28/20/17/15/13), max 2 text levels per row, generous
   spacing (16/24 px), markdown lists in chat with normal (tight) item spacing.

## B. Apply per screen

- **Home**: principal bot hero without the thick ring — soft gold halo/glow behind the avatar +
  small "Principal" badge; **the whole hero is tappable** (opens chat). **Choosing the principal
  bot**: on any bot row, a `…`/long-press menu → "Destacar como principal"; store the choice as a
  per-device preference `droidbot.featuredBot` in localStorage (allowed: not a secret), default to
  `/api/profiles/active`. Rows: avatar, name, preview, time, unread dot — more air, no card-per-row
  look (use the grouped list). User chip top-left: avatar only (no blue disc), "DROIDBOT" label
  stays mono but smaller/dimmer.
- **Chat**: user bubble `--accent-soft` with normal text (not saturated fill); assistant bubble
  quieter (no heavy border); tighter markdown list spacing; "Pensando…" as a subtle inline chip.
- **Settings**: grouped sections: "Cuenta" (avatar+name), "Bot" (Conectar aplicaciones, Bóveda,
  Control del agente — each with a colored icon tile), "Apariencia" (theme segmented control),
  "Avanzado" (backend URL, collapsed). Remove the explanatory paragraph or move it into Avanzado.
- **Conectar aplicaciones**: `BrandIcon` on every row; header title single line (+ count as a
  small badge, **count = connected items of the current filter**, label "activos"; skills that are
  merely enabled don't inflate the Apps count); chips row horizontally scrollable with fade edges;
  rows: icon, name, one-line description, trailing small "Conectar" (tonal button, not big blue) /
  "Conectado" (check + muted). Fix back button: it navigates to `/profiles` (route no longer
  exists → black screen). Add a shared `useBack(fallback)` (history back if there is in-app
  history, else `fallback`) and use it in **every** back button.
- **Bóveda**: rows titled by a **human label** (derive from the description's first clause or a
  small map for common keys; e.g. `BRAVE_SEARCH_API_KEY` → "Brave Search"), env var name shown
  small in mono below; `BrandIcon` when the provider is recognizable; status dot "Configurada" /
  "Sin configurar"; group by category in sections; hide internal/advanced vars behind a
  "Mostrar avanzadas" disclosure. **Fix the horizontal scroll** (long names: `min-width:0`,
  ellipsis, `overflow-wrap:anywhere` in the mono line; audit with a 360 px viewport).
- **Control del agente**: Auto-review card stays (segmented, gold active). Computer use: one row
  with icon + status dot ("Listo" / "Requiere configuración") + toggle; the cua-driver
  diagnostics go inside a `Disclosure` "Detalles técnicos", rendered as compact key/value rows
  with ok/warn dots — never a wall of text.
- **Rutinas / Biblioteca / Programando / detail pages / vault key page / connector detail**:
  `PageShell`, grouped lists, `EmptyState` with CTA (Rutinas: "Crear rutina" opens the blueprint
  sheet; Biblioteca: "Subir archivo"; Programando: "Nada en curso").
- **Global**: 16 px gutters everywhere, no element touching screen edges, safe-area insets,
  consistent 44 px touch targets, pressed states on rows, no horizontal scroll on any screen at
  360 px width.

## C. Process

Work component-first (A), commit, then screen by screen (B), small conventional commits. No AI
attribution. Verify with `npx tsc -p tsconfig.app.json --noEmit` and `npm run lint`. You MAY start
the dev server **in the background** and use Playwright/Chrome headless screenshots at 360×780
to self-check layouts, then kill it. Final report: components added, screens changed, the human
label strategy for the vault, bundle size before/after (`npm run build` is allowed ONCE at the
end only to report size — do not commit `dist/`), open questions.
