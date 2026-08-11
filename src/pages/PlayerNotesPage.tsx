import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createPlayerNote, updatePlayerNote, deletePlayerNote } from '../db/repo'
import { RichTextEditor } from '../components/RichTextEditor'
import { TagInput, TagChips } from '../components/TagInput'
import type { PlayerNote } from '../db/types'

// Standalone page (outside the DM CampaignLayout) for a player's personal notes
// on one campaign. Reached from the Player → Notes nav section.
export function PlayerNotesPage() {
  const { campaignId } = useParams()
  const campaign = useLiveQuery(
    () => (campaignId ? db.campaigns.get(campaignId) : undefined),
    [campaignId],
  )
  const notes = useLiveQuery(
    () =>
      campaignId
        ? db.playerNotes.where('campaignId').equals(campaignId).sortBy('title')
        : Promise.resolve<PlayerNote[]>([]),
    [campaignId],
  )

  const [searchParams] = useSearchParams()
  const sel = searchParams.get('sel')
  const [selectedId, setSelectedId] = useState<string | null>(() => sel)
  useEffect(() => {
    if (sel) setSelectedId(sel)
  }, [sel])
  const selected = notes?.find((n) => n.id === selectedId) ?? null

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

  async function add() {
    const n = await createPlayerNote(campaignId!)
    setSelectedId(n.id)
  }

  return (
    <div className="content">
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="row" style={{ gap: 12 }}>
          <span aria-hidden style={{ fontSize: 22 }}>
            📓
          </span>
          <div>
            <h1 className="mb-0">Player Notes</h1>
            <div className="subtitle" style={{ margin: 0 }}>
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: campaign.color,
                  marginRight: 6,
                }}
              />
              {campaign.name}
            </div>
          </div>
        </div>
        <Link to={`/campaign/${campaign.id}`} className="btn ghost small">
          DM view →
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start', marginTop: 20 }}>
        <div>
          <button className="btn primary" style={{ width: '100%', marginBottom: 12 }} onClick={add}>
            ＋ New Note
          </button>
          {notes?.length === 0 && <p className="faint">No player notes yet for this campaign.</p>}
          {notes?.map((n) => (
            <div
              key={n.id}
              className="list-row"
              style={{
                cursor: 'pointer',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 6,
                borderColor: n.id === selectedId ? 'var(--accent)' : undefined,
              }}
              onClick={() => setSelectedId(n.id)}
            >
              <div className="title">{n.title}</div>
              <TagChips campaignId={campaign.id} tags={n.tags} size="small" />
            </div>
          ))}
        </div>

        <div>
          {selected ? (
            <PlayerNoteEditor key={selected.id} note={selected} onDelete={() => setSelectedId(null)} />
          ) : (
            <div className="empty">
              <div className="big">✍️</div>
              <p>Select a note or create one to jot down what happens in your sessions.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlayerNoteEditor({ note, onDelete }: { note: PlayerNote; onDelete: () => void }) {
  const [title, setTitle] = useState(note.title)
  const [tags, setTags] = useState(note.tags)
  const [body, setBody] = useState(note.body)

  useEffect(() => {
    const t = setTimeout(() => {
      updatePlayerNote(note.id, { title, tags, body })
    }, 500)
    return () => clearTimeout(t)
  }, [title, tags, body, note.id])

  return (
    <div>
      <div className="field">
        <label>Title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>Tags</label>
        <TagInput campaignId={note.campaignId} tags={tags} onChange={setTags} />
      </div>

      <RichTextEditor
        campaignId={note.campaignId}
        value={body}
        onChange={setBody}
        label="Body"
        placeholder="Your notes from the session — what happened, clues, NPCs you met, plans…"
        minHeight={220}
      />

      <div className="row between" style={{ marginTop: 18 }}>
        <span className="faint" style={{ fontSize: 12 }}>Autosaves as you type.</span>
        <button
          className="btn danger small"
          onClick={async () => {
            if (confirm(`Delete "${note.title}"?`)) {
              await deletePlayerNote(note.id)
              onDelete()
            }
          }}
        >
          Delete note
        </button>
      </div>
    </div>
  )
}
