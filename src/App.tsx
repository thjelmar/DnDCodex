import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, NavLink, Link, Navigate } from 'react-router-dom'
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
import { GalleryPage } from './pages/GalleryPage'
import { LootPage } from './pages/LootPage'
import { MapPage } from './pages/MapPage'
import { TagsPage } from './pages/TagsPage'
import { PlayerNotesPage } from './pages/PlayerNotesPage'
import { PlayerGalleryPage } from './pages/PlayerGalleryPage'
import { BugReportsPage } from './pages/BugReportsPage'

// Start capturing client errors as early as possible so a bug report includes
// whatever went wrong before the user opened the reporter.
installErrorLog()

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

const ellipsis: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
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
      <NavLink to="/backup" className="nav-link">
        <span className="ico"><Icon name="save" /></span> Backup &amp; Data
      </NavLink>
      <button className="nav-link" style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }} onClick={onOpenPrefs}>
        <span className="ico"><Icon name="settings" /></span> Preferences
      </button>
      {user && (
        <NavLink to="/bug-reports" className="nav-link">
          <span className="ico"><Icon name="inbox" /></span> Bug reports
        </NavLink>
      )}

      {/* DM: campaign creation & management */}
      <div className="sidebar-heading">DM</div>
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

      {/* Player: campaigns you're playing in, each a notes home */}
      <div className="sidebar-heading" style={{ display: 'flex', alignItems: 'center' }}>
        Player
      </div>
      <PlayerNotesNav onAddPlayerCampaign={onAddPlayerCampaign} />

      <div className="sidebar-spacer" />
      <button
        className="nav-link"
        style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left', color: 'var(--text-dim)' }}
        onClick={onOpenBug}
      >
        <span className="ico"><Icon name="bug" /></span> Report a bug
      </button>
      <AccountArea />
      <div className="faint" style={{ fontSize: 11, padding: '0 8px' }}>
        Stored locally in your browser.
      </div>
    </nav>
  )
}

/** Collapsible DM "Tools" sub-menu: campaign-independent utilities. */
function ToolsMenu() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <button
        className="nav-link"
        onClick={() => setOpen((o) => !o)}
        style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
      >
        <span className="ico"><Icon name="tools" /></span>
        <span>Tools</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>{open ? '▾' : '▸'}</span>
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
            <Route path="/bug-reports" element={<BugReportsPage />} />
            <Route path="/tools/encounters" element={<EncountersPage />} />
            <Route path="/tools/combat" element={<CombatTrackerPage />} />
            <Route path="/player/:campaignId" element={<PlayerNotesPage />} />
            <Route path="/player/:campaignId/gallery" element={<PlayerGalleryPage />} />
            <Route path="/campaign/:campaignId" element={<CampaignLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="npcs" element={<NpcsPage />} />
              <Route path="locations" element={<LocationsPage />} />
              <Route path="items" element={<ItemsPage />} />
              <Route path="tables" element={<RollTablesPage />} />
              <Route path="map" element={<MapPage />} />
              <Route path="gallery" element={<GalleryPage />} />
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
