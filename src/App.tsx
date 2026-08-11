import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, NavLink, Link, Navigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import { SearchPalette } from './components/SearchPalette'
import { DiceRoller } from './components/DiceRoller'
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
import { TagsPage } from './pages/TagsPage'
import { PlayerNotesPage } from './pages/PlayerNotesPage'

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

const ellipsis: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

function Sidebar({ onOpenSearch, onOpenDice }: { onOpenSearch: () => void; onOpenDice: () => void }) {
  // Most-recently-updated campaigns for quick access under the DM section.
  const recent = useLiveQuery(
    () =>
      db.campaigns
        .orderBy('updatedAt')
        .reverse()
        .filter((c) => !c.archived)
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
        <span className="ico">🔎</span>
        <span>Search</span>
        <span style={{ marginLeft: 'auto' }}>
          <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
          <kbd>K</kbd>
        </span>
      </button>
      <button className="nav-link" style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }} onClick={onOpenDice}>
        <span className="ico">🎲</span>
        <span>Dice Roller</span>
        <span style={{ marginLeft: 'auto' }}>
          <kbd>{isMac ? '⌘' : 'Ctrl'}</kbd>
          <kbd>E</kbd>
        </span>
      </button>
      <NavLink to="/backup" className="nav-link">
        <span className="ico">💾</span> Backup &amp; Data
      </NavLink>

      {/* DM: campaign creation & management */}
      <div className="sidebar-heading">DM</div>
      <NavLink to="/" end className="nav-link">
        <span className="ico">📚</span> Campaigns
      </NavLink>
      <Link to="/?new=1" className="nav-link">
        <span className="ico">＋</span> New Campaign
      </Link>
      {recent?.map((c) => (
        <NavLink key={c.id} to={`/campaign/${c.id}`} className="nav-link" style={{ paddingLeft: 22, fontSize: 13.5 }}>
          <span className="ico" style={{ color: c.color }} aria-hidden>
            ●
          </span>
          <span style={ellipsis}>{c.name}</span>
        </NavLink>
      ))}

      {/* Player: personal notes, subdivided by campaign */}
      <div className="sidebar-heading">Player</div>
      <PlayerNotesNav />

      <div className="sidebar-spacer" />
      <div className="faint" style={{ fontSize: 11, padding: '0 8px' }}>
        Stored locally in your browser.
      </div>
    </nav>
  )
}

/** Expandable "Notes" entry listing every campaign the player can take notes on. */
function PlayerNotesNav() {
  const [open, setOpen] = useState(true)
  const campaigns = useLiveQuery(
    () => db.campaigns.orderBy('name').filter((c) => !c.archived).toArray(),
    [],
  )

  return (
    <>
      <button
        className="nav-link"
        style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="ico">📓</span>
        <span>Notes</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-faint)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open &&
        (campaigns && campaigns.length > 0 ? (
          campaigns.map((c) => (
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
          ))
        ) : (
          <div className="faint" style={{ fontSize: 12, padding: '4px 10px 4px 30px' }}>
            No campaigns yet.
          </div>
        ))}
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

  return (
    <HashRouter>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <DiceRoller open={diceOpen} onClose={() => setDiceOpen(false)} />
      <div className="app">
        <Sidebar onOpenSearch={() => setSearchOpen(true)} onOpenDice={() => setDiceOpen(true)} />
        <main className="main">
          <Routes>
            <Route path="/" element={<CampaignsPage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/player/:campaignId" element={<PlayerNotesPage />} />
            <Route path="/campaign/:campaignId" element={<CampaignLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="npcs" element={<NpcsPage />} />
              <Route path="locations" element={<LocationsPage />} />
              <Route path="items" element={<ItemsPage />} />
              <Route path="tables" element={<RollTablesPage />} />
              <Route path="tags" element={<TagsPage />} />
              <Route path="notes" element={<NotesPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
