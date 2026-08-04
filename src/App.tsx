import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
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

function Sidebar() {
  // Show the handful of most-recently-updated campaigns for quick access.
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

      <NavLink to="/" end className="nav-link">
        <span className="ico">📚</span> Campaigns
      </NavLink>
      <NavLink to="/backup" className="nav-link">
        <span className="ico">💾</span> Backup &amp; Data
      </NavLink>

      {recent && recent.length > 0 && (
        <>
          <div className="sidebar-heading">Recent</div>
          {recent.map((c) => (
            <NavLink key={c.id} to={`/campaign/${c.id}`} className="nav-link">
              <span
                className="ico"
                style={{ color: c.color }}
                aria-hidden
              >
                ●
              </span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.name}
              </span>
            </NavLink>
          ))}
        </>
      )}

      <div className="sidebar-spacer" />
      <div className="faint" style={{ fontSize: 11, padding: '0 8px' }}>
        Stored locally in your browser.
      </div>
    </nav>
  )
}

export function App() {
  return (
    <HashRouter>
      <div className="app">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<CampaignsPage />} />
            <Route path="/backup" element={<BackupPage />} />
            <Route path="/campaign/:campaignId" element={<CampaignLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="npcs" element={<NpcsPage />} />
              <Route path="locations" element={<LocationsPage />} />
              <Route path="items" element={<ItemsPage />} />
              <Route path="tables" element={<RollTablesPage />} />
              <Route path="notes" element={<NotesPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
