import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createCampaign } from '../db/repo'
import { Modal } from '../components/Modal'
import { relativeTime } from '../lib/format'

const COLORS = ['#7c3aed', '#db2777', '#0891b2', '#ca8a04', '#16a34a', '#dc2626', '#2563eb']

export function CampaignsPage() {
  const navigate = useNavigate()
  const campaigns = useLiveQuery(
    () => db.campaigns.orderBy('updatedAt').reverse().toArray(),
    [],
  )

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [color, setColor] = useState(COLORS[0])

  const active = campaigns?.filter((c) => !c.archived) ?? []
  const archived = campaigns?.filter((c) => c.archived) ?? []

  async function handleCreate() {
    const c = await createCampaign({ name, summary, color })
    setCreating(false)
    setName('')
    setSummary('')
    navigate(`/campaign/${c.id}`)
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">Campaigns</h1>
          <div className="subtitle">Every world you're running or building.</div>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          ＋ New Campaign
        </button>
      </div>

      {active.length === 0 ? (
        <div className="empty">
          <div className="big">📜</div>
          <p>No campaigns yet.</p>
          <button className="btn primary" onClick={() => setCreating(true)}>
            Create your first campaign
          </button>
        </div>
      ) : (
        <div className="grid">
          {active.map((c) => (
            <div
              key={c.id}
              className="card"
              onClick={() => navigate(`/campaign/${c.id}`)}
            >
              <div className="accent-bar" style={{ background: c.color }} />
              <h3>{c.name}</h3>
              <div className="muted">
                {c.summary || <span className="faint">No summary yet.</span>}
              </div>
              <div className="card-meta">Updated {relativeTime(c.updatedAt)}</div>
            </div>
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <>
          <h2 style={{ marginTop: 34 }}>Archived</h2>
          <div className="grid">
            {archived.map((c) => (
              <div
                key={c.id}
                className="card"
                style={{ opacity: 0.6 }}
                onClick={() => navigate(`/campaign/${c.id}`)}
              >
                <div className="accent-bar" style={{ background: c.color }} />
                <h3>{c.name}</h3>
                <div className="card-meta">Archived</div>
              </div>
            ))}
          </div>
        </>
      )}

      {creating && (
        <Modal
          title="New Campaign"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={handleCreate}>
                Create
              </button>
            </>
          }
        >
          <div className="field">
            <label>Name</label>
            <input
              className="input"
              autoFocus
              value={name}
              placeholder="Curse of the Shattered Crown"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="field">
            <label>Summary (optional)</label>
            <input
              className="input"
              value={summary}
              placeholder="A one-line pitch for the campaign"
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Accent color</label>
            <div className="row wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: c,
                    border: color === c ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
