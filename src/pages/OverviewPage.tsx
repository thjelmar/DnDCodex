import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { updateCampaign, deleteCampaign, createImage, deleteImage } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { RichTextEditor } from '../components/RichTextEditor'
import { Modal } from '../components/Modal'
import { formatDate } from '../lib/format'
import { processImageFile } from '../lib/image'
import type { Campaign } from '../db/types'

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
      <CampaignCover campaign={campaign} />

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
        {campaign.description?.trim() ? (
          <RichTextEditor campaignId={campaign.id} value={campaign.description} editable={false} />
        ) : (
          <p className="faint">Nothing here yet.</p>
        )}
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
      <RichTextEditor
        campaignId={campaignId}
        value={description}
        onChange={setDescription}
        label="World overview"
        placeholder="Describe the world, its history, factions, and tone…"
        minHeight={220}
      />
    </Modal>
  )
}

/**
 * The campaign cover banner plus its upload / change / remove controls. The
 * cover is a StoredImage referenced by campaign.coverImageId.
 */
function CampaignCover({ campaign }: { campaign: Campaign }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const cover = useLiveQuery(
    () => (campaign.coverImageId ? db.images.get(campaign.coverImageId) : undefined),
    [campaign.coverImageId],
  )

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const processed = await processImageFile(file)
      const image = await createImage(campaign.id, {
        name: file.name,
        mime: processed.mime,
        dataUrl: processed.dataUrl,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
      })
      // Replace any previous cover, cleaning up the old image.
      const previous = campaign.coverImageId
      await updateCampaign(campaign.id, { coverImageId: image.id })
      if (previous) await deleteImage(previous)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeCover() {
    const previous = campaign.coverImageId
    await updateCampaign(campaign.id, { coverImageId: null })
    if (previous) await deleteImage(previous)
  }

  return (
    <div style={{ marginBottom: 22 }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {cover ? (
        <div style={{ position: 'relative' }}>
          <img
            src={cover.dataUrl}
            alt={`${campaign.name} cover`}
            style={{
              width: '100%',
              maxHeight: 260,
              objectFit: 'cover',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              display: 'block',
            }}
          />
          <div className="row" style={{ position: 'absolute', top: 10, right: 10, gap: 6 }}>
            <button className="btn small" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? '…' : 'Change'}
            </button>
            <button className="btn small danger" onClick={removeCover}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          style={{ width: '100%', padding: '18px', borderStyle: 'dashed' }}
        >
          {busy ? 'Uploading…' : '🖼 Add a cover image'}
        </button>
      )}
    </div>
  )
}
