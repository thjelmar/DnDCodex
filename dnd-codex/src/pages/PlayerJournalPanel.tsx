import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createPlayerNote, updatePlayerNote } from '../db/repo'
import { RichTextEditor } from '../components/RichTextEditor'
import { Icon } from '../components/Icon'
import { formatDate, todayISODate } from '../lib/format'
import type { Id, PlayerNote } from '../db/types'

/**
 * The player's own Session Journal beside their full-screen battle map: pick an
 * entry (newest first) or start today's, and write as you play. These are the
 * same private journal entries as on the player home, autosaved locally.
 */
export function PlayerJournalPanel({ campaignId }: { campaignId: Id }) {
  const entries = useLiveQuery(
    async () => {
      const list = await db.playerNotes.where('campaignId').equals(campaignId).filter((n) => n.section === 'journal').toArray()
      return list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt))
    },
    [campaignId],
  )
  const [picked, setPicked] = useState<Id | null>(null)
  const entry = entries?.find((e) => e.id === picked) ?? entries?.[0] ?? null

  async function newEntry() {
    const today = todayISODate()
    const n = await createPlayerNote(campaignId, { section: 'journal', date: today, title: `Session — ${formatDate(today)}` })
    setPicked(n.id)
  }

  return (
    <>
      <div className="row" style={{ gap: 8 }}>
        {entries && entries.length > 1 && (
          <select className="select" style={{ flex: 1 }} value={entry?.id ?? ''} onChange={(e) => setPicked(e.target.value)} aria-label="Journal entry">
            {entries.map((e) => (
              <option key={e.id} value={e.id}>{e.title}{e.date ? ` — ${formatDate(e.date)}` : ''}</option>
            ))}
          </select>
        )}
        <button className="btn small" onClick={newEntry} title="Start a new journal entry for today">
          <Icon name="plus" size={13} /> New entry
        </button>
      </div>
      {entry ? (
        <JournalEditor key={entry.id} entry={entry} />
      ) : entries ? (
        <p className="faint">No journal entries yet. Start one to take notes while you play.</p>
      ) : null}
    </>
  )
}

function JournalEditor({ entry }: { entry: PlayerNote }) {
  const [title, setTitle] = useState(entry.title)
  const [body, setBody] = useState(entry.body)
  useEffect(() => {
    if (title === entry.title && body === entry.body) return
    const t = setTimeout(() => updatePlayerNote(entry.id, { title, body }), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, entry.id])

  return (
    <>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Entry title" style={{ fontWeight: 600 }} />
      <RichTextEditor
        campaignId={entry.campaignId}
        value={body}
        onChange={setBody}
        label="📓 Session journal"
        placeholder="What’s happening? Names, clues, loot…"
        minHeight={260}
      />
      <div className="faint" style={{ fontSize: 12 }}>Autosaves as you type. Only you can see your journal.</div>
    </>
  )
}
