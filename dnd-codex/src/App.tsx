import { useEffect, useState, lazy, Suspense, Component, type ReactNode, type ErrorInfo } from 'react'
import { HashRouter, Routes, Route, NavLink, Link, Navigate, useParams, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import { SearchPalette } from './components/SearchPalette'
import { DiceRoller } from './components/DiceRoller'
import { ConfirmProvider } from './components/ConfirmDialog'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { SyncProvider } from './auth/SyncProvider'
import { AccountArea } from './auth/AccountArea'
import { Icon } from './components/Icon'
import { NotificationBell } from './components/NotificationBell'
import { JoinCampaignModal } from './auth/JoinCampaignModal'
import { AddPlayerCampaignModal } from './components/AddPlayerCampaignModal'
import { PreferencesModal } from './components/PreferencesModal'
import { BugReportModal } from './components/BugReportModal'
import { installErrorLog, logBoundaryError } from './lib/errorLog'
import { PENDING_JOIN_KEY } from './lib/prefs'
import { HomePage } from './pages/HomePage'
import { DemoBanner, DemoBlockedToast } from './components/DemoChrome'
import { isDemo } from './lib/demo'
import type { Campaign } from './db/types'
import { useChangelogUnseen } from './lib/useChangelog'

// Route pages are code-split: each loads on first navigation, keeping the
// initial bundle (landing + app shell) small. The heavy deps (TipTap, the
// battle-map renderer, the bundled SRD monsters) ride along with the routes
// that use them instead of the first paint. Landing (HomePage) stays eager.
// Named exports are mapped to the default export React.lazy expects.
const CampaignsPage = lazy(() => import('./pages/CampaignsPage').then((m) => ({ default: m.CampaignsPage })))
const BackupPage = lazy(() => import('./pages/BackupPage').then((m) => ({ default: m.BackupPage })))
const TemplatesPage = lazy(() => import('./pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })))
const ChangelogPage = lazy(() => import('./pages/ChangelogPage').then((m) => ({ default: m.ChangelogPage })))
const CampaignLayout = lazy(() => import('./pages/CampaignLayout').then((m) => ({ default: m.CampaignLayout })))
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const SessionsPage = lazy(() => import('./pages/SessionsPage').then((m) => ({ default: m.SessionsPage })))
const TimelinePage = lazy(() => import('./pages/TimelinePage').then((m) => ({ default: m.TimelinePage })))
const NpcsPage = lazy(() => import('./pages/NpcsPage').then((m) => ({ default: m.NpcsPage })))
const FamiliesPage = lazy(() => import('./pages/FamiliesPage').then((m) => ({ default: m.FamiliesPage })))
const LocationsPage = lazy(() => import('./pages/LocationsPage').then((m) => ({ default: m.LocationsPage })))
const ItemsPage = lazy(() => import('./pages/ItemsPage').then((m) => ({ default: m.ItemsPage })))
const NotesPage = lazy(() => import('./pages/NotesPage').then((m) => ({ default: m.NotesPage })))
const RollTablesPage = lazy(() => import('./pages/RollTablesPage').then((m) => ({ default: m.RollTablesPage })))
const EncountersPage = lazy(() => import('./pages/EncountersPage').then((m) => ({ default: m.EncountersPage })))
const GeneratorTablesPage = lazy(() => import('./pages/GeneratorTablesPage').then((m) => ({ default: m.GeneratorTablesPage })))
const CombatTrackerPage = lazy(() => import('./pages/CombatTrackerPage').then((m) => ({ default: m.CombatTrackerPage })))
const RunPage = lazy(() => import('./pages/RunPage').then((m) => ({ default: m.RunPage })))
const GalleryPage = lazy(() => import('./pages/GalleryPage').then((m) => ({ default: m.GalleryPage })))
const HandoutsPage = lazy(() => import('./pages/HandoutsPage').then((m) => ({ default: m.HandoutsPage })))
const LootPage = lazy(() => import('./pages/LootPage').then((m) => ({ default: m.LootPage })))
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })))
const WorldMapPage = lazy(() => import('./pages/WorldMapPage').then((m) => ({ default: m.WorldMapPage })))
const BattleMapPage = lazy(() => import('./pages/BattleMapPage').then((m) => ({ default: m.BattleMapPage })))
const TagsPage = lazy(() => import('./pages/TagsPage').then((m) => ({ default: m.TagsPage })))
const PlayerNotesPage = lazy(() => import('./pages/PlayerNotesPage').then((m) => ({ default: m.PlayerNotesPage })))
const PlayerStoryPage = lazy(() => import('./pages/PlayerStoryPage').then((m) => ({ default: m.PlayerStoryPage })))
const PlayerLootPage = lazy(() => import('./pages/PlayerLootPage').then((m) => ({ default: m.PlayerLootPage })))
const PlayerGalleryPage = lazy(() => import('./pages/PlayerGalleryPage').then((m) => ({ default: m.PlayerGalleryPage })))
const PlayerWorldMapPage = lazy(() => import('./pages/PlayerWorldMapPage').then((m) => ({ default: m.PlayerWorldMapPage })))
const PlayerHandoutsPage = lazy(() => import('./pages/PlayerHandoutsPage').then((m) => ({ default: m.PlayerHandoutsPage })))
const PlayerSessionPage = lazy(() => import('./pages/PlayerSessionPage').then((m) => ({ default: m.PlayerSessionPage })))
const TicketsPage = lazy(() => import('./pages/TicketsPage').then((m) => ({ default: m.TicketsPage })))
const RoadmapPage = lazy(() => import('./pages/RoadmapPage').then((m) => ({ default: m.RoadmapPage })))
const JoinLandingPage = lazy(() => import('./pages/JoinLandingPage').then((m) => ({ default: m.JoinLandingPage })))

// Start capturing client errors as early as possible so a bug report includes
// whatever went wrong before the user opened the reporter.
installErrorLog()

// Shown while a code-split route chunk loads (usually a blink on first visit).
function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span className="route-spinner" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

// Catches a failed route render — most importantly a dynamic-import failure,
// which happens when the app is deployed while someone has an old tab open and
// the hashed chunk they request no longer exists. A reload fetches the fresh
// build and recovers; anything else shows a manual reload so the app never
// dead-ends.
//
// Browsers word a failed chunk import differently, so match loosely: Chrome says
// "Failed to fetch dynamically imported module", Firefox "error loading
// dynamically imported module", and Safari throws "Importing a module script
// failed." or a bare "TypeError: Load failed". The old matcher missed Safari's
// wording, so Safari users never auto-recovered — they saw the fallback on every
// post-deploy load and had to reload by hand.
function isChunkLoadError(msg: string): boolean {
  return /dynamic(ally)? import|imported module|module script|loading chunk|chunkloaderror|failed to fetch|load failed/i.test(
    msg,
  )
}

// We reload at most once per short window, keyed on a timestamp rather than a
// one-shot flag. The old flag was set on the first reload and never cleared, so
// after a single recovery every later stale-chunk error in the same tab fell
// through to the manual notice. A timestamp ages out on its own: each genuine
// deploy gets a fresh auto-reload, while a chunk that's persistently broken (or
// a real render bug that rethrows at once) can't loop — the second failure lands
// inside the window and shows the manual prompt instead.
const CHUNK_RELOAD_AT = 'codex.chunkReloadAt'
const RELOAD_DEBOUNCE_MS = 10_000
class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown, info: ErrorInfo) {
    // React swallows a caught error in production, so record it here or a bug
    // report filed from the fallback carries no trace of what threw.
    console.error('Route render failed:', err)
    logBoundaryError(err, info?.componentStack)

    if (!isChunkLoadError(String((err as Error)?.message || err))) return
    let last = 0
    try { last = Number(sessionStorage.getItem(CHUNK_RELOAD_AT)) || 0 } catch { /* storage blocked */ }
    if (Date.now() - last < RELOAD_DEBOUNCE_MS) return // just reloaded; don't loop
    try { sessionStorage.setItem(CHUNK_RELOAD_AT, String(Date.now())) } catch { /* storage blocked */ }
    window.location.reload()
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="route-fallback route-error">
          <p>Something went wrong loading this page.</p>
          <button className="btn primary small" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

const ellipsis: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/** Remember a sidebar section's open/closed state per browser. */
function useNavCollapsed(key: string, defaultOpen: boolean) {
  const storageKey = `codex.nav.${key}`
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey)
      return v == null ? defaultOpen : v === '1'
    } catch {
      return defaultOpen
    }
  })
  const toggle = () =>
    setOpen((o) => {
      const next = !o
      try {
        localStorage.setItem(storageKey, next ? '1' : '0')
      } catch {
        /* private mode / blocked storage — state just won't persist */
      }
      return next
    })
  return [open, toggle] as const
}

/** A collapsible sidebar section with a heading toggle and a rotating caret. */
function SidebarSection({
  label,
  sectionKey,
  defaultOpen = true,
  children,
}: {
  label: string
  sectionKey: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, toggle] = useNavCollapsed(sectionKey, defaultOpen)
  return (
    <>
      <button className="sidebar-heading sidebar-heading-btn" onClick={toggle} aria-expanded={open}>
        <span>{label}</span>
        <Icon name="chevron-right" size={12} color="currentColor" className={`sidebar-caret${open ? ' open' : ''}`} />
      </button>
      {open && children}
    </>
  )
}

function Sidebar({
  collapsed,
  onToggleCollapse,
  onOpenSearch,
  onOpenDice,
  onAddPlayerCampaign,
  onOpenPrefs,
  onOpenBug,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  onOpenSearch: () => void
  onOpenDice: () => void
  onAddPlayerCampaign: () => void
  onOpenPrefs: () => void
  onOpenBug: () => void
}) {
  const { user } = useAuth()
  const changelogUnseen = useChangelogUnseen()
  // Only the maintainer sees the Tickets queue link (the queue itself is
  // server-protected; this just hides the nav entry). Owner = the signed-in
  // account whose email matches VITE_OWNER_EMAIL; unset hides it for everyone.
  const ownerEmail = (import.meta.env.VITE_OWNER_EMAIL as string | undefined)?.trim().toLowerCase()
  const isOwner = !!user?.email && !!ownerEmail && user.email.toLowerCase() === ownerEmail
  // Most-recently-updated DM campaigns for quick access under the DM section.
  const recent = useLiveQuery(
    () =>
      db.campaigns
        .orderBy('updatedAt')
        .reverse()
        .filter((c) => !c.archived && c.role !== 'player')
        .limit(6)
        .toArray(),
    [],
  )

  return (
    <nav className="sidebar">
      <div className="brand">
        <span className="glyph">⚔️</span>
        <span>D&amp;D Codex</span>
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Dock sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Dock sidebar' : 'Collapse sidebar'}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} color="currentColor" />
        </button>
      </div>

      {/* Search: a pill with a darker fill; the shortcut hint shows on hover. */}
      <button className="sidebar-search" onClick={onOpenSearch} aria-label="Search">
        <span className="ico"><Icon name="search" /></span>
        <span>Search</span>
        <span className="sidebar-search-kbd" aria-hidden>
          <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
          <kbd>K</kbd>
        </span>
      </button>

      {/* App: settings, updates, roadmap, (owner-only) tickets, and report — a
          compact icon row; each has a tooltip + label for screen readers. */}
      <div className="sidebar-icons" role="group" aria-label="App">
        <NotificationBell />
        <button className="icon-btn" onClick={onOpenPrefs} data-tip="Preferences" aria-label="Preferences">
          <Icon name="settings" />
        </button>
        <NavLink to="/changelog" className={({ isActive }) => `icon-btn${isActive ? ' active' : ''}`} data-tip="What’s New" aria-label="What’s New">
          <Icon name="sparkles" />
          {changelogUnseen && <span className="nav-dot" aria-label="new updates" />}
        </NavLink>
        <NavLink to="/roadmap" className={({ isActive }) => `icon-btn${isActive ? ' active' : ''}`} data-tip="Roadmap" aria-label="Roadmap">
          <Icon name="map" />
        </NavLink>
        {isOwner && (
          <NavLink to="/tickets" className={({ isActive }) => `icon-btn${isActive ? ' active' : ''}`} data-tip="Tickets" aria-label="Tickets">
            <Icon name="inbox" />
          </NavLink>
        )}
        <button className="icon-btn" onClick={onOpenBug} data-tip="Report something" aria-label="Report something">
          <Icon name="bug" />
        </button>
      </div>

      <NavLink to="/" end className="nav-link" style={{ marginBottom: 2 }}>
        <span className="ico"><Icon name="home" /></span> Home
      </NavLink>

      {/* DM: campaign creation & management */}
      <SidebarSection label="DM" sectionKey="dm">
        <CampaignsMenu recent={recent} />
        <ToolsMenu onOpenDice={onOpenDice} />
      </SidebarSection>

      {/* Player: campaigns you're playing in, each a notes home */}
      <SidebarSection label="Player" sectionKey="player">
        <PlayerNotesNav onAddPlayerCampaign={onAddPlayerCampaign} />
      </SidebarSection>

      <div className="sidebar-spacer" />
      <AccountArea />
      <div className="faint" style={{ fontSize: 11, padding: '0 8px' }}>
        Stored locally in your browser.
      </div>
    </nav>
  )
}

/** Collapsible DM "Campaigns" sub-menu: the all-campaigns page, new-campaign,
 *  and quick links to recent campaigns — tucked away so the nav stays tidy now
 *  that the Home page is the main launch point. Collapsed + remembered. */
function CampaignsMenu({ recent }: { recent: Campaign[] | undefined }) {
  const [open, toggle] = useNavCollapsed('campaigns', false)
  return (
    <>
      <button
        className="nav-link"
        onClick={toggle}
        aria-expanded={open}
        style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
      >
        <span className="ico"><Icon name="book" /></span>
        <span>Campaigns</span>
        <Icon name="chevron-right" size={13} color="currentColor" className={`sidebar-caret${open ? ' open' : ''}`} />
      </button>
      {open && (
        <>
          <NavLink to="/campaigns" end className="nav-link" style={{ paddingLeft: 22, fontSize: 13.5 }}>
            <span className="ico"><Icon name="book" size={15} /></span> All campaigns
          </NavLink>
          <Link to="/campaigns?new=1" className="nav-link" style={{ paddingLeft: 22, fontSize: 13.5 }}>
            <span className="ico"><Icon name="plus" size={15} /></span> New campaign
          </Link>
          {recent?.map((c) => (
            <NavLink key={c.id} to={`/campaign/${c.id}`} className="nav-link" style={{ paddingLeft: 22, fontSize: 13.5 }}>
              <span className="ico" style={{ color: c.color }} aria-hidden>●</span>
              <span style={ellipsis}>{c.name}</span>
            </NavLink>
          ))}
        </>
      )}
    </>
  )
}

/** Collapsible DM "Tools" sub-menu: campaign-independent utilities.
 *  Collapsed by default (remembered per browser); the chevron signals it opens. */
function ToolsMenu({ onOpenDice }: { onOpenDice: () => void }) {
  const [open, toggle] = useNavCollapsed('tools', false)
  return (
    <>
      <button
        className="nav-link"
        onClick={toggle}
        aria-expanded={open}
        style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
      >
        <span className="ico"><Icon name="tools" /></span>
        <span>Tools</span>
        <Icon name="chevron-right" size={13} color="currentColor" className={`sidebar-caret${open ? ' open' : ''}`} />
      </button>
      {open && (
        <>
          <button className="nav-link" style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', paddingLeft: 22, fontSize: 13.5 }} onClick={onOpenDice}>
            <span className="ico"><Icon name="dice" size={15} /></span> Dice Roller
          </button>
          <NavLink to="/tools/generators" className="nav-link" style={{ paddingLeft: 22, fontSize: 13.5 }}>
            <span className="ico"><Icon name="sparkles" size={15} /></span> Generators
          </NavLink>
          <NavLink to="/tools/templates" className="nav-link" style={{ paddingLeft: 22, fontSize: 13.5 }}>
            <span className="ico"><Icon name="copy" size={15} /></span> Templates
          </NavLink>
          <NavLink to="/tools/encounters" className="nav-link" style={{ paddingLeft: 22, fontSize: 13.5 }}>
            <span className="ico"><Icon name="tools" size={15} /></span> Encounter Builder
          </NavLink>
          <NavLink to="/tools/combat" className="nav-link" style={{ paddingLeft: 22, fontSize: 13.5 }}>
            <span className="ico"><Icon name="swords" size={15} /></span> Combat Tracker
          </NavLink>
        </>
      )}
    </>
  )
}

/** Lists the campaigns the player is playing in, plus add/join actions. */
function PlayerNotesNav({ onAddPlayerCampaign }: { onAddPlayerCampaign: () => void }) {
  const { user } = useAuth()
  const [joinOpen, setJoinOpen] = useState(false)
  const [open, toggle] = useNavCollapsed('playerCampaigns', false)
  const campaigns = useLiveQuery(
    () => db.campaigns.orderBy('name').filter((c) => !c.archived && c.role === 'player').toArray(),
    [],
  )
  const hasCampaigns = !!campaigns && campaigns.length > 0

  return (
    <>
      {hasCampaigns && (
        <>
          <button
            className="nav-link"
            onClick={toggle}
            aria-expanded={open}
            style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
          >
            <span className="ico"><Icon name="book" /></span>
            <span>Campaigns</span>
            <Icon name="chevron-right" size={13} color="currentColor" className={`sidebar-caret${open ? ' open' : ''}`} />
          </button>
          {open && campaigns!.map((c) => (
            <NavLink
              key={c.id}
              to={`/player/${c.id}`}
              className="nav-link"
              style={{ paddingLeft: 22, fontSize: 13.5 }}
            >
              <span className="ico" style={{ color: c.color }} aria-hidden>
                ●
              </span>
              <span style={ellipsis}>{c.name}</span>
            </NavLink>
          ))}
        </>
      )}
      <button
        className="nav-link"
        style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', color: 'var(--text-dim)' }}
        onClick={onAddPlayerCampaign}
      >
        <span className="ico"><Icon name="plus" /></span> Add a campaign
      </button>
      {user && (
        <button
          className="nav-link"
          style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', color: 'var(--text-dim)' }}
          onClick={() => setJoinOpen(true)}
        >
          <span className="ico"><Icon name="key" /></span> Join a campaign
        </button>
      )}
      {joinOpen && <JoinCampaignModal onClose={() => setJoinOpen(false)} />}
    </>
  )
}

/** Closes the mobile nav drawer whenever the route changes (e.g. a nav link is
 *  tapped), so the drawer never lingers over the page you just navigated to. */
function NavAutoClose({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation()
  useEffect(() => {
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
  return null
}

// After signing in from a shared invite link, the OAuth round-trip drops the
// user back at the app root (the hash route is lost). If we stashed a pending
// invite code before redirecting, send them back to the join page — now signed
// in — to confirm and join. Runs eagerly (not inside a lazy route) so it catches
// the return regardless of where they land.
function PendingJoinResume() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => {
    if (!user) return
    let code: string | null = null
    try {
      code = localStorage.getItem(PENDING_JOIN_KEY)
    } catch {
      /* storage blocked */
    }
    if (!code) return
    // Already on the right join page (e.g. signed in without a redirect)? Leave it.
    if (pathname === `/join/${code}`) return
    navigate(`/join/${code}`)
  }, [user, pathname, navigate])
  return null
}

export function App() {
  const demo = isDemo()
  const [searchOpen, setSearchOpen] = useState(false)
  const [diceOpen, setDiceOpen] = useState(false)
  // On narrow screens the sidebar becomes an off-canvas drawer; this tracks
  // whether it's slid in. It has no effect on desktop (the hamburger that sets
  // it is hidden there, and the sidebar stays docked).
  const [navOpen, setNavOpen] = useState(false)

  // Desktop: the sidebar can collapse to reclaim page width, with a left-edge
  // handle to click-expand or hover-peek. Persisted per browser. On mobile the
  // off-canvas drawer already serves this purpose, so the flag is inert there.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('codex.sidebar.collapsed') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('codex.sidebar.collapsed', collapsed ? '1' : '0')
    } catch {
      /* private mode — the collapse state just won't persist; harmless */
    }
  }, [collapsed])

  // Global shortcuts: Cmd/Ctrl+K search, Cmd/Ctrl+E dice roller, Cmd/Ctrl+G
  // generators, and Escape to close the mobile nav drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setDiceOpen((o) => !o)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        window.location.hash = '#/tools/generators'
      } else if (e.key === 'Escape') {
        setNavOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Lock background scroll while the mobile drawer is open.
  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen)
    return () => document.body.classList.remove('nav-open')
  }, [navOpen])

  const [addPlayerOpen, setAddPlayerOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [bugOpen, setBugOpen] = useState(false)
  // Opening a modal/panel from the sidebar should also dismiss the drawer so the
  // modal isn't hidden behind it on mobile.
  const closeNav = () => setNavOpen(false)
  const withClose = (fn: () => void) => () => {
    fn()
    closeNav()
  }

  return (
    <AuthProvider>
    <SyncProvider>
    <HashRouter>
      <ConfirmProvider>
        <NavAutoClose onClose={closeNav} />
        <PendingJoinResume />
        <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
        <DiceRoller open={diceOpen} onClose={() => setDiceOpen(false)} />
        <AddPlayerCampaignModal open={addPlayerOpen} onClose={() => setAddPlayerOpen(false)} />
        {prefsOpen && <PreferencesModal onClose={() => setPrefsOpen(false)} />}
        {bugOpen && <BugReportModal onClose={() => setBugOpen(false)} />}
        {demo && <DemoBanner />}
        {demo && <DemoBlockedToast />}
        <div
          className="app"
          data-nav-open={navOpen ? 'true' : undefined}
          data-demo={demo ? 'true' : undefined}
          data-collapsed={collapsed ? 'true' : undefined}
        >
          {/* Mobile-only top bar: a hamburger to reveal the nav drawer, the
              brand (tap to go home), and a quick search. Hidden on desktop. */}
          <header className="topbar">
            <button
              className="topbar-burger"
              onClick={() => setNavOpen((o) => !o)}
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={navOpen}
            >
              <Icon name={navOpen ? 'x' : 'menu'} color="currentColor" />
            </button>
            <Link to="/" className="topbar-brand" onClick={closeNav}>
              <span className="glyph" aria-hidden>⚔️</span>
              <span>D&amp;D Codex</span>
            </Link>
            <button className="topbar-icon" onClick={withClose(() => setSearchOpen(true))} aria-label="Search">
              <Icon name="search" color="currentColor" />
            </button>
          </header>
          {/* Collapsed-sidebar edge handle (desktop only): click to re-dock,
              hover to peek the sidebar as an overlay. Hidden unless collapsed. */}
          <button
            className="sidebar-edge"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <Icon name="chevron-right" size={14} color="currentColor" />
          </button>
          <Sidebar
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
            onOpenSearch={withClose(() => setSearchOpen(true))}
            onOpenDice={withClose(() => setDiceOpen(true))}
            onAddPlayerCampaign={withClose(() => setAddPlayerOpen(true))}
            onOpenPrefs={withClose(() => setPrefsOpen(true))}
            onOpenBug={withClose(() => setBugOpen(true))}
          />
          <div className="nav-scrim" onClick={closeNav} aria-hidden />
        <main className="main">
          <RouteBoundary>
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/bug-reports" element={<Navigate to="/tickets" replace />} />
            <Route path="/roadmap" element={<RoadmapPage onReport={() => setBugOpen(true)} />} />
            <Route path="/join/:code" element={<JoinLandingPage />} />
            <Route path="/tools/encounters" element={<EncountersPage />} />
            <Route path="/tools/generators" element={<GeneratorTablesPage />} />
            <Route path="/tools/templates" element={<TemplatesPage />} />
            <Route path="/tools/combat" element={<CombatTrackerPage />} />
            <Route path="/run/:campaignId" element={<RunPage />} />
            <Route path="/player/:campaignId" element={<PlayerNotesPage />} />
            <Route path="/player/:campaignId/story" element={<PlayerStoryPage />} />
            <Route path="/player/:campaignId/session" element={<PlayerSessionPage />} />
            <Route path="/player/:campaignId/handouts" element={<PlayerHandoutsPage />} />
            <Route path="/player/:campaignId/gallery" element={<PlayerGalleryPage />} />
            <Route path="/player/:campaignId/worldmap" element={<PlayerWorldMapPage />} />
            <Route path="/player/:campaignId/loot" element={<PlayerLootPage />} />
            {/* Battle maps are part of the live session now; old links land there. */}
            <Route path="/player/:campaignId/battlemap" element={<PlayerBattlemapRedirect />} />
            <Route path="/campaign/:campaignId" element={<CampaignLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="timeline" element={<TimelinePage />} />
              <Route path="npcs" element={<NpcsPage />} />
              <Route path="families" element={<FamiliesPage />} />
              <Route path="locations" element={<LocationsPage />} />
              <Route path="items" element={<ItemsPage />} />
              <Route path="tables" element={<RollTablesPage />} />
              <Route path="map" element={<MapPage />} />
              <Route path="worldmap" element={<WorldMapPage />} />
              <Route path="battlemap" element={<BattleMapPage />} />
              <Route path="gallery" element={<GalleryPage />} />
              <Route path="handouts" element={<HandoutsPage />} />
              <Route path="loot" element={<LootPage />} />
              <Route path="tags" element={<TagsPage />} />
              <Route path="notes" element={<NotesPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </RouteBoundary>
        </main>
        </div>
      </ConfirmProvider>
    </HashRouter>
    </SyncProvider>
    </AuthProvider>
  )
}

/** /player/:id/battlemap (from before maps moved into live sessions). */
function PlayerBattlemapRedirect() {
  const { campaignId } = useParams()
  return <Navigate to={`/player/${campaignId}/session`} replace />
}
