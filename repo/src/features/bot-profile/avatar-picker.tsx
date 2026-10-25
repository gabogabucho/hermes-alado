// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
// Ported from apps/desktop/src/plugins/hermes-bots/avatar-picker.tsx (commit bf0203a).

import { useState } from 'react'
import { Avatar } from '../../ui/Avatar'
import {
  avatarColor,
  BLOB_KINDS,
  blobShapeString,
  defaultShapeFor,
  isBlobShape,
  parseBlobShape,
} from '../../ui/avatar/appearance'
import { PROFILE_SWATCHES } from '../../ui/avatar/profile-color'
import { normalizeAvatarImage, pickAvatarImageFromDevice } from './avatar-image'

// The original flat shapes the picker offers (the desktop's grid, 'blobatar'
// from the name prepended). Sigils and platonic solids stay render-only.
const AVATAR_PICKER_SHAPES = ['circle', 'blob', 'squircle', 'pill', 'triangle', 'hexagon', 'cloud', 'drop']

/**
 * The avatar editor shared by Edit Profile: shape grid + color swatches, and
 * the photo-upload tab. Ported from the desktop picker, minus the Generate
 * and Pet tabs (out of scope for DroidBot).
 */
export function AvatarPicker({
  name,
  shape,
  color,
  image,
  onShape,
  onColor,
  onImage,
}: {
  /** Feeds the name-derived faces (`blobatar` seeds). */
  name: string
  /** `null` = no explicit pick, i.e. the name's deterministic hue. */
  color: null | string
  image: null | string
  onColor: (color: null | string) => void
  onImage: (image: null | string) => void
  onShape: (shape: string) => void
  shape: string
}) {
  const [tab, setTab] = useState<'look' | 'photo'>('look')
  const [uploadError, setUploadError] = useState<null | string>(null)

  const upload = async () => {
    setUploadError(null)
    const picked = await pickAvatarImageFromDevice()

    if (picked.error) {
      setUploadError(picked.error)
      return
    }

    if (picked.data) {
      onImage(await normalizeAvatarImage(picked.data))
    }
  }

  return (
    <div className="bp-picker">
      <div className="bp-picker-preview">
        <Avatar
          name={name}
          size={72}
          appearance={{ shape, color: avatarColor(color, name), image }}
        />
      </div>

      <div className="bp-seg">
        <button
          type="button"
          className={`btn${tab === 'look' ? ' btn-primary' : ''}`}
          onClick={() => setTab('look')}
        >
          Figura
        </button>
        <button
          type="button"
          className={`btn${tab === 'photo' ? ' btn-primary' : ''}`}
          onClick={() => setTab('photo')}
        >
          Foto
        </button>
      </div>

      {image && tab !== 'photo' ? (
        <div className="bp-actions">
          <button type="button" className="btn btn-sm" onClick={() => onImage(null)}>
            Quitar foto
          </button>
        </div>
      ) : null}

      {tab === 'look' ? (
        isBlobShape(shape) ? (
          (() => {
            const { seedPart, kind } = parseBlobShape(shape, name)
            const locked = Boolean(seedPart)

            return (
              <div className="bp-picker-section">
                {/* Silhouette pins: Auto (name decides) + the ten blob kinds. */}
                <div className="bp-shape-grid">
                  {['', ...BLOB_KINDS].map(k => (
                    <button
                      key={k || 'auto'}
                      type="button"
                      aria-label={k || 'Automático'}
                      className={`bp-shape-btn${k === kind && !image ? ' bp-shape-btn--on' : ''}`}
                      onClick={() => {
                        onImage(null)
                        onShape(blobShapeString(seedPart, k))
                      }}
                    >
                      {k ? (
                        <Avatar
                          name={name}
                          size={36}
                          appearance={{ shape: blobShapeString(seedPart, k), color: avatarColor(color, name), image: null }}
                        />
                      ) : (
                        <span className="bp-auto-label">Auto</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="bp-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      onImage(null)
                      onShape(blobShapeString(Math.random().toString(36).slice(2, 10), kind))
                    }}
                  >
                    Aleatorio
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onShape(blobShapeString(locked ? '' : name, kind))}
                  >
                    {locked ? 'Desbloquear cara' : 'Bloquear cara'}
                  </button>
                </div>

                <p className="bp-hint">
                  {locked
                    ? 'La cara quedó fijada con esta semilla.'
                    : 'La cara sigue al nombre del bot.'}
                </p>

                <div className="bp-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => onShape(defaultShapeFor(name))}
                  >
                    Formas clásicas
                  </button>
                </div>
              </div>
            )
          })()
        ) : (
          <div className="bp-picker-section">
            <div className="bp-shape-grid">
              {['blobatar', ...AVATAR_PICKER_SHAPES].map(s => (
                <button
                  key={s}
                  type="button"
                  aria-label={s === 'blobatar' ? 'Cara por nombre' : s}
                  className={`bp-shape-btn${s === shape && !image ? ' bp-shape-btn--on' : ''}`}
                  onClick={() => {
                    onImage(null)
                    onShape(s)
                  }}
                >
                  <Avatar
                    name={name}
                    size={36}
                    appearance={{ shape: s, color: avatarColor(color, name), image: null }}
                  />
                </button>
              ))}
            </div>

            <div className="bp-swatches">
              {PROFILE_SWATCHES.map(c => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  className={`bp-swatch${c === color && !image ? ' bp-swatch--on' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => {
                    onImage(null)
                    onColor(c)
                  }}
                />
              ))}
            </div>

            <div className="bp-actions">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  onImage(null)
                  onColor(null)
                }}
              >
                Igualar al nombre
              </button>
            </div>
          </div>
        )
      ) : null}

      {tab === 'photo' ? (
        <div className="bp-picker-section">
          {image ? (
            <div className="bp-picker-preview">
              <Avatar name={name} size={72} appearance={{ shape, color: avatarColor(color, name), image }} />
              <div className="bp-actions">
                <button type="button" className="btn btn-sm" onClick={() => onImage(null)}>
                  Quitar foto
                </button>
              </div>
            </div>
          ) : (
            <p className="bp-hint">PNG, JPEG o WebP. Se guarda recortada en cuadrado.</p>
          )}
          <button type="button" className="btn btn-block" onClick={() => void upload()}>
            Elegir foto
          </button>
          {uploadError ? <p className="error-text">{uploadError}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
