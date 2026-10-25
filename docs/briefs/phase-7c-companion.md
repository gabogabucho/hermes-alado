# Phase 7c brief — preparer module `companion` (teach every bot it lives in Alado)

Worktree: create a new Orca worktree from `feat/phase-1-home-chat` (branch `phase-7c-companion`).
Read `repo/AGENTS.md`. Never touch the VPS (the architect runs the script). Bash, LF line endings.

## Context (verified live by the architect on the VPS)
Bots answered "go to Hermes Desktop → Bots → Screen → Take over" because the gateway tells them they
are in the TUI. Fix that ships today, by hand:
- `skills/alado-companion/SKILL.md` installed at `~/.hermes/alado-skills/alado-companion/SKILL.md`;
- every profile's `config.yaml` has `skills.external_dirs` including `~/.hermes/alado-skills`
  (set with `hermes -p <profile> config set skills.external_dirs '[...]'`, run as the hermes user);
- every profile's `SOUL.md` ends with the block in `skills/alado-companion/soul-block.md`, between
  `<!-- alado:begin -->` / `<!-- alado:end -->` markers. Without this SOUL pointer the model did NOT
  load the skill; with it, it did (`skill_view alado-companion` → correct Alado steps).
  Default profile = `~/.hermes/SOUL.md`; others = `~/.hermes/profiles/<name>/SOUL.md`.
New bots created from Alado use `clone_from`, which copies `config.yaml` + `SOUL.md`, so they inherit
both automatically.

## Task
Add a `companion` module to `provisioner/prepare.sh` (same style as the existing modules: `--check`
reports ok/missing per profile, `--dry-run` prints actions, apply is idempotent):
1. Copy the skill dir to `~/.hermes/alado-skills/` (owned by the hermes user). `--skills-src` flag,
   default = `skills/` next to the script's repo root (mirror how `--plugin-src` works).
2. For each profile (default + `~/.hermes/profiles/*`): MERGE `~/.hermes/alado-skills` into
   `skills.external_dirs` — read the current list with `hermes -p <p> config get` first, never drop
   entries the user had.
3. For each profile: replace-or-append the marked SOUL block (strip any old block, ensure exactly one
   blank line before it, create SOUL.md if missing). Never touch text outside the markers.
4. Add the module to the default module list and to `provisioner/README.md` / `docs/provisioner.md`.
Also add a short `skills/README.md` explaining what the skill is for (English).

## Done when
`bash -n provisioner/prepare.sh` passes and `shellcheck` if available. Commit (conventional, no AI
attribution). Report: the module's check/dry-run output format and any open questions.
