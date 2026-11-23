import { Icon } from '../components/Icon'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { updateCampaign, deleteCampaign, saveOverviewLayout, resetOverviewLayout } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { RichTextEditor } from '../components/RichTextEditor'
import { LinksVoiceCard } from '../components/LinksVoiceCard'
import { Modal } from '../components/Modal'
import { NextSessionCard } from '../components/NextSessionCard'
import { CampaignHero } from '../components/CampaignHero'
import { PrepChecklistCard, RecentlyEditedCard } from '../components/CampaignPrep'
import { PrepCard, RunCard, WorldLoreCard, ReferenceCard } from '../components/HubCards'
import { CampaignSettingsModal } from '../components/CampaignSettingsModal'
import { CollapsePanel } from '../components/CollapsePanel'
import { useConfirm } from '../components/ConfirmDialog'
import { clearSessionSchedule } from '../auth/cloud'
import { formatDate } from '../lib/format'
import { useOverviewData } from '../lib/useOverviewData'
import { DEFAULT_LAYOUT, cardDef, sameLayout, type CardId, type ResolvedLayout } from '../lib/overviewCards'
import { isDemo } from '../lib/demo'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useOverviewLayout } from '../lib/useOverviewLayout'

// Edit mode (T-89) lives in its own chunk, so normal use never loads it.
const EditBar = lazy(() => import('../components/overview-edit/EditChrome').then((m) => ({ default: m.EditBar })))
const CardToolbar = lazy(() =>
  import('../components/overview-edit/EditChrome').then((m) => ({ default: m.CardToolbar })),
)

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

  // Every block is a card with a stable id (lib/overviewCards.ts). The layout is an
  // ordered list of cards with a width each, and the cards render in that order, so the
  // DOM order, and so the Tab order, equals the visual order at every width. The grid
  // places them with plain row-major flow (see .ov-bento in styles.css): no explicit rows
  // and no reordering. Each card sits in a keyed cell, so panel state and the editor
  // survive a reorder or a resize. The layout is the user's saved one, or the default.
  const saved = useOverviewLayout()
  const wide = useMediaQuery('(min-width: 961px)')
  const [editLayout, setEditLayout] = useState(false)
  // The layout being shown while edits are in flight (and for good in the demo, where a
  // save is a silent no-op, so a demo layout lasts until the page reloads). In a real
  // account it clears itself once the saved layout catches up.
  const [local, setLocal] = useState<ResolvedLayout | null>(null)
  const demo = isDemo()
  const layout = local ?? saved
  useEffect(() => {
    if (!demo && local && saved && sameLayout(local, saved)) setLocal(null)
  }, [demo, local, saved])
  const changeLayout = useCallback((next: ResolvedLayout) => {
    setLocal(next)
    void saveOverviewLayout(next)
  }, [])
  const resetLayout = useCallback(() => {
    setLocal({ cards: [...DEFAULT_LAYOUT.cards], hidden: [...DEFAULT_LAYOUT.hidden] })
    void resetOverviewLayout()
  }, [])
  const toggleEdit = () => {
    if (editLayout) {
      setEditLayout(false)
      // Put focus back on the button that opened edit mode.
      setTimeout(() => document.querySelector<HTMLElement>('[data-edit-focus="hero:edit-layout"]')?.focus(), 0)
    } else setEditLayout(true)
  }
  const nodes: Record<CardId, ReactNode> = {
    world: (
      <CollapsePanel
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
    ),
    next: (
      <div className="ov-next">
        <NextSessionCard campaign={campaign} />
      </div>
    ),
    prep: <PrepCard campaign={campaign} data={data} />,
    run: <RunCard campaign={campaign} data={data} />,
    lore: <WorldLoreCard campaign={campaign} data={data} />,
    reference: <ReferenceCard campaign={campaign} data={data} />,
    'recent-sessions': (
      <section className="ov-panel ov-recent">
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
    ),
    'prep-checklist': <PrepChecklistCard campaign={campaign} data={data} />,
    'recently-edited': <RecentlyEditedCard data={data} />,
    'links-voice': <LinksVoiceCard campaign={campaign} />,
  }

  return (
    <div>
      <CampaignHero
        campaign={campaign}
        onOpenSettings={() => setSettingsOpen(true)}
        editingLayout={editLayout}
        onToggleEditLayout={toggleEdit}
      />

      {editLayout && layout && (
        <Suspense fallback={null}>
          <EditBar layout={layout} wide={wide} onChange={changeLayout} onReset={resetLayout} onDone={toggleEdit} />
        </Suspense>
      )}

      {!editLayout && layout && layout.cards.length === 0 && (
        <section className="ov-panel ov-empty-layout" aria-label="All cards hidden">
          <p style={{ margin: 0 }}>Every card on this page is hidden.</p>
          <div className="ov-empty-layout-actions">
            <button className="btn small" onClick={toggleEdit}>
              <Icon name="pencil" size={13} /> Edit layout
            </button>
            <button className="btn small" onClick={resetLayout}>
              Reset layout
            </button>
          </div>
        </section>
      )}

      <div className={`ov-bento${editLayout ? ' is-editing' : ''}`}>
        {layout?.cards.map((c) => {
          // Cards that read the local data render nothing until it loads; skip their cell
          // so an empty cell does not add a grid gap.
          const waiting = !data && ['prep', 'run', 'lore', 'reference', 'prep-checklist', 'recently-edited'].includes(c.id)
          if (waiting) return null
          return (
            <div
              key={c.id}
              data-card-id={c.id}
              className={`ov-cell${cardDef(c.id)?.cellClass ? ` ${cardDef(c.id)!.cellClass}` : ''}`}
              style={{ '--span': c.span } as CSSProperties}
            >
              {editLayout ? (
                <Suspense fallback={null}>
                  <CardToolbar id={c.id} layout={layout!} wide={wide} onChange={changeLayout} />
                </Suspense>
              ) : null}
              {/* Display: contents, so the card is still the cell's flex child. While editing
                  the card is inert: nothing inside it can be focused or clicked. */}
              <div className="ov-card-body" {...(editLayout ? ({ inert: '' } as object) : {})}>
                {nodes[c.id]}
              </div>
            </div>
          )
        })}
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
