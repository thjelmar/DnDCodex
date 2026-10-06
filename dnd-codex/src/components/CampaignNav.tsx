import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useParams } from 'react-router-dom'
import { Icon } from './Icon'

// The campaign tab bar. There are too many destinations to lay flat, so the
// narrative spine (Overview / Sessions / Timeline) stays as plain tabs and the
// rest collapse into a few labelled dropdown groups. A group's label stays
// highlighted while you're on one of its pages, so you never lose your place.

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

const NAV: NavEntry[] = [
  { to: '', label: 'Overview', end: true },
  { to: 'sessions', label: 'Sessions' },
  { to: 'timeline', label: 'Timeline' },
  {
    label: 'Codex',
    items: [
      { to: 'notes', label: 'World' },
      { to: 'npcs', label: 'NPCs' },
      { to: 'locations', label: 'Locations' },
      { to: 'items', label: 'Items' },
      { to: 'tables', label: 'Tables' },
      { to: 'tags', label: 'Tags' },
    ],
  },
  {
    label: 'Maps',
    items: [
      { to: 'map', label: 'Map' },
      { to: 'worldmap', label: 'World Map' },
      { to: 'battlemap', label: 'Battle Map' },
    ],
  },
  {
    label: 'Players',
    items: [
      { to: 'gallery', label: 'Gallery' },
      { to: 'handouts', label: 'Handouts' },
      { to: 'loot', label: 'Loot' },
    ],
  },
]

export function CampaignNav() {
  const { campaignId } = useParams()
  const path = useLocation().pathname
  // The active sub-route is the single segment after the campaign base, so
  // '' is Overview and 'worldmap' is the World Map tab.
  const base = `/campaign/${campaignId}`
  const sub = path.startsWith(base) ? path.slice(base.length).replace(/^\/+/, '') : ''

  const [open, setOpen] = useState<string | null>(null)
  const navRef = useRef<HTMLDivElement>(null)

  // Close the menu on route change, outside click, or Escape.
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
              className={`navgroup-btn${entry.items.some((i) => i.to === sub) ? ' active' : ''}${
                open === entry.label ? ' open' : ''
              }`}
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
                  <NavLink
                    key={i.to}
                    to={i.to}
                    role="menuitem"
                    className={({ isActive }) => (isActive ? 'active' : '')}
                  >
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
