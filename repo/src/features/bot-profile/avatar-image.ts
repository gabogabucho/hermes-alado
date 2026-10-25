// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Ported from apps/desktop/src/plugins/hermes-bots/avatar-image.ts (commit bf0203a).

/** The device-upload path for image avatars. Kept apart from the picker so the
 *  picker's render path doesn't drag the file-reading surface along with it. */

/** Input cap before downscale — room for big phone photos; the SENT asset is a
 *  256px PNG (a few dozen KB), always under the gateway's 2 MB asset cap. */
const AVATAR_IMAGE_INPUT_MAX_BYTES = 15_000_000

export interface PickedAvatarImage {
  /** Data URL, or null on cancel. */
  data: null | string
  error: null | string
}

/** Downscale to a small square PNG so the stored/sent asset stays light. */
export function normalizeAvatarImage(dataUrl: string, edge = 256): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = edge
        canvas.height = edge
        const ctx2d = canvas.getContext('2d')!
        const side = Math.min(img.width, img.height)
        ctx2d.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, edge, edge)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(dataUrl)
      }
    }

    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

/** Open the device photo picker; resolves the file as a data URL (or null on
 *  cancel). Oversized files resolve with an error string instead. */
export function pickAvatarImageFromDevice(): Promise<PickedAvatarImage> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp'

    input.onchange = () => {
      const file = input.files?.[0]

      if (!file) {
        resolve({ data: null, error: null })
        return
      }

      if (file.size > AVATAR_IMAGE_INPUT_MAX_BYTES) {
        resolve({ data: null, error: 'La imagen es muy grande (máx. 15 MB).' })
        return
      }

      const reader = new FileReader()
      reader.onload = () =>
        resolve({ data: typeof reader.result === 'string' ? reader.result : null, error: null })
      reader.onerror = () => resolve({ data: null, error: 'No se pudo leer la imagen.' })
      reader.readAsDataURL(file)
    }

    input.click()
  })
}
