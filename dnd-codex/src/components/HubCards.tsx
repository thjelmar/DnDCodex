import { Link } from 'react-router-dom'
import { CollapsePanel } from './CollapsePanel'
import { Icon } from './Icon'
import { derivePrepChecklist } from '../lib/prepChecklist'
import { deriveHubCards } from '../lib/hubCards'
import { formatDate, todayISODate } from '../lib/format'
import type { OverviewData } from '../lib/useOverviewData'
import type { Campaign } from '../db/types'

// The Overview's four hub cards (Prep, Run, World & Lore, Reference). Each is a
// short summary of one area with the counts the old stat tiles showed and a way
// into its pages. They read the shared local data only, so they work offline and
// in the demo. On a phone they are collapsible panels: Prep and Run open, World
// and Reference closed. Every card has an empty state for a brand-new campaign.

function Tile({ to, label, value, sub }: { to?: string; label: string; value: string | number; sub?: string }) {
  const inner = (
    <>
      <span className="ov-tile-label">{label}</span>
      <span className="ov-tile-value">{value}</span>
      {sub && <span className="ov-tile-sub">{sub}</span>}
    </>
  )
  return to ? (
    <Link to={to} className="ov-tile">
      {inner}
    </Link>
  ) : (
    <div className="ov-tile static">{inner}</div>
  )
}

function Pill({ ok, children }: { ok?: boolean; children: string }) {
  return <span className={`ov-pill${ok ? ' ok' : ''}`}>{children}</span>
}

const rarityLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1)

export function HubCards({ campaign, data }: { campaign: Campaign; data: OverviewData | undefined }) {
  if (!data) return null

  const pending = derivePrepChecklist({
    campaign,
    sessions: data.sessions,
    npcs: data.npcs,
    locations: data.locations,
    today: todayISODate(),
  }).filter((i) => !i.done).length

  const hub = deriveHubCards({
    pendingTasks: pending,
    sessions: data.sessions,
    npcs: data.npcs,
    locations: data.locations,
    items: data.items,
    notes: data.notes,
    tables: data.tables,
    scenes: data.scenes,
    mappedLocationIds: data.mappedLocationIds,
    timelineCount: data.timelineCount,
    familyCount: data.familyCount,
  })
  const { prep, run, world, reference } = hub

  return (
    <div className="ov-hub" role="group" aria-label="Campaign areas">
      <CollapsePanel
        title="Prep"
        className="ov-hubcard"
        defaultOpenPhone
        actions={
          prep.pendingTasks > 0 ? <Pill>{`${prep.pendingTasks} pending`}</Pill> : <Pill ok>All set</Pill>
        }
      >
        <Link to="?planner=1" className="btn small ov-hub-cta">
          <Icon name="calendar" size={13} /> Plan next session
        </Link>
        {prep.lastSession ? (
          <Link to={`sessions?sel=${prep.lastSession.id}`} className="ov-recap">
            <span className="ov-recap-label">Last session · {formatDate(prep.lastSession.date)}</span>
            <span className="ov-recap-title">{prep.lastSession.title || 'Untitled session'}</span>
            <span className={`ov-recap-text${prep.lastSession.excerpt ? '' : ' faint'}`}>
              {prep.lastSession.excerpt || 'No recap written yet.'}
            </span>
          </Link>
        ) : (
          <p className="ov-hub-empty">
            No sessions yet. <Link to="sessions">Log your first session</Link>
          </p>
        )}
        <div className="ov-tiles">
          <Tile to="sessions" label="Sessions" value={prep.sessions} />
          <Tile to="timeline" label="Timeline events" value={prep.timeline} />
          <Tile to="tables" label="Roll tables" value={prep.tables} />
        </div>
        <Link to="sessions" className="ov-hub-more">
          Open prep <span aria-hidden>→</span>
        </Link>
      </CollapsePanel>

      <CollapsePanel
        title="Run"
        className="ov-hubcard"
        defaultOpenPhone
        actions={run.ready ? <Pill ok>Ready to launch</Pill> : undefined}
      >
        <Link to={`/run/${campaign.id}`} className="btn primary small ov-hub-cta">
          <Icon name="play" size={12} color="inherit" /> Start Run Mode
        </Link>
        {run.latestScene ? (
          <p className="ov-hub-line">
            Latest battle map: <Link to="battlemap">{run.latestScene.name || 'Untitled map'}</Link>
          </p>
        ) : (
          <p className="ov-hub-empty">
            No battle map yet. <Link to="battlemap">Create a battle map</Link>
          </p>
        )}
        <div className="ov-tiles">
          <Tile to="battlemap" label="Battle maps" value={run.scenes} />
          <Tile label="Grid" value={run.grid ? `${run.grid.cols} × ${run.grid.rows}` : '—'} sub="latest map" />
        </div>
        <Link to="battlemap" className="ov-hub-more">
          Open battle map <span aria-hidden>→</span>
        </Link>
      </CollapsePanel>

      <CollapsePanel
        title="World & Lore"
        className="ov-hubcard"
        actions={<Pill>{`${world.npcs} NPCs · ${world.locations} locations`}</Pill>}
      >
        {world.empty && (
          <p className="ov-hub-empty">
            Your world is empty. Add an <Link to="npcs">NPC</Link>, a <Link to="locations">location</Link> or a{' '}
            <Link to="notes">world note</Link>.
          </p>
        )}
        <div className="ov-tiles">
          <Tile to="npcs" label="NPCs" value={world.npcs} sub={`${world.hostile} hostile`} />
          <Tile to="locations" label="Locations" value={world.locations} sub={`${world.mapped} on the map`} />
          <Tile to="notes" label="World notes" value={world.notes} />
          <Tile to="families" label="Families" value={world.families} />
        </div>
        <Link to="notes" className="ov-hub-more">
          Explore the world <span aria-hidden>→</span>
        </Link>
      </CollapsePanel>

      <CollapsePanel title="Reference" className="ov-hubcard">
        {reference.recentItems.length > 0 ? (
          <div className="ov-chips">
            <span className="ov-recap-label">Recently added</span>
            <ul className="ov-chip-list">
              {reference.recentItems.map((i) => (
                <li key={i.id}>
                  <Link to={`items?sel=${i.id}`} className="ov-chip">
                    {i.name} <span className="ov-chip-rarity">{rarityLabel(i.rarity)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="ov-hub-empty">
            No items yet. <Link to="items">Add an item</Link>
          </p>
        )}
        <div className="ov-tiles">
          <Tile to="items" label="Items" value={reference.items} />
          <Tile to="tables" label="Roll tables" value={reference.tables} />
          <Tile to="tags" label="Tags" value={reference.tags} />
        </div>
        <Link to="items" className="ov-hub-more">
          Open reference <span aria-hidden>→</span>
        </Link>
      </CollapsePanel>
    </div>
  )
}
