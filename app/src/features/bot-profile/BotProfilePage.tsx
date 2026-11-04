import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '@nanostores/react'
import { useBack, useSlideNavigate } from '../../app/transition'
import { useT, useTp } from '../../i18n'
import { deleteProfile } from '../../lib/hermes/profile-delete'
import { Avatar } from '../../ui/Avatar'
import { DangerConfirmSheet } from '../../ui/DangerConfirmSheet'
import { EmptyState } from '../../ui/EmptyState'
import { PageShell } from '../../ui/PageShell'
import { Row, Section } from '../../ui/Section'
import { Sheet } from '../../ui/Sheet'
import { Skeleton } from '../../ui/Skeleton'
import { StatusDot, type DotTone } from '../../ui/StatusDot'
import { Toggle } from '../../ui/Toggle'
import { ensureAppearances, useBotAppearance } from '../bots/appearance-store'
import { computerDetail, computerRowStatus, loadComputer } from '../computer/store'
import {
  activeProfile,
  featuredBotName,
  homeLoading,
  homeProfiles,
  loadHome,
  setFeaturedBot,
} from '../home/store'
import { loadPrefs, pushPrefs, pushSetup, savePrefsForProfile, defaultPrefs } from '../push/store'
import {
  botDisplayName,
  loadProfileStats,
  profileStatsLoading,
  routinesCount,
  workersCount,
} from './store'
import './bot-profile.css'

/**
 * Bot profile (GrokBot screen 6): halo hero + Edit, and one grouped
 * section of icon-tile rows — Approvals, Computer (live
 * `display.status` dot), Connections, Vault, Tools, Routines,
 * Library, Working and the Notifications toggle — plus the
 * bottom "Delete bot" danger row.
 */
export function BotProfilePage() {
  const { profile = 'default' } = useParams()
  const back = useBack('/')
  const { forward, navigate } = useSlideNavigate()
  const rows = useStore(homeProfiles)
  const rosterLoading = useStore(homeLoading)
  const statsLoading = useStore(profileStatsLoading)
  const workers = useStore(workersCount)
  const routines = useStore(routinesCount)
  const computer = useStore(computerDetail)
  const active = useStore(activeProfile)
  const appearance = useBotAppearance(profile)
  const [notifOpen, setNotifOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const allPrefs = useStore(pushPrefs)
  const prefs = { ...defaultPrefs(), ...(allPrefs[profile] ?? {}) }
  const deviceSetup = useStore(pushSetup)
  const t = useT()
  const tp = useTp()

  useEffect(() => {
    ensureAppearances()
    void loadProfileStats(profile)
    void loadComputer(profile)
  }, [profile])

  useEffect(() => {
    if (notifOpen) void loadPrefs()
  }, [notifOpen])

  const row = rows.find(r => r.name === profile)
  const displayName = botDisplayName(row, profile)
  const model = row?.model ?? null
  const description = row?.description ?? ''

  const workersLabel = workers === null ? '—' : tp('bots.workers', workers)
  const routinesLabel = routines === null ? '—' : tp('bots.routinesActive', routines)
  const computerState = computerRowStatus(computer)
  const computerTone: DotTone = computerState === 'active' ? 'ok' : computerState === 'not-installed' ? 'warn' : 'neutral'
  const computerLabel =
    computerState === 'active' ? t('computer.active') : computerState === 'inactive' ? t('computer.inactive') : computerState === 'not-installed' ? t('computer.notInstalled') : '—'

  const isDefault = Boolean(row?.is_default)
  const isActive = active === profile
  const deleteBlocked = isDefault || isActive
  const deleteSubtitle = isDefault
    ? t('bots.deleteDefault')
    : isActive
      ? t('bots.deleteActive')
      : t('bots.deleteOther')

  const enc = encodeURIComponent(profile)

  const doDelete = async (): Promise<void> => {
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteProfile(profile)
      // A settlement-pending answer still means the directory is gone: success.
      if (featuredBotName() === profile) setFeaturedBot(null)
      setDeleteOpen(false)
      await loadHome()
      navigate('/', { replace: true })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t('bots.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <PageShell title={displayName} onBack={back}>
      {rosterLoading && !row ? (
        <div className="bp-hero">
          <Skeleton variant="circle" width={112} height={112} />
          <Skeleton width={180} />
          <Skeleton width={240} />
        </div>
      ) : !row ? (
        <EmptyState title={t('bots.notFound')} />
      ) : (
        <>
          <div className="bp-hero">
            <Avatar name={profile} size="xl" appearance={appearance} />
            <span className="bp-name">{displayName}</span>
            <span className="bp-sub">{model || description || t('bots.fallback')}</span>
            <button
              type="button"
              className="btn btn-tonal bp-edit"
              onClick={() => forward(`/bots/${enc}/edit`)}
            >
              {t('common.edit')}
            </button>
          </div>

          <Section>
            <Row
              icon="brain"
              tint="accent"
              title={t('bots.brain')}
              subtitle={t('bots.brainSubtitle')}
              chevron
              onClick={() => forward(`/bots/${enc}/brain`)}
            />
            <Row
              icon="check"
              tint="accent"
              title={t('bots.approvals')}
              subtitle={t('bots.approvalsSubtitle')}
              chevron
              onClick={() => forward(`/bots/${enc}/approvals`)}
            />
            <Row
              icon="folder"
              tint="accent"
              title={t('bots.skills')}
              subtitle={t('bots.skillsSubtitle')}
              chevron
              onClick={() => forward(`/bots/${enc}/skills`)}
            />
            <Row
              icon="note"
              tint="accent"
              title={t('bots.memory')}
              subtitle={t('bots.memorySubtitle')}
              chevron
              onClick={() => forward(`/bots/${enc}/memory`)}
            />
            <Row
              icon="monitor"
              tint="accent"
              title={t('bots.computer')}
              subtitle={<StatusDot tone={computerTone} label={computerLabel} />}
              chevron
              onClick={() => forward(`/bots/${enc}/computer`)}
            />
            <Row
              icon="grid"
              tint="accent"
              title={t('bots.connections')}
              subtitle={t('bots.connectionsSubtitle')}
              chevron
              onClick={() => forward(`/bots/${enc}/connectors`)}
            />
            <Row
              icon="folder"
              tint="accent"
              title={t('bots.vault')}
              subtitle={t('bots.vaultSubtitle')}
              chevron
              onClick={() => forward(`/bots/${enc}/vault`)}
            />
            <Row
              icon="keyboard"
              tint="accent"
              title={t('bots.tools')}
              subtitle={t('bots.toolsSubtitle')}
              chevron
              onClick={() => forward(`/bots/${enc}/tools`)}
            />
            <Row
              icon="calendar"
              tint="accent"
              title={t('bots.routines')}
              value={routinesLabel}
              chevron
              onClick={() => forward(`/bots/${enc}/routines`)}
            />
            <Row
              icon="folder"
              tint="accent"
              title={t('bots.library')}
              chevron
              onClick={() => forward(`/bots/${enc}/library`)}
            />
            {statsLoading ? (
              <div style={{ padding: 'var(--space-4)' }}>
                <Skeleton height={52} />
                <Skeleton height={52} />
              </div>
            ) : (
              <Row
                icon="bolt"
                tint="accent"
                title={t('bots.working')}
                value={workersLabel}
                chevron
                onClick={() => forward(`/bots/${enc}/working`)}
              />
            )}
            <Row
              icon="bell"
              tint="accent"
              title={t('bots.notifications')}
              subtitle={t('bots.notificationsSubtitle')}
              trailing={<Toggle checked={prefs.termina} onChange={() => setNotifOpen(true)} label={t('bots.notifications')} />}
            />
          </Section>

          <Section footer={t('bots.deleteFooter')}>
            <Row
              icon="trash"
              tint="danger"
              title={t('bots.delete')}
              subtitle={deleteSubtitle}
              disabled={deleteBlocked}
              onClick={() => setDeleteOpen(true)}
            />
          </Section>
        </>
      )}

      <Sheet open={notifOpen} onClose={() => setNotifOpen(false)} title={t('bots.notifications')}>
        {deviceSetup?.state === 'no-plugin' ? (
          <p className="muted">
            {t('bots.notifNoPlugin')}
          </p>
        ) : (
          <>
            <Row
              icon="check"
              tint="accent"
              title={t('bots.notifWhenDone')}
              subtitle={t('bots.notifWhenDoneSub')}
              trailing={
                <Toggle
                  checked={prefs.termina}
                  onChange={next => void savePrefsForProfile(profile, { termina: next }).catch(() => undefined)}
                  label={t('bots.notifWhenDone')}
                />
              }
            />
            <Row
              icon="bolt"
              tint="accent"
              title={t('bots.notifWhenNeeded')}
              subtitle={t('bots.notifWhenNeededSub')}
              trailing={
                <Toggle
                  checked={prefs.necesita}
                  onChange={next => void savePrefsForProfile(profile, { necesita: next }).catch(() => undefined)}
                  label={t('bots.notifWhenNeeded')}
                />
              }
            />
            <p className="faint" style={{ padding: '0 var(--space-4) var(--space-4)' }}>
              {t('bots.notifFootnote')}
            </p>
          </>
        )}
      </Sheet>

      {deleteOpen && (
        <DangerConfirmSheet
          onClose={() => setDeleteOpen(false)}
          title={t('bots.delete')}
          nameToType={profile}
          body={t('bots.deleteBody', { name: displayName })}
          confirmLabel={t('bots.delete')}
          busy={deleting}
          error={deleteError}
          onConfirm={() => void doDelete()}
        />
      )}
    </PageShell>
  )
}
