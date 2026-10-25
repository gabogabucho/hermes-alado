import { useEffect, type ReactNode } from 'react'
import { useStore } from '@nanostores/react'
import { useBack, useSlideNavigate } from '../../app/transition'
import { Avatar } from '../../ui/Avatar'
import { Icon } from '../../ui/Icon'
import { PageShell } from '../../ui/PageShell'
import { ensureAppearances, useBotAppearance } from '../bots/appearance-store'
import { homeProfiles } from '../home/store'
import { botDisplayName } from './store'
import './bot-scoped.css'

/**
 * Frame for every per-bot configuration screen (Aprobaciones, Herramientas,
 * Conexiones, Bóveda): the page header keeps the screen name while a bot bar
 * right under it shows WHICH bot is being edited (avatar + name), tappable to
 * open the bot's profile. All the store calls on these screens take the route
 * `:profile` explicitly — never the server's active profile.
 */
export function BotScopedScreen({
  profile,
  title,
  actions,
  children,
}: {
  profile: string
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  const { forward } = useSlideNavigate()
  const back = useBack(`/bots/${encodeURIComponent(profile)}`)
  const rows = useStore(homeProfiles)
  const appearance = useBotAppearance(profile)
  const row = rows.find(r => r.name === profile)
  const displayName = botDisplayName(row, profile)

  useEffect(() => {
    ensureAppearances()
  }, [])

  return (
    <PageShell title={title} onBack={back} actions={actions}>
      <button
        type="button"
        className="bsc-bar"
        onClick={() => forward(`/bots/${encodeURIComponent(profile)}`)}
      >
        <Avatar name={profile} size="sm" appearance={appearance} />
        <span className="bsc-meta">
          <span className="bsc-name">{displayName}</span>
          <span className="bsc-sub">Perfil del bot</span>
        </span>
        <Icon name="chevron-right" size={18} className="bsc-chevron" />
      </button>
      {children}
    </PageShell>
  )
}
