import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createNote, updateNote, deleteNote } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { CampaignMarkdown } from '../components/CampaignMarkdown'
import type { Note } from '../db/types'

export function NotesPage() {
  const campaign = useCampaign()
  const notes = useLiveQuery(
    () => db.notes.where('campaignId').equals(campaign.id).sortBy('title'),
    [campaign.id],
  )

  const [searchParams] = useSearchParams()
  const sel = searchParams.get('sel')
  const [selectedId, setSelectedId] = useState<string | null>(() => sel)
  useEffect(() => {
    if (sel) setSelectedId(sel)
  }, [sel])
  const selected = notes?.find((n) => n.id === selectedId) ?? null

  async function add() {
    const n = await createNote(campaign.id)
    setSelectedId(n.id)
  }

  // Group notes by category for the sidebar.
  const grouped = new Map<string, Note[]>()
  for (const n of notes ?? []) {
    const key = n.category || 'Uncategorized'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(n)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <button className="btn primary" style={{ width: '100%', marginBottom: 12 }} onClick={add}>
          ＋ New Note
        </button>
        {notes?.length === 0 && <p className="faint">No world notes yet.</p>}
        {[...grouped.entries()].map(([category, group]) => (
          <div key={category} style={{ marginBottom: 12 }}>
            <div className="sidebar-heading" style={{ margin: '4px 4px' }}>
              {category}
            </div>
            {group.map((n) => (
              <div
                key={n.id}
                className="list-row"
                style={{ cursor: 'pointer', borderColor: n.id === selectedId ? 'var(--accent)' : undefined }}
                onClick={() => setSelectedId(n.id)}
              >
                <div className="title">{n.title}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div>
        {selected ? (
          <NoteEditor key={selected.id} note={selected} onDelete={() => setSelectedId(null)} />
        ) : (
          <div className="empty">
            <div className="big">📖</div>
            <p>Select a note or create one to start building your world.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function NoteEditor({ note, onDelete }: { note: Note; onDelete: () => void }) {
  const [title, setTitle] = useState(note.title)
  const [category, setCategory] = useState(note.category)
  const [body, setBody] = useState(note.body)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      updateNote(note.id, { title, category, body })
    }, 500)
    return () => clearTimeout(t)
  }, [title, category, body, note.id])

  return (
    <div>
      <div className="form-row" style={{ gridTemplateColumns: '1fr 200px' }}>
        <div className="field">
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Category</label>
          <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Lore, Factions…" />
        </div>
      </div>

      <div className="row between" style={{ marginBottom: 6 }}>
        <label className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
          Body
        </label>
        <button className="btn ghost small" onClick={() => setPreview((p) => !p)}>
          {preview ? '✎ Edit' : '👁 Preview'}
        </button>
      </div>
      {preview ? (
        <div className="card" style={{ cursor: 'default' }}>
          <CampaignMarkdown campaignId={note.campaignId} text={body} />
        </div>
      ) : (
        <textarea
          className="textarea tall"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write freely. Supports **markdown** and [[wiki links]]."
        />
      )}

      <div className="row between" style={{ marginTop: 18 }}>
        <span className="faint" style={{ fontSize: 12 }}>Autosaves as you type.</span>
        <button
          className="btn danger small"
          onClick={async () => {
            if (confirm(`Delete "${note.title}"?`)) {
              await deleteNote(note.id)
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
