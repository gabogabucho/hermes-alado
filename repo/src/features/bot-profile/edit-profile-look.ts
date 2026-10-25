// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Ported from apps/desktop/src/plugins/hermes-bots/edit-profile-look.ts (commit bf0203a).

/** What Edit Profile shows for a bot's look, as opened and as submitted. */
export interface EditProfileLook {
  color: null | string
  image: null | string
  shape: string
  title: string
}

/**
 * The fields the user actually changed since the editor opened, as a
 * `saveProfileMeta` patch; null when nothing changed. Untouched fields stay
 * out of the patch: a form value seeded minutes ago is not an edit, and
 * sending it would revert whatever another client or the backend wrote since.
 */
export function editedLook(
  opened: EditProfileLook,
  current: EditProfileLook,
): {
  shape?: string
  color?: null | string
  image?: null | string
  imageKind?: 'photo' | 'shape'
  custom?: boolean
  title?: string
} | null {
  const patch: {
    shape?: string
    color?: null | string
    image?: null | string
    imageKind?: 'photo' | 'shape'
    custom?: boolean
    title?: string
  } = {}

  if (current.shape !== opened.shape) {
    patch.shape = current.shape
  }

  if (current.color !== opened.color) {
    // The desktop drops `undefined` from its JSON payload, so "Igualar al
    // nombre" (color → null) never reaches the gateway and the stale color
    // survives. Send null EXPLICITLY — the ui_meta merge stores it and
    // `botAppearance` falls back to the name's hue, which is the point.
    patch.color = current.color
  }

  if (current.image !== opened.image) {
    patch.image = current.image
    patch.imageKind = current.image ? 'photo' : 'shape'
  }

  if (Object.keys(patch).length > 0) {
    patch.custom = true
  }

  if (current.title.trim() !== opened.title.trim()) {
    patch.title = current.title.trim()
  }

  return Object.keys(patch).length > 0 ? patch : null
}
