import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { useBack } from '../../app/transition'
import { apiFetch } from '../../lib/api'
import { saveProfileAvatarAsset, saveProfileMeta } from '../../lib/hermes/profile-edit'
import { Avatar } from '../../ui/Avatar'
import { EmptyState } from '../../ui/EmptyState'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Sheet } from '../../ui/Sheet'
import { Skeleton } from '../../ui/Skeleton'
import { ensureAppearances, invalidateBotAppearance, useBotAppearance } from '../bots/appearance-store'
import { homeProfiles, loadHome } from '../home/store'
import { AvatarPicker } from './avatar-picker'
import { editedLook, type EditProfileLook } from './edit-profile-look'
import { botDisplayName, profileBotMeta } from './store'
import './bot-profile.css'

interface ModelOptionProvider {
  models?: Array<string | { id?: string; name?: string }>
  name?: string
  slug: string
}
interface ModelOptionsResult {
  providers?: ModelOptionProvider[]
}
interface SoulResult {
  content: string
  exists?: boolean
}

function providerModels(provider: ModelOptionProvider | undefined): string[] {
  return (provider?.models ?? [])
    .map(m =>
      typeof m === 'string'
        ? m
        : m && typeof m === 'object' && 'id' in m
          ? String(m.id ?? m.name ?? '')
          : '',
    )
    .filter(Boolean)
}

/**
 * Edit Profile: appearance (avatar picker in a Sheet), title, description,
 * SOUL and model — the mobile mirror of the desktop's Edit Profile dialog,
 * laid out as the Phase 1d grouped form sections.
 * Look fields save like the desktop: `profiles.configure` with a
 * `ui_meta['hermes-bots']` patch + CAS (`editedLook`), photo via
 * `profiles.set_asset`. Description/soul/model ride the REST profile routes.
 */
export function BotProfileEditPage() {
  const { profile = 'default' } = useParams()
  const back = useBack(`/bots/${encodeURIComponent(profile)}`)
  const rows = useStore(homeProfiles)
  const appearance = useBotAppearance(profile)

  const row = rows.find(r => r.name === profile)
  const meta = profileBotMeta(row)

  const [seeded, setSeeded] = useState(false)
  const [opened, setOpened] = useState<EditProfileLook | null>(null)
  const [shape, setShape] = useState('circle')
  const [color, setColor] = useState<null | string>(null)
  const [image, setImage] = useState<null | string>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  const [soul, setSoul] = useState('')
  const [soulLoaded, setSoulLoaded] = useState(false)
  const [soulError, setSoulError] = useState(false)
  const [originalSoul, setOriginalSoul] = useState('')

  const [options, setOptions] = useState<ModelOptionProvider[]>([])
  const [optionsLoaded, setOptionsLoaded] = useState(false)
  const [optionsError, setOptionsError] = useState(false)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')

  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const imageTouched = useRef(false)

  useEffect(() => {
    ensureAppearances()
  }, [])

  // Seed the form once the roster row (and its resolved look) arrives.
  useEffect(() => {
    if (!row || seeded) return
    const openingTitle = meta?.title?.trim() || ''
    setShape(appearance.shape)
    setColor(appearance.color)
    setImage(appearance.image)
    setTitle(openingTitle)
    setDescription(row.description ?? '')
    setProvider(row.provider ?? '')
    setModel(row.model ?? '')
    setOpened({ shape: appearance.shape, color: appearance.color, image: appearance.image, title: openingTitle })
    setSeeded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, appearance.image, appearance.shape, appearance.color, seeded])

  // The photo asset arrives after the roster row (it lives in the asset
  // store, not ui_meta). Adopt it into the form unless the user already
  // changed the image — otherwise a shape edit would silently keep a stale
  // server photo.
  useEffect(() => {
    if (!seeded || imageTouched.current) return
    if (appearance.image !== image) {
      setImage(appearance.image)
      setOpened(o => (o ? { ...o, image: appearance.image } : o))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearance.image, seeded])

  function handleImage(next: null | string): void {
    imageTouched.current = true
    setImage(next)
  }

  // Soul: read SOUL.md once.
  useEffect(() => {
    let live = true
    apiFetch<SoulResult>(`/api/profiles/${encodeURIComponent(profile)}/soul`)
      .then(res => {
        if (!live) return
        setSoul(res.content ?? '')
        setOriginalSoul(res.content ?? '')
        setSoulLoaded(true)
      })
      .catch(() => {
        if (live) setSoulError(true)
      })
    return () => {
      live = false
    }
  }, [profile])

  // Model list: the REST twin of `model.options` (same response shape).
  useEffect(() => {
    let live = true
    apiFetch<ModelOptionsResult>(`/api/model/options?profile=${encodeURIComponent(profile)}`)
      .then(res => {
        if (!live) return
        setOptions(res.providers ?? [])
        setOptionsLoaded(true)
      })
      .catch(() => {
        if (live) setOptionsError(true)
      })
    return () => {
      live = false
    }
  }, [profile])

  const providerOption = useMemo(() => options.find(p => p.slug === provider), [options, provider])
  const modelOptions = useMemo(() => {
    const list = providerModels(providerOption)
    if (model && provider === row?.provider && !list.includes(model)) list.unshift(model)
    return list
  }, [providerOption, model, provider, row?.provider])

  const originalProvider = row?.provider ?? ''
  const originalModel = row?.model ?? ''
  const modelChanged = Boolean(provider && model) && (provider !== originalProvider || model !== originalModel)

  async function onSave() {
    if (!row || saving) return
    setSaving(true)
    setNotice('')
    let stay = false

    try {
      const look = opened ? editedLook(opened, { shape, color, image, title }) : null

      if (look) {
        if ('image' in look) {
          await saveProfileAvatarAsset(profile, look.image ?? null)
        }
        const res = await saveProfileMeta(profile, look)
        if (res.conflict) {
          stay = true
          setNotice(
            'Otro cliente modificó este bot mientras editabas. Recargamos los datos: revisá los cambios y guardá de nuevo.',
          )
        } else if (res.serverOutcome === 'failed') {
          stay = true
          setNotice('Hermes no pudo guardar el aspecto del bot.')
        }
      }

      if (description.trim() !== (row.description ?? '').trim()) {
        await apiFetch(`/api/profiles/${encodeURIComponent(profile)}/description`, {
          method: 'PUT',
          body: JSON.stringify({ description: description.trim() }),
        })
      }

      if (soulLoaded && !soulError && soul !== originalSoul) {
        await apiFetch(`/api/profiles/${encodeURIComponent(profile)}/soul`, {
          method: 'PUT',
          body: JSON.stringify({ content: soul }),
        })
      }

      if (modelChanged) {
        await apiFetch(`/api/profiles/${encodeURIComponent(profile)}/model`, {
          method: 'PUT',
          body: JSON.stringify({ provider, model }),
        })
      }

      // Drop the cached photo BEFORE the refresh so the new look (or its
      // absence) re-pulls and shows everywhere immediately.
      invalidateBotAppearance(profile)

      // Refresh the profiles.list-driven stores (rows + appearances + photos).
      await loadHome()

      if (!stay) {
        back()
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell title="Editar" onBack={back}>
      {!row ? (
        <EmptyState title="No se encontró este bot" />
      ) : (
        <>
          <Section label="Identidad">
            <div className="bp-form">
              <div className="bp-field">
                <label className="label-mono">Nombre</label>
                <input
                  className="input"
                  placeholder={botDisplayName(row, profile)}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
              <div className="bp-field">
                <label className="label-mono">Descripción</label>
                <textarea
                  className="input bp-textarea"
                  placeholder="Qué hace este bot"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
            </div>
          </Section>

          <Section label="Personalidad / SOUL">
            <div className="bp-form">
              {soulError ? (
                <p className="error-text">No se pudo cargar el SOUL.</p>
              ) : soulLoaded ? (
                <textarea
                  className="input bp-textarea bp-textarea-mono"
                  value={soul}
                  onChange={e => setSoul(e.target.value)}
                />
              ) : (
                <Skeleton height={96} />
              )}
            </div>
          </Section>

          <Section label="Modelo">
            <div className="bp-form">
              {optionsError ? (
                <p className="error-text">No se pudieron cargar los modelos.</p>
              ) : optionsLoaded ? (
                <>
                  <select
                    className="input bp-select"
                    value={provider}
                    onChange={e => {
                      setProvider(e.target.value)
                      setModel('')
                    }}
                  >
                    {!provider ? <option value="">—</option> : null}
                    {provider && !options.some(p => p.slug === provider) ? (
                      <option value={provider}>Actual: {provider}</option>
                    ) : null}
                    {options.map(p => (
                      <option key={p.slug} value={p.slug}>
                        {p.name ?? p.slug}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input bp-select"
                    value={model}
                    disabled={modelOptions.length === 0}
                    onChange={e => setModel(e.target.value)}
                  >
                    {!model ? <option value="">Elegí un modelo</option> : null}
                    {model && !modelOptions.includes(model) ? (
                      <option value={model}>Actual: {model}</option>
                    ) : null}
                    {modelOptions.map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <p className="bp-hint">
                    Solo se guarda si elegís proveedor y modelo; el bot actual sigue igual hasta
                    entonces.
                  </p>
                </>
              ) : (
                <Skeleton height={44} />
              )}
            </div>
          </Section>

          <Section label="Avatar">
            <Row
              leading={<Avatar name={profile} size="md" appearance={appearance} />}
              title="Figura y color"
              subtitle="Cambiar forma, color o foto"
              chevron
              onClick={() => setPickerOpen(true)}
            />
          </Section>

          {notice ? <p className="error-text">{notice}</p> : null}

          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 'var(--space-3)' }}
            disabled={saving}
            onClick={() => void onSave()}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      )}

      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="Avatar">
        <AvatarPicker
          name={profile}
          shape={shape}
          color={color}
          image={image}
          onShape={s => {
            handleImage(null)
            setShape(s)
          }}
          onColor={c => {
            handleImage(null)
            setColor(c)
          }}
          onImage={handleImage}
        />
      </Sheet>
    </PageShell>
  )
}
