import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  createPlayerNote,
  updatePlayerNote,
  deletePlayerNote,
  updateCampaign,
  deleteCampaign,
  createLink,
} from '../db/repo'
import { RichTextEditor } from '../components/RichTextEditor'
import { TagInput, TagChips } from '../components/TagInput'
import { CampaignLinks } from '../components/CampaignLinks'
import { ThoughtMap, type MapConfig } from '../components/ThoughtMap'
import { Modal } from '../components/Modal'
import { useConfirm } from '../components/ConfirmDialog'
import { disconnectEdge, disconnectNode, type CampaignGraph } from '../lib/graph'
import { buildPlayerGraph, PLAYER_KIND_META, PLAYER_MAP_SECTIONS } from '../lib/playerGraph'
import { formatDate } from '../lib/format'
import type { PlayerNote, PlayerNoteSection } from '../db/types'

interface SectionDef {
  key: PlayerNoteSection
  label: string
  icon: string
  blurb: string
  addLabel: string
}
const SECTIONS: SectionDef[] = [
  { key: 'journal', label: 'Session Journal', icon: '📓', blurb: 'What happened, session by session.', addLabel: 'Add entry' },
  { key: 'character', label: 'My Character', icon: '🧝', blurb: 'Your PC — sheet notes, backstory, goals.', addLabel: 'Add page' },
  { key: 'quests', label: 'Quests', icon: '⚔️', blurb: 'Objectives, leads, and loose threads.', addLabel: 'Add quest' },
  { key: 'people', label: 'People & Places', icon: '🧑', blurb: "NPCs you've met and where you've been.", addLabel: 'Add entry' },
  { key: 'notes', label: 'Loose Notes', icon: '📝', blurb: 'Anything else worth remembering.', addLabel: 'Add note' },
]

const QUEST_STATUS: { value: string; label: string; color: string }[] = [
  { value: 'active', label: 'Active', color: 'var(--accent)' },
  { value: 'completed', label: 'Completed', color: 'var(--good)' },
  { value: 'failed', label: 'Failed', color: 'var(--danger)' },
]

export function PlayerNotesPage() {
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()

  const campaign = useLiveQuery(
    () => (campaignId ? db.campaigns.get(campaignId) : undefined),
    [campaignId],
  )
  const notes = useLiveQuery(
    () =>
      campaignId
        ? db.playerNotes.where('campaignId').equals(campaignId).toArray()
        : Promise.resolve<PlayerNote[]>([]),
    [campaignId],
  )

  const [searchParams] = useSearchParams()
  const sel = searchParams.get('sel')
  const [editingId, setEditingId] = useState<string | null>(() => sel)
  useEffect(() => {
    if (sel) setEditingId(sel)
  }, [sel])
  const editing = notes?.find((n) => n.id === editingId) ?? null

  // Local name state for inline rename (debounced autosave).
  const [name, setName] = useState('')
  useEffect(() => {
    if (campaign) setName(campaign.name)
  }, [campaign?.id])
  useEffect(() => {
    if (!campaign || name === campaign.name) return
    const t = setTimeout(() => updateCampaign(campaign.id, { name }), 500)
    return () => clearTimeout(t)
  }, [name, campaign])

  const bySection = useMemo(() => {
    const map = new Map<PlayerNoteSection, PlayerNote[]>()
    for (const n of notes ?? []) {
      if (!map.has(n.section)) map.set(n.section, [])
      map.get(n.section)!.push(n)
    }
    // Journal newest-first by date; everything else most-recently-edited.
    for (const [key, list] of map) {
      if (key === 'journal') list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      else list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    return map
  }, [notes])

  const playerGraph = useLiveQuery(
    () => (campaignId ? buildPlayerGraph(campaignId) : Promise.resolve<CampaignGraph>({ nodes: [], edges: [] })),
    [campaignId],
  )
  const mapConfig = useMemo<MapConfig>(
    () => ({
      meta: PLAYER_KIND_META,
      kinds: PLAYER_MAP_SECTIONS,
      onConnect: async (from, to, label) => {
        await createLink(campaignId!, 'playernote', from.id, 'playernote', to.id, label)
      },
      onDisconnectEdge: (edge) => disconnectEdge(edge),
      onDisconnectNode: (node) => disconnectNode(campaignId!, node),
      onOpen: (node) => setEditingId(node.id),
      emptyHint: 'Add People & Places and Quests above, then drag bubbles together to map how they connect.',
      gapLabel: 'Loose ends',
      gapWord: 'loose end',
    }),
    [campaignId],
  )

  if (campaign === undefined) return <div className="content faint">Loading…</div>
  if (!campaign || !campaignId) {
    return (
      <div className="content">
        <div className="empty">
          <div className="big">📓</div>
          <p>That campaign doesn't exist.</p>
          <Link className="btn" to="/">
            Back to campaigns
          </Link>
        </div>
      </div>
    )
  }

  async function addTo(section: PlayerNoteSection) {
    const n = await createPlayerNote(campaignId!, { section })
    setEditingId(n.id)
  }

  async function removeCampaign() {
    if (
      await confirm({
        title: 'Remove this campaign?',
        message: (
          <>
            Remove <strong>{campaign!.name}</strong> and all of your notes for it? This can't be
            undone.
          </>
        ),
        confirmLabel: 'Remove',
        danger: true,
      })
    ) {
      await deleteCampaign(campaign!.id)
      navigate('/')
    }
  }

  return (
    <div className="content">
      <div className="row" style={{ gap: 12, marginBottom: 4 }}>
        <span
          aria-hidden
          style={{ width: 14, height: 14, borderRadius: '50%', background: campaign.color, display: 'inline-block', flexShrink: 0 }}
        />
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Campaign name"
          style={{
            border: 'none',
            background: 'transparent',
            fontFamily: 'var(--serif)',
            fontSize: 30,
            fontWeight: 600,
            padding: 0,
            color: 'var(--text)',
          }}
        />
      </div>
      <div className="subtitle" style={{ marginBottom: 14 }}>
        A campaign you're playing in — your journal, character, and notes.
      </div>

      <div style={{ marginBottom: 24 }}>
        <CampaignLinks campaignId={campaign.id} links={campaign.externalLinks ?? []} />
      </div>

      {SECTIONS.map((section) => {
        const entries = bySection.get(section.key) ?? []
        return (
          <div key={section.key} style={{ marginBottom: 24 }}>
            <div className="row between" style={{ marginBottom: 4 }}>
              <h2 className="mb-0" style={{ fontSize: 20 }}>
                <span aria-hidden style={{ marginRight: 8 }}>{section.icon}</span>
                {section.label}
                {entries.length > 0 && (
                  <span className="faint" style={{ fontSize: 14, marginLeft: 8 }}>{entries.length}</span>
                )}
              </h2>
              <button className="btn small" onClick={() => addTo(section.key)}>
                ＋ {section.addLabel}
              </button>
            </div>
            {entries.length === 0 ? (
              <p className="faint" style={{ margin: '4px 0 0' }}>{section.blurb}</p>
            ) : (
              <div style={{ marginTop: 8 }}>
                {entries.map((n) => (
                  <EntryRow key={n.id} note={n} campaignId={campaign.id} onOpen={() => setEditingId(n.id)} />
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div style={{ marginBottom: 24 }}>
        <div className="row between" style={{ marginBottom: 4 }}>
          <h2 className="mb-0" style={{ fontSize: 20 }}>
            <span aria-hidden style={{ marginRight: 8 }}>🕸️</span>
            Map
          </h2>
        </div>
        <p className="faint" style={{ margin: '4px 0 10px' }}>
          Your People &amp; Places and Quests as a web — drag a bubble onto another to connect them, and spot who
          you haven’t tied in yet.
        </p>
        <ThoughtMap graph={playerGraph} config={mapConfig} />
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '28px 0 16px' }} />
      <button className="btn danger small" onClick={removeCampaign}>
        Remove this campaign
      </button>

      {editing && (
        <PlayerEntryModal key={editing.id} note={editing} onClose={() => setEditingId(null)} />
      )}
    </div>
  )
}

function EntryRow({ note, campaignId, onOpen }: { note: PlayerNote; campaignId: string; onOpen: () => void }) {
  const status = QUEST_STATUS.find((s) => s.value === note.status)
  return (
    <div
      className="list-row"
      style={{ cursor: 'pointer', alignItems: 'center' }}
      onClick={onOpen}
    >
      <div className="row" style={{ gap: 10, minWidth: 0 }}>
        {note.section === 'journal' && note.date && (
          <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(note.date)}</span>
        )}
        {note.section === 'quests' && status && (
          <span className="tag" style={{ color: status.color, fontSize: 11 }}>{status.label}</span>
        )}
        <span className="title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note.title}
        </span>
      </div>
      <TagChips campaignId={campaignId} tags={note.tags} size="small" />
    </div>
  )
}

function PlayerEntryModal({ note, onClose }: { note: PlayerNote; onClose: () => void }) {
  const confirm = useConfirm()
  const section = SECTIONS.find((s) => s.key === note.section)
  const [title, setTitle] = useState(note.title)
  const [tags, setTags] = useState(note.tags)
  const [body, setBody] = useState(note.body)
  const [date, setDate] = useState(note.date)
  const [status, setStatus] = useState(note.status)

  useEffect(() => {
    const t = setTimeout(() => {
      updatePlayerNote(note.id, { title, tags, body, date, status })
    }, 500)
    return () => clearTimeout(t)
  }, [title, tags, body, date, status, note.id])

  return (
    <Modal
      title={`${section?.icon ?? ''} ${section?.label ?? 'Entry'}`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn danger"
            style={{ marginRight: 'auto' }}
            onClick={async () => {
              if (
                await confirm({
                  title: 'Delete entry?',
                  message: (
                    <>
                      Delete <strong>{note.title}</strong>? This can't be undone.
                    </>
                  ),
                  confirmLabel: 'Delete',
                  danger: true,
                })
              ) {
                await deletePlayerNote(note.id)
                onClose()
              }
            }}
          >
            Delete
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="field">
        <label>Title</label>
        <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {note.section === 'journal' && (
        <div className="field" style={{ maxWidth: 200 }}>
          <label>Session date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      )}
      {note.section === 'quests' && (
        <div className="field" style={{ maxWidth: 220 }}>
          <label>Status</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {QUEST_STATUS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label>Tags</label>
        <TagInput campaignId={note.campaignId} tags={tags} onChange={setTags} />
      </div>

      <RichTextEditor
        campaignId={note.campaignId}
        value={body}
        onChange={setBody}
        label="Notes"
        placeholder="Write freely — supports formatting, [[wiki links]], and images."
        minHeight={180}
      />

      <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Autosaves as you type.</div>
    </Modal>
  )
}
