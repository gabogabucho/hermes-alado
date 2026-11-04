import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useT } from '../../i18n'
import {
  deleteBotMemory,
  readBotMemory,
  type MemoryEntry,
  type MemoryTarget,
} from '../../lib/hermes/bot-memory'
import { ConfirmSheet } from '../vault/ConfirmSheet'
import { BotScopedScreen } from './BotScopedScreen'
import { Row, Section } from '../../ui/Section'
import { Skeleton } from '../../ui/Skeleton'
import './bot-profile.css'

/**
 * Memory (per bot): every entry the bot carries in its system prompt —
 * "qué recuerda este bot" — with one-tap individual delete. Data comes from
 * the droidbot-push plugin (memories/MEMORY.md + USER.md of the profile,
 * the same files the agent's MemoryStore reads), so what you see and delete
 * here is exactly what the bot knows. A 409 (entry changed since load)
 * reloads the list instead of deleting the wrong line.
 */
export function BotMemoryPage() {
  const { profile = 'default' } = useParams()
  const t = useT()

  const [data, setData] = useState<{ memory: MemoryEntry[]; user: MemoryEntry[] } | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<{ target: MemoryTarget; entry: MemoryEntry } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function reload(): Promise<void> {
    setError('')
    try {
      setData(await readBotMemory(profile))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('memory.loadFailed'))
    }
  }

  useEffect(() => {
    setData(null)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function doDelete(): Promise<void> {
    if (!pending) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteBotMemory(profile, pending.target, pending.entry.id)
      setPending(null)
      await reload()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t('memory.deleteFailed'))
      setPending(null)
      await reload() // 409 staleness: mostrar el estado real del archivo
    } finally {
      setDeleting(false)
    }
  }

  function entryRows(target: MemoryTarget, entries: MemoryEntry[], label: string) {
    if (entries.length === 0) return null
    return (
      <Section label={label}>
        {entries.map(entry => (
          <Row
            key={`${target}:${entry.id}`}
            icon="note"
            title={entry.text}
            onClick={() => setPending({ target, entry })}
          />
        ))}
      </Section>
    )
  }

  const empty = data !== null && data.memory.length === 0 && data.user.length === 0

  return (
    <BotScopedScreen profile={profile} title={t('memory.title')}>
      {error ? <p className="error-text" style={{ padding: '0 var(--space-4)' }}>{error}</p> : null}

      {!data ? (
        <div style={{ padding: 'var(--space-4)' }}>
          <Skeleton height={52} />
          <Skeleton height={52} />
        </div>
      ) : empty ? (
        <Section footer={t('memory.footer')}>
          <Row icon="note" title={t('memory.empty')} subtitle={t('memory.emptySub')} />
        </Section>
      ) : (
        <>
          {entryRows('memory', data.memory, t('memory.what'))}
          {entryRows('user', data.user, t('memory.who'))}
          <p className="faint" style={{ padding: '0 var(--space-4) var(--space-4)' }}>
            {t('memory.footer')}
          </p>
        </>
      )}

      {pending ? (
        <ConfirmSheet
          open
          onClose={() => setPending(null)}
          title={t('memory.confirmDelete')}
          body={
            <>
              <p className="muted">{pending.entry.text}</p>
              <p className="faint">{t('memory.confirmDeleteBody')}</p>
              {deleteError ? <p className="error-text">{deleteError}</p> : null}
            </>
          }
          confirmLabel={t('memory.confirmDelete')}
          busy={deleting}
          onConfirm={() => void doDelete()}
        />
      ) : null}
    </BotScopedScreen>
  )
}
