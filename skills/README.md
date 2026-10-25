# Skills

Agent skills shipped with Hermes DroidBot.

## `alado-companion`

Teaches a bot that it is talked to from **Alado** — the DroidBot phone PWA — and not from
Hermes Desktop. Alado users have no desktop menus, so the bot must stop sending them to places
that do not exist ("Bots → Screen → Take over") and instead use the Alado flow: open the
exact page, then ask the user to go to their bot profile → **Computadora** → **Ver** /
**Tomar el control** / **Devolver** from the phone. It also tells the bot to hand control over
for logins, 2FA, captchas and payments instead of asking for secrets in chat, and to keep
replies short and phone-friendly.

The skill lives in `skills/alado-companion/`:

- `SKILL.md` — the skill itself (what the model loads).
- `soul-block.md` — the marked SOUL pointer block (`<!-- alado:begin/end -->`) that makes the
  model load the skill. Without this block in a profile's `SOUL.md`, the model does not load
  the skill.

It is installed by the provisioner `companion` module (`provisioner/prepare.sh`): the folder is
copied to `~/.hermes/alado-skills/`, merged into every profile's `skills.external_dirs`, and
the SOUL block is upserted into every profile's `SOUL.md`. See
[`docs/provisioner.md`](../docs/provisioner.md).
