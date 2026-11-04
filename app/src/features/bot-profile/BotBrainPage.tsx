import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { useT } from '../../i18n'
import {
  BRAIN_CHOICES,
  fetchModelOptions,
  isBrainChoice,
  saveBrainChoice,
  type BrainChoice,
} from '../../lib/hermes/bot-brain'
import { readServerProfileMeta } from '../../lib/hermes/profile-edit'
import { BotScopedScreen } from './BotScopedScreen'
import { Row, Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import { homeProfiles, loadHome } from '../home/store'
import './bot-profile.css'

/**
 * Brain (per bot): which model family answers this bot — auto (the router
 * picks fast↔thinking per message), fast always, or thinking always.
 * The intent persists in the bot's ui_meta; when the server has the LiteLLM
 * router wired as a provider (its catalog lists auto+fast+smart) the choice
 * also pins the profile's model to it. Without the router the page says so
 * instead of pretending to have applied something.
 */
export function BotBrainPage() {
  const { profile = 'default' } = useParams()
  const t = useT()
  const rows = useStore(homeProfiles)
  const row = rows.find(r => r.name === profile)

  const [choice, setChoice] = useState<BrainChoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [routerSlug, setRouterSlug] = useState<string | null>(null)
  const [saving, setSaving] = useState<BrainChoice | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let live = true
    void (async () => {
      setLoading(true)
      setNotice('')
      try {
        const [meta, providers] = await Promise.all([
          readServerProfileMeta(profile),
          fetchModelOptions(profile).catch(() => []),
        ])
        if (!live) return
        if (meta && isBrainChoice(meta.meta.brain)) setChoice(meta.meta.brain)
        const router = providers.find(p => {
          const models = new Set(
            (p.models ?? [])
              .map(m => (typeof m === 'string' ? m : String(m?.id ?? m?.name ?? '')))
              .filter(Boolean),
          )
          return BRAIN_CHOICES.every(c => models.has(c))
        })
        setRouterSlug(router?.slug ?? null)
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => {
      live = false
    }
  }, [profile])

  async function pick(next: BrainChoice): Promise<void> {
    const previous = choice
    setChoice(next)
    setSaving(next)
    setNotice('')
    try {
      const providers = await fetchModelOptions(profile).catch(() => [])
      const models = new Set(
        (providers.find(p => p.slug === routerSlug)?.models ?? [])
          .map(m => (typeof m === 'string' ? m : String(m?.id ?? m?.name ?? '')))
          .filter(Boolean),
      )
      const wired = routerSlug !== null && BRAIN_CHOICES.every(c => models.has(c))
      const result = await saveBrainChoice(
        profile,
        next,
        wired ? providers.find(p => p.slug === routerSlug) ?? null : null,
      )
      if (!result.persisted) {
        setChoice(previous)
        setNotice(result.error ?? t('brain.saveFailed'))
        return
      }
      if (result.applied) {
        setNotice(t('brain.routerOn', { provider: result.provider ?? routerSlug ?? '' }))
      } else {
        setNotice(result.error ?? t('brain.routerMissing'))
      }
      await loadHome()
    } catch (e) {
      setChoice(previous)
      setNotice(e instanceof Error ? e.message : t('brain.saveFailed'))
    } finally {
      setSaving(null)
    }
  }

  const options: Array<{ value: BrainChoice; title: string; subtitle: string }> = [
    { value: 'auto', title: t('brain.auto'), subtitle: t('brain.autoSub') },
    { value: 'fast', title: t('brain.fast'), subtitle: t('brain.fastSub') },
    { value: 'smart', title: t('brain.smart'), subtitle: t('brain.smartSub') },
  ]

  return (
    <BotScopedScreen profile={profile} title={t('brain.title')}>
      {loading ? (
        <div style={{ padding: 'var(--space-4)' }}>
          <Skeleton height={52} />
          <Skeleton height={52} />
          <Skeleton height={52} />
        </div>
      ) : (
        <Section
          footer={routerSlug ? t('brain.routerOn', { provider: routerSlug }) : t('brain.routerMissing')}
        >
          {options.map(option => (
            <Row
              key={option.value}
              icon="brain"
              tint={choice === option.value ? 'accent' : 'neutral'}
              title={option.title}
              subtitle={option.subtitle}
              disabled={saving !== null}
              trailing={
                <span aria-hidden style={{ fontSize: 18, color: 'var(--accent, #d4a017)' }}>
                  {choice === option.value ? '●' : '○'}
                </span>
              }
              onClick={() => void pick(option.value)}
            />
          ))}
          {row?.model ? (
            <Row icon="info" title={t('brain.current', { value: row.model })} />
          ) : null}
        </Section>
      )}

      {notice ? (
        <p className="muted" style={{ padding: '0 var(--space-4)' }}>{notice}</p>
      ) : null}
    </BotScopedScreen>
  )
}
