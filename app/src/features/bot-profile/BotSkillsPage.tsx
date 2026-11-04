import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  listBotSkills,
  readSkillContent,
  setEnabledBotSkills,
  writeSkillContent,
  type BotSkill,
} from '../../lib/hermes/bot-skills'
import { BotScopedScreen } from './BotScopedScreen'
import { Row, Section } from '../../ui/Section'
import { Sheet } from '../../ui/Sheet'
import { Skeleton } from '../../ui/Skeleton'
import { Toggle } from '../../ui/Toggle'
import './bot-profile.css'

/**
 * Skills (per bot): the bot's installed skills with a live toggle
 * (`profiles.describe` / `profiles.configure` → `skills.disabled` of the
 * bot's own config) and a tap-to-edit sheet for the SKILL.md content
 * (`learning.detail` / `learning.edit`). A skill the server cannot resolve
 * for editing (isolated in another profile's dir) opens read-only with an
 * honest note instead of pretending.
 */
export function BotSkillsPage() {
  const { profile = 'default' } = useParams()
  const t = useT()

  const [skills, setSkills] = useState<BotSkill[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const [openSkill, setOpenSkill] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [contentState, setContentState] = useState<'loading' | 'ready' | 'unavailable' | 'saving' | 'saved'>('loading')
  const [contentNote, setContentNote] = useState('')
  const [saveError, setSaveError] = useState('')

  async function reload(): Promise<void> {
    setError('')
    try {
      setSkills(await listBotSkills(profile))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('skills.loadFailed'))
    }
  }

  useEffect(() => {
    setSkills(null)
    setFilter('')
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  const visible = useMemo(() => {
    if (!skills) return null
    const needle = filter.trim().toLowerCase()
    return needle ? skills.filter(s => s.name.toLowerCase().includes(needle)) : skills
  }, [skills, filter])

  const enabledCount = useMemo(
    () => (skills ? skills.filter(s => s.enabled).length : null),
    [skills],
  )

  async function toggleSkill(name: string, next: boolean): Promise<void> {
    if (!skills) return
    const previous = skills
    const updated = skills.map(s => (s.name === name ? { ...s, enabled: next } : s))
    setSkills(updated)
    setBusy(name)
    try {
      await setEnabledBotSkills(profile, updated)
    } catch (e) {
      setSkills(previous)
      setError(e instanceof Error ? e.message : t('skills.toggleFailed'))
    } finally {
      setBusy(null)
    }
  }

  async function openSheet(name: string): Promise<void> {
    setOpenSkill(name)
    setContent('')
    setContentNote('')
    setSaveError('')
    setContentState('loading')
    try {
      const result = await readSkillContent(name)
      if (result.ok) {
        setContent(result.content)
        setContentState('ready')
      } else {
        setContentNote(result.message ?? t('skills.notEditable'))
        setContentState('unavailable')
      }
    } catch {
      setContentNote(t('skills.notEditable'))
      setContentState('unavailable')
    }
  }

  async function saveContent(): Promise<void> {
    if (!openSkill) return
    setContentState('saving')
    setSaveError('')
    try {
      await writeSkillContent(openSkill, content)
      setContentState('saved')
    } catch (e) {
      setContentState('ready')
      setSaveError(e instanceof Error ? e.message : t('skills.saveFailed'))
    }
  }

  return (
    <BotScopedScreen profile={profile} title={t('skills.title')}>
      {error ? <p className="error-text" style={{ padding: '0 var(--space-4)' }}>{error}</p> : null}

      {!skills ? (
        <div style={{ padding: 'var(--space-4)' }}>
          <Skeleton height={52} />
          <Skeleton height={52} />
          <Skeleton height={52} />
        </div>
      ) : skills.length === 0 ? (
        <Section footer={t('skills.emptyFooter')}>
          <Row icon="folder" title={t('skills.empty')} subtitle={t('skills.emptySub')} />
        </Section>
      ) : (
        <>
          <div style={{ padding: '0 var(--space-4) var(--space-3)' }}>
            <input
              className="input"
              placeholder={t('skills.filter')}
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <p className="faint" style={{ marginTop: 'var(--space-2)' }}>
              {t('skills.count', { enabled: String(enabledCount ?? 0), total: String(skills.length) })}
            </p>
          </div>
          <Section footer={t('skills.footer')}>
            {(visible ?? []).map(skill => (
              <Row
                key={skill.name}
                icon="folder"
                title={skill.name}
                subtitle={skill.enabled ? t('skills.enabled') : t('skills.disabled')}
                onClick={() => void openSheet(skill.name)}
                trailing={
                  <Toggle
                    checked={skill.enabled}
                    onChange={busy === skill.name ? () => undefined : (next => void toggleSkill(skill.name, next))}
                    label={skill.name}
                  />
                }
              />
            ))}
            {visible && visible.length === 0 ? (
              <Row icon="folder" title={t('skills.noMatches')} />
            ) : null}
          </Section>
        </>
      )}

      <Sheet
        open={openSkill !== null}
        onClose={() => setOpenSkill(null)}
        title={openSkill ?? ''}
      >
        {contentState === 'loading' ? (
          <Skeleton height={220} />
        ) : contentState === 'unavailable' ? (
          <p className="muted" style={{ padding: '0 var(--space-4)' }}>{contentNote}</p>
        ) : (
          <>
            <textarea
              className="input bp-textarea bp-textarea-mono"
              style={{ minHeight: '40vh' }}
              value={content}
              onChange={e => {
                setContent(e.target.value)
                if (contentState === 'saved') setContentState('ready')
              }}
            />
            {saveError ? <p className="error-text" style={{ padding: 'var(--space-2) 0' }}>{saveError}</p> : null}
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 'var(--space-3)' }}
              disabled={contentState === 'saving' || contentState === 'saved'}
              onClick={() => void saveContent()}
            >
              {contentState === 'saving'
                ? t('common.saving')
                : contentState === 'saved'
                  ? t('skills.saved')
                  : t('common.save')}
            </button>
          </>
        )}
      </Sheet>
    </BotScopedScreen>
  )
}
