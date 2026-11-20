import { Icon } from '../components/Icon'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createCampaign, updateCampaign, deleteCampaign } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { RichTextEditor } from '../components/RichTextEditor'
import { AddLinkButton } from '../components/AddLinkButton'
import { CampaignLinks } from '../components/CampaignLinks'
import { DiscordVoiceSettings } from '../components/DiscordVoiceSettings'
import { Modal } from '../components/Modal'
import { NextSessionCard } from '../components/NextSessionCard'
import { CampaignHero } from '../components/CampaignHero'
import { CampaignPrep } from '../components/CampaignPrep'
import { CampaignSettingsModal } from '../components/CampaignSettingsModal'
import { CollapsePanel } from '../components/CollapsePanel'
import { useConfirm } from '../components/ConfirmDialog'
import { clearSessionSchedule } from '../auth/cloud'
import { formatDate } from '../lib/format'
import { useCampaignCounts } from '../lib/useCampaignCounts'

export function OverviewPage() {
  const campaign = useCampaign()
  const navigate = useNavigate()

  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // The prep checklist links here with ?edit=1 to open the Edit campaign dialog;
  // strip the param so closing the dialog doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('edit') !== '1') return
    setEditing(true)
    const next = new URLSearchParams(searchParams)
    next.delete('edit')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  // Archiving ends the campaign: it also clears the next-session schedule so the
  // shared calendar feed empties and players stop seeing sessions on their
  // calendars. Unarchiving just flips the flag back.
  async function toggleArchive() {
    if (campaign.archived) {
      await updateCampaign(campaign.id, { archived: false })
      return
    }
    const ok = await confirm({
      title: 'Archive this campaign?',
      message:
        "Archiving ends the campaign. Its shared session calendar clears, so players stop seeing upcoming sessions on their calendars. You can unarchive and reschedule anytime.",
      confirmLabel: 'Archive',
    })
    if (!ok) return
    await updateCampaign(campaign.id, {
      archived: true,
      nextSessionDate: null,
      nextSessionTime: null,
      rescheduledFrom: null,
    })
    try {
      await clearSessionSchedule(campaign.id)
    } catch {
      // Cloud clear is best-effort; the local schedule is already cleared.
    }
  }

  // Counts and recent sessions for the dashboard.
  const stats = useCampaignCounts(campaign.id)

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
    ['World notes', stats?.notes, 'notes'],
    ['NPCs', stats?.npcs, 'npcs'],
    ['Locations', stats?.locations, 'locations'],
    ['Items', stats?.items, 'items'],
    ['Roll tables', stats?.tables, 'tables'],
  ]

  return (
    <div>
      <CampaignHero campaign={campaign} onOpenSettings={() => setSettingsOpen(true)} />

      <div className="ov-bento">
        <div className="ov-next">
          <NextSessionCard campaign={campaign} />
        </div>

        <div className="ov-stats" role="list">
          {statCards.map(([label, count, path]) => (
            <Link key={label} to={path} className="ov-stat" role="listitem">
              <span className="ov-stat-n">{count ?? '—'}</span>
              <span className="ov-stat-l">{label}</span>
            </Link>
          ))}
        </div>

        <div className="ov-main">
          <CollapsePanel
            title="World overview"
            defaultOpenPhone
            actions={
              <button className="btn small" onClick={() => setEditing(true)}>
                <Icon name="pencil" size={13} /> Edit
              </button>
            }
          >
            {campaign.description?.trim() ? (
              <RichTextEditor campaignId={campaign.id} value={campaign.description} editable={false} />
            ) : (
              <p className="faint" style={{ margin: 0 }}>Nothing here yet.</p>
            )}
          </CollapsePanel>

          <section className="ov-panel">
            <div className="ov-panel-head">
              <h3 className="mb-0">Recent sessions</h3>
              <Link to="sessions" className="btn ghost small">
                View all →
              </Link>
            </div>
            <div className="ov-panel-body">
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
                <p className="faint" style={{ margin: 0 }}>No sessions logged yet.</p>
              )}
            </div>
          </section>

          {/* Prep checklist and Recently edited sit under Recent sessions: the world
              overview stays first in the main column (and first on a phone), and the
              wide main column has room for the checklist rows. */}
          <CampaignPrep campaign={campaign} />
        </div>

        <aside className="ov-side">
          <CollapsePanel title="Links">
            <CampaignLinks campaignId={campaign.id} links={campaign.externalLinks ?? []} />
          </CollapsePanel>

          <CollapsePanel title="Voice">
            <DiscordVoiceSettings campaign={campaign} />
          </CollapsePanel>

          <CollapsePanel title="Linked campaigns">
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
          </CollapsePanel>
        </aside>
      </div>

      {settingsOpen && (
        <CampaignSettingsModal
          campaign={campaign}
          onClose={() => setSettingsOpen(false)}
          onToggleArchive={async () => {
            setSettingsOpen(false)
            await toggleArchive()
          }}
          onDelete={() => {
            setSettingsOpen(false)
            setConfirmDelete(true)
          }}
        />
      )}

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
  const navigate = useNavigate()
  const options = allCampaigns.filter(
    (c) => c.id !== campaignId && !current.includes(c.id),
  )
  const noOtherCampaigns = allCampaigns.filter((c) => c.id !== campaignId).length === 0
  if (noOtherCampaigns) {
    return (
      <AddLinkButton
        label="campaign"
        onAdd={async () => {
          const created = await createCampaign()
          await updateCampaign(campaignId, { relatedCampaignIds: [...current, created.id] })
          navigate(`/campaign/${created.id}`)
        }}
      />
    )
  }
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
