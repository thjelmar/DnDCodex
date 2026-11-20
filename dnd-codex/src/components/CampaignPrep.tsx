import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { derivePrepChecklist } from '../lib/prepChecklist'
import { ACTIVITY_LABEL, deriveRecentActivity } from '../lib/recentActivity'
import { relativeTime, todayISODate } from '../lib/format'
import type { OverviewData } from '../lib/useOverviewData'
import type { Campaign } from '../db/types'

// Two Overview panels built only from the campaign's local records: a prep
// checklist that ticks itself, and a recently edited feed. Both come from the
// shared local read in useOverviewData, so they work offline and in the demo, and
// neither writes anything.

export function CampaignPrep({ campaign, data }: { campaign: Campaign; data: OverviewData | undefined }) {
  if (!data) return null

  const checklist = derivePrepChecklist({
    campaign,
    sessions: data.sessions,
    npcs: data.npcs,
    locations: data.locations,
    today: todayISODate(),
  })
  const doneCount = checklist.filter((i) => i.done).length
  const activity = deriveRecentActivity({
    session: data.sessions.map((s) => ({ ...s, name: s.title })),
    npc: data.npcs,
    location: data.locations,
    item: data.items,
    note: data.notes.map((n) => ({ ...n, name: n.title })),
    rolltable: data.tables,
  })

  return (
    <div className="ov-extras">
      <section className="ov-panel" aria-label="Prep checklist">
        <div className="ov-panel-head">
          <h3 className="mb-0">Prep checklist</h3>
          <span className="ov-prep-count">
            {doneCount} of {checklist.length} done
          </span>
        </div>
        <ul className="ov-prep-list">
          {checklist.map((i) => (
            <li key={i.key}>
              <Link to={i.to} className={`ov-prep-row${i.done ? ' done' : ''}`}>
                <span className="ov-prep-box" aria-hidden>
                  {i.done && <Icon name="check" size={12} color="currentColor" />}
                </span>
                <span className="ov-prep-text">
                  <span className="ov-prep-label">
                    <span className="sr-only">{i.done ? 'Done: ' : 'To do: '}</span>
                    {i.label}
                  </span>
                  {i.detail && <span className="ov-prep-detail">{i.detail}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="ov-panel" aria-label="Recently edited">
        <div className="ov-panel-head">
          <h3 className="mb-0">Recently edited</h3>
        </div>
        {activity.length === 0 ? (
          <p className="faint" style={{ margin: '10px 0 0' }}>
            Nothing yet. NPCs, locations, sessions and notes you edit show up here.
          </p>
        ) : (
          <ul className="ov-feed">
            {activity.map((a) => (
              <li key={`${a.kind}-${a.id}`}>
                <Link to={a.to} className="ov-feed-row">
                  <span className="ov-feed-main">
                    <span className="ov-feed-name">{a.name}</span>
                    <span className="ov-feed-meta">
                      {ACTIVITY_LABEL[a.kind]} · {a.action}
                    </span>
                  </span>
                  <span className="ov-feed-when">{relativeTime(a.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
