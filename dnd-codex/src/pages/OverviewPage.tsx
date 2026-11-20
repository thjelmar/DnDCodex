import { Icon } from '../components/Icon'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { updateCampaign, deleteCampaign } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { RichTextEditor } from '../components/RichTextEditor'
import { CampaignLinks } from '../components/CampaignLinks'
import { DiscordVoiceSettings } from '../components/DiscordVoiceSettings'
import { Modal } from '../components/Modal'
import { NextSessionCard } from '../components/NextSessionCard'
import { CampaignHero } from '../components/CampaignHero'
import { CampaignPrep } from '../components/CampaignPrep'
import { HubCards } from '../components/HubCards'
import { CampaignSettingsModal } from '../components/CampaignSettingsModal'
import { CollapsePanel } from '../components/CollapsePanel'
import { useConfirm } from '../components/ConfirmDialog'
import { clearSessionSchedule } from '../auth/cloud'
import { formatDate } from '../lib/format'
import { useOverviewData } from '../lib/useOverviewData'

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

  // One local read shared by the hub cards, the prep checklist and the feed.
  const data = useOverviewData(campaign.id)

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

  async function handleDelete() {
    await deleteCampaign(campaign.id)
    navigate('/')
  }

  // The blocks, in reading order: the World overview sits directly under the hero,
  // then the next-session strip and the hub cards. The order is the same at every width,
  // so the DOM order, and so the Tab order, equals the visual order everywhere. On a wide
  // screen the grid places the blocks (see .ov-bento in styles.css) without reordering
  // them. The blocks stay keyed siblings, so panel state and the editor survive a resize.
  const next = (
    <div key="next" className="ov-next">
      <NextSessionCard campaign={campaign} />
    </div>
  )
  const hub = <HubCards key="hub" campaign={campaign} data={data} />
  const world = (
    <CollapsePanel
      key="world"
      title="World overview"
      className="ov-world"
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
  )
  const recent = (
    <section key="recent" className="ov-panel ov-recent">
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
  )
  const prep = <CampaignPrep key="prep" campaign={campaign} data={data} />
  const side = (
    <aside key="side" className="ov-side">
      <CollapsePanel title="Links">
        <CampaignLinks campaignId={campaign.id} links={campaign.externalLinks ?? []} />
      </CollapsePanel>

      <CollapsePanel title="Voice">
        <DiscordVoiceSettings campaign={campaign} />
      </CollapsePanel>
    </aside>
  )
  const blocks = [world, next, hub, recent, prep, side]

  return (
    <div>
      <CampaignHero campaign={campaign} onOpenSettings={() => setSettingsOpen(true)} />

      <div className="ov-bento">{blocks}</div>

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
