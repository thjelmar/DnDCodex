import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Icon } from './Icon'

// The player-side tab bar, the counterpart to the DM's CampaignNav. Players have
// fewer destinations, so only Home and Story stay flat and the DM-shared media
// collapses under "Shared". Reuses the .subnav / .navgroup / .navmenu styles.

interface NavItem {
  to: string
  label: string
  end?: boolean
}
interface NavGroup {
  label: string
  items: NavItem[]
}
type NavEntry = NavItem | NavGroup

const isGroup = (e: NavEntry): e is NavGroup => 'items' in e

export function PlayerNav({ campaignId }: { campaignId: string }) {
  const base = `/player/${campaignId}`
  const path = useLocation().pathname
  const sub = path.startsWith(base) ? path.slice(base.length).replace(/^\/+/, '') : ''

  const NAV: NavEntry[] = [
    { to: base, label: 'Home', end: true },
    { to: `${base}/story`, label: 'Story so far' },
    {
      label: 'Shared',
      items: [
        { to: `${base}/handouts`, label: 'Handouts' },
        { to: `${base}/gallery`, label: 'Gallery' },
        { to: `${base}/worldmap`, label: 'World map' },
        { to: `${base}/loot`, label: 'Party loot' },
      ],
    },
  ]

  const [open, setOpen] = useState<string | null>(null)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => setOpen(null), [sub])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="subnav" ref={navRef}>
      {NAV.map((entry) =>
        isGroup(entry) ? (
          <div
            key={entry.label}
            className="navgroup"
            onMouseEnter={() => setOpen(entry.label)}
            onMouseLeave={() => setOpen((o) => (o === entry.label ? null : o))}
          >
            <button
              type="button"
              className={`navgroup-btn${
                entry.items.some((i) => path.startsWith(i.to)) ? ' active' : ''
              }${open === entry.label ? ' open' : ''}`}
              aria-haspopup="true"
              aria-expanded={open === entry.label}
              onClick={() => setOpen((o) => (o === entry.label ? null : entry.label))}
            >
              {entry.label}
              <Icon name="chevron-down" size={13} />
            </button>
            {open === entry.label && (
              <div className="navmenu" role="menu">
                {entry.items.map((i) => (
                  <NavLink key={i.to} to={i.to} role="menuitem" className={({ isActive }) => (isActive ? 'active' : '')}>
                    {i.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ) : (
          <NavLink
            key={entry.to}
            to={entry.to}
            end={entry.end}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {entry.label}
          </NavLink>
        ),
      )}
    </div>
  )
}
