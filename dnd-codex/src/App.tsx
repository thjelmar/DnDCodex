import { useEffect, useState, type ReactNode } from 'react'
import { HashRouter, Routes, Route, NavLink, Link, Navigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import { SearchPalette } from './components/SearchPalette'
import { DiceRoller } from './components/DiceRoller'
import { ConfirmProvider } from './components/ConfirmDialog'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { SyncProvider } from './auth/SyncProvider'
import { AccountArea } from './auth/AccountArea'
import { Icon } from './components/Icon'
import { JoinCampaignModal } from './auth/JoinCampaignModal'
import { AddPlayerCampaignModal } from './components/AddPlayerCampaignModal'
import { PreferencesModal } from './components/PreferencesModal'
import { BugReportModal } from './components/BugReportModal'
import { installErrorLog } from './lib/errorLog'
import { CampaignsPage } from './pages/CampaignsPage'
import { BackupPage } from './pages/BackupPage'
import { ChangelogPage } from './pages/ChangelogPage'
import { useChangelogUnseen } from './lib/useChangelog'
import { CampaignLayout } from './pages/CampaignLayout'
import { OverviewPage } from './pages/OverviewPage'
import { SessionsPage } from './pages/SessionsPage'
import { NpcsPage } from './pages/NpcsPage'
import { LocationsPage } from './pages/LocationsPage'
import { ItemsPage } from './pages/ItemsPage'
import { NotesPage } from './pages/NotesPage'
import { RollTablesPage } from './pages/RollTablesPage'
import { EncountersPage } from './pages/EncountersPage'
import { CombatTrackerPage } from './pages/CombatTrackerPage'
import { RunPage } from './pages/RunPage'
import { GalleryPage } from './pages/GalleryPage'
import { HandoutsPage } from './pages/HandoutsPage'
import { LootPage } from './pages/LootPage'
import { MapPage } from './pages/MapPage'
import { BattleMapPage } from './pages/BattleMapPage'
import { TagsPage } from './pages/TagsPage'
import { PlayerNotesPage } from './pages/PlayerNotesPage'
import { PlayerGalleryPage } from './pages/PlayerGalleryPage'
import { PlayerHandoutsPage } from './pages/PlayerHandoutsPage'
import { PlayerSessionPage } from './pages/PlayerSessionPage'
import { TicketsPage } from './pages/TicketsPage'
import { RoadmapPage } from './pages/RoadmapPage'

// Start capturing client errors as early as possible so a bug report includes
// whatever went wrong before the user opened the reporter.
installErrorLog()

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
  onOpenSearch,
  onOpenDice,
  onAddPlayerCampaign,
  onOpenPrefs,
  onOpenBug,
}: {
  onOpenSearch: () => void
  onOpenDice: () => void
  onAddPlayerCampaign: () => void
  onOpenPrefs: () => void
  onOpenBug: () => void
}) {
  const { user } = useAuth()
  const changelogUnseen = useChangelogUnseen()
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
      </div>

      <button className="nav-link" style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }} onClick={onOpenSearch}>
        <span className="ico"><Icon name="search" /></span>
        <span>Search</span>
        <span style={{ marginLeft: 'auto' }}>
          <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
          <kbd>K</kbd>
        </span>
      </button>
      <button className="nav-link" style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }} onClick={onOpenDice}>
        <span className="ico"><Icon name="dice" /></span>
        <span>Dice Roller</span>
        <span style={{ marginLeft: 'auto' }}>
          <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
          <kbd>E</kbd>
        </span>
      </button>
      {/* App: settings, updates, and data */}
      <SidebarSection label="App" sectionKey="app">
        <button className="nav-link" style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }} onClick={onOpenPrefs}>
          <span className="ico"><Icon name="settings" /></span> Preferences
        </button>
        <NavLink to="/changelog" className="nav-link">
          <span className="ico"><Icon name="sparkles" /></span>
          <span>What’s New</span>
          {changelogUnseen && <span className="nav-dot" aria-label="new updates" />}
        </NavLink>
        <NavLink to="/roadmap" className="nav-link">
          <span className="ico"><Icon name="map" /></span> Roadmap
        </NavLink>
        {user && (
          <NavLink to="/tickets" className="nav-link">
            <span className="ico"><Icon name="inbox" /></span> Tickets
          </NavLink>
        )}
      </SidebarSection>

      {/* DM: campaign creation & management */}
      <SidebarSection label="DM" sectionKey="dm">
        <NavLink to="/" end className="nav-link">
          <span className="ico">📚</span> Campaigns
        </NavLink>
        <Link to="/?new=1" className="nav-link">
          <span className="ico"><Icon name="plus" /></span> New Campaign
        </Link>
        {recent?.map((c) => (
          <NavLink key={c.id} to={`/campaign/${c.id}`} className="nav-link" style={{ paddingLeft: 22, fontSize: 13.5 }}>
            <span className="ico" style={{ color: c.color }} aria-hidden>
              ●
            </span>
            <span style={ellipsis}>{c.name}</span>
          </NavLink>
        ))}
        <ToolsMenu />
      </SidebarSection>

      {/* Player: campaigns you're playing in, each a notes home */}
      <SidebarSection label="Player" sectionKey="player">
        <PlayerNotesNav onAddPlayerCampaign={onAddPlayerCampaign} />
      </SidebarSection>

      <div className="sidebar-spacer" />
      <button
        className="nav-link"
        style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', color: 'var(--text-dim)' }}
        onClick={onOpenBug}
      >
        <span className="ico"><Icon name="bug" /></span> Report something
      </button>
      <AccountArea />
      <div className="faint" style={{ fontSize: 11, padding: '0 8px' }}>
        Stored locally in your browser.
      </div>
    </nav>
  )
}

/** Collapsible DM "Tools" sub-menu: campaign-independent utilities.
 *  Collapsed by default (remembered per browser); the chevron signals it opens. */
function ToolsMenu() {
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
  const campaigns = useLiveQuery(
    () => db.campaigns.orderBy('name').filter((c) => !c.archived && c.role === 'player').toArray(),
    [],
  )

  return (
    <>
      {campaigns?.map((c) => (
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

export function App() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [diceOpen, setDiceOpen] = useState(false)

  // Global shortcuts: Cmd/Ctrl+K search, Cmd/Ctrl+E dice roller.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setDiceOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [addPlayerOpen, setAddPlayerOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [bugOpen, setBugOpen] = useState(false)

  return (
    <AuthProvider>
    <SyncProvider>
    <HashRouter>
      <ConfirmProvider>
        <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
        <DiceRoller open={diceOpen} onClose={() => setDiceOpen(false)} />
        <AddPlayerCampaignModal open={addPlayerOpen} onClose={() => setAddPlayerOpen(false)} />
        {prefsOpen && <PreferencesModal onClose={() => setPrefsOpen(false)} />}
        {bugOpen && <BugReportModal onClose={() => setBugOpen(false)} />}
        <div className="app">
          <Sidebar
            onOpenSearch={() => setSearchOpen(true)}
            onOpenDice={() => setDiceOpen(true)}
            onAddPlayerCampaign={() => setAddPlayerOpen(true)}
            onOpenPrefs={() => setPrefsOpen(true)}
            onOpenBug={() => setBugOpen(true)}
          />
        <main className="main">
          <Routes>
            <Route path="/" element={<CampaignsPage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/bug-reports" element={<Navigate to="/tickets" replace />} />
            <Route path="/roadmap" element={<RoadmapPage onReport={() => setBugOpen(true)} />} />
            <Route path="/tools/encounters" element={<EncountersPage />} />
            <Route path="/tools/combat" element={<CombatTrackerPage />} />
            <Route path="/run/:campaignId" element={<RunPage />} />
            <Route path="/player/:campaignId" element={<PlayerNotesPage />} />
            <Route path="/player/:campaignId/session" element={<PlayerSessionPage />} />
            <Route path="/player/:campaignId/handouts" element={<PlayerHandoutsPage />} />
            <Route path="/player/:campaignId/gallery" element={<PlayerGalleryPage />} />
            {/* Battle maps are part of the live session now; old links land there. */}
            <Route path="/player/:campaignId/battlemap" element={<PlayerBattlemapRedirect />} />
            <Route path="/campaign/:campaignId" element={<CampaignLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="npcs" element={<NpcsPage />} />
              <Route path="locations" element={<LocationsPage />} />
              <Route path="items" element={<ItemsPage />} />
              <Route path="tables" element={<RollTablesPage />} />
              <Route path="map" element={<MapPage />} />
              <Route path="battlemap" element={<BattleMapPage />} />
              <Route path="gallery" element={<GalleryPage />} />
              <Route path="handouts" element={<HandoutsPage />} />
              <Route path="loot" element={<LootPage />} />
              <Route path="tags" element={<TagsPage />} />
              <Route path="notes" element={<NotesPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
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
