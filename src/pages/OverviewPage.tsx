import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { updateCampaign, deleteCampaign } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { Markdown } from '../lib/markdown'
import { Modal } from '../components/Modal'
import { formatDate } from '../lib/format'

export function OverviewPage() {
  const campaign = useCampaign()
  const navigate = useNavigate()

  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Counts and recent sessions for the dashboard.
  const stats = useLiveQuery(async () => {
    const [sessions, npcs, locations, items, notes, tables] = await Promise.all([
      db.sessions.where('campaignId').equals(campaign.id).count(),
      db.npcs.where('campaignId').equals(campaign.id).count(),
      db.locations.where('campaignId').equals(campaign.id).count(),
      db.items.where('campaignId').equals(campaign.id).count(),
      db.notes.where('campaignId').equals(campaign.id).count(),
      db.rollTables.where('campaignId').equals(campaign.id).count(),
    ])
    return { sessions, npcs, locations, items, notes, tables }
  }, [campaign.id])

  const recentSessions = useLiveQuery(
    () =>
      db.sessions
        .where('campaignId')
        .equals(campaign.id)
        .reverse()
        .sortBy('date')
        .then((s) => s.slice(0, 4)),
    [campaign.id],
  )

  const allCampaigns = useLiveQuery(() => db.campaigns.toArray(), [])
  const related = (allCampaigns ?? []).filter((c) =>
    campaign.relatedCampaignIds.includes(c.id),
  )

  async function handleDelete() {
    await deleteCampaign(campaign.id)
    navigate('/')
  }

  const statCards: Array<[string, number | undefined, string]> = [
    ['Sessions', stats?.sessions, 'sessions'],
    ['World Notes', stats?.notes, 'notes'],
    ['NPCs', stats?.npcs, 'npcs'],
    ['Locations', stats?.locations, 'locations'],
    ['Items', stats?.items, 'items'],
    ['Roll Tables', stats?.tables, 'tables'],
  ]

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', marginBottom: 24 }}>
        {statCards.map(([label, count, path]) => (
          <Link
            key={label}
            to={path}
            className="card"
            style={{ textDecoration: 'none' }}
          >
            <div style={{ fontSize: 30, fontFamily: 'var(--serif)' }}>
              {count ?? '—'}
            </div>
            <div className="muted">{label}</div>
          </Link>
        ))}
      </div>

      <div className="row between">
        <h2 className="mb-0">World Overview</h2>
        <button className="btn small" onClick={() => setEditing(true)}>
          ✎ Edit
        </button>
      </div>
      <div style={{ marginTop: 12, marginBottom: 28 }}>
        <Markdown text={campaign.description} />
      </div>

      <div className="row between">
        <h2 className="mb-0">Recent Sessions</h2>
        <Link to="sessions" className="btn ghost small">
          View all →
        </Link>
      </div>
      <div style={{ marginTop: 12, marginBottom: 28 }}>
        {recentSessions && recentSessions.length > 0 ? (
          recentSessions.map((s) => (
            <Link
              key={s.id}
              to="sessions"
              className="list-row"
              style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}
            >
              <div>
                <div className="title">{s.title}</div>
                <div className="sub">{formatDate(s.date)}</div>
              </div>
            </Link>
          ))
        ) : (
          <p className="faint">No sessions logged yet.</p>
        )}
      </div>

      <h2>Linked Campaigns</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Reference shared worlds or previous campaigns.
      </p>
      <div className="row wrap" style={{ marginBottom: 8 }}>
        {related.map((c) => (
          <Link key={c.id} to={`/campaign/${c.id}`} className="tag" style={{ textDecoration: 'none' }}>
            ● {c.name}
          </Link>
        ))}
        {related.length === 0 && <span className="faint">None linked.</span>}
      </div>
      <RelatedCampaignPicker campaignId={campaign.id} current={campaign.relatedCampaignIds} allCampaigns={allCampaigns ?? []} />

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '32px 0' }} />

      <div className="row wrap" style={{ gap: 10 }}>
        <button
          className="btn"
          onClick={() =>
            updateCampaign(campaign.id, { archived: !campaign.archived })
          }
        >
          {campaign.archived ? 'Unarchive' : 'Archive'} campaign
        </button>
        <button className="btn danger" onClick={() => setConfirmDelete(true)}>
          Delete campaign
        </button>
      </div>

      {editing && (
        <EditCampaignModal
          onClose={() => setEditing(false)}
          campaignId={campaign.id}
          initialName={campaign.name}
          initialSummary={campaign.summary}
          initialDescription={campaign.description}
        />
      )}

      {confirmDelete && (
        <Modal
          title="Delete campaign?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button className="btn danger" onClick={handleDelete}>
                Delete everything
              </button>
            </>
          }
        >
          <p>
            This permanently deletes <strong>{campaign.name}</strong> and all of
            its sessions, NPCs, locations, items, and notes. This cannot be
            undone.
          </p>
          <p className="faint">
            Tip: export a backup first from Backup &amp; Data.
          </p>
        </Modal>
      )}
    </div>
  )
}

function RelatedCampaignPicker({
  campaignId,
  current,
  allCampaigns,
}: {
  campaignId: string
  current: string[]
  allCampaigns: { id: string; name: string }[]
}) {
  const options = allCampaigns.filter(
    (c) => c.id !== campaignId && !current.includes(c.id),
  )
  if (options.length === 0) return null
  return (
    <select
      className="select"
      style={{ maxWidth: 280 }}
      value=""
      onChange={(e) => {
        if (e.target.value) {
          updateCampaign(campaignId, {
            relatedCampaignIds: [...current, e.target.value],
          })
        }
      }}
    >
      <option value="">+ Link a campaign…</option>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

function EditCampaignModal({
  onClose,
  campaignId,
  initialName,
  initialSummary,
  initialDescription,
}: {
  onClose: () => void
  campaignId: string
  initialName: string
  initialSummary: string
  initialDescription: string
}) {
  const [name, setName] = useState(initialName)
  const [summary, setSummary] = useState(initialSummary)
  const [description, setDescription] = useState(initialDescription)

  async function save() {
    await updateCampaign(campaignId, { name, summary, description })
    onClose()
  }

  return (
    <Modal
      title="Edit Campaign"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="field">
        <label>Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Summary</label>
        <input className="input" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div className="field">
        <label>World overview (markdown, supports [[wiki links]])</label>
        <textarea
          className="textarea tall"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the world, its history, factions, and tone…"
        />
      </div>
    </Modal>
  )
}
