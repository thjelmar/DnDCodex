import { useState } from 'react'
import { formatDate } from '../lib/format'
import type { SharedEntityRow } from '../auth/cloud'
import type { PlayerNote } from '../db/types'

// "Story So Far" — the player-facing recap timeline. It compiles two sources into
// one chronological "previously on…" log (newest first):
//   • DM recaps — sessions the DM shared (reveal section `recap`), authoritative.
//   • Your notes — the player's OWN journal entries, so there's still a recap to
//     read when the DM hasn't gotten around to writing one.
// Each entry is tagged by source and can be filtered. Accordion: the most recent
// entry is open by default; older ones expand on click. Purely local + read-only —
// DM recap HTML was already spoiler-redacted at push time; your own notes are yours.

type Source = 'dm' | 'you'

interface RecapEntry {
  id: string
  title: string
  date: string
  html: string
  source: Source
}

/** True when the HTML has anything worth showing after tags are stripped. */
function hasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0 || /<img/i.test(html)
}

function buildEntries(sharedRows: SharedEntityRow[], journal: PlayerNote[]): RecapEntry[] {
  const entries: RecapEntry[] = []

  for (const r of sharedRows) {
    if (r.data.kind !== 'session') continue
    const html = r.data.sections?.find((s) => s.key === 'recap')?.html
    if (!html) continue
    entries.push({ id: r.id, title: r.data.title || 'Session', date: r.data.subtitle ?? '', html, source: 'dm' })
  }

  for (const n of journal) {
    if (!hasText(n.body) && !n.title.trim()) continue
    entries.push({
      id: n.id,
      title: n.title.trim() || (n.date ? formatDate(n.date) : 'Journal entry'),
      date: n.date ?? '',
      html: n.body || '',
      source: 'you',
    })
  }

  // Newest date first; undated entries sink to the bottom. On a tied date the DM's
  // recap leads its matching player note.
  entries.sort((a, b) => {
    if (a.date !== b.date) {
      if (!a.date) return 1
      if (!b.date) return -1
      return b.date.localeCompare(a.date)
    }
    if (a.source !== b.source) return a.source === 'dm' ? -1 : 1
    return 0
  })
  return entries
}

export function RecapTimeline({ sharedRows, journal }: { sharedRows: SharedEntityRow[]; journal: PlayerNote[] }) {
  const all = buildEntries(sharedRows, journal)
  const [filter, setFilter] = useState<'all' | Source>('all')
  // undefined = untouched (default the newest open); null = user collapsed all.
  const [openId, setOpenId] = useState<string | null | undefined>(undefined)

  if (all.length === 0) return null

  const hasDm = all.some((e) => e.source === 'dm')
  const hasYou = all.some((e) => e.source === 'you')
  const entries = filter === 'all' ? all : all.filter((e) => e.source === filter)

  const effectiveOpen = openId === undefined ? all[0].id : openId
  const toggle = (id: string) => setOpenId(effectiveOpen === id ? null : id)

  return (
    <div style={{ marginBottom: 24 }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 className="mb-0" style={{ fontSize: 20 }}>
          <span aria-hidden style={{ marginRight: 8 }}>📜</span>
          Story So Far
          <span className="faint" style={{ fontSize: 14, marginLeft: 8 }}>{entries.length}</span>
        </h2>
        {hasDm && hasYou && (
          <div className="seg-filter" role="group" aria-label="Filter recaps by source">
            {(['all', 'dm', 'you'] as const).map((f) => (
              <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'dm' ? 'DM' : 'My notes'}
              </button>
            ))}
          </div>
        )}
      </div>
      {!hasDm && (
        <p className="faint" style={{ margin: '0 0 10px' }}>
          Your DM hasn’t shared a recap yet — here’s the story from your own journal entries.
        </p>
      )}
      <div className="recap-timeline">
        {entries.map((e) => {
          const open = effectiveOpen === e.id
          return (
            <div key={e.id} className={`recap-entry${open ? ' open' : ''}`}>
              <span className="recap-dot" aria-hidden />
              <button className="recap-head" onClick={() => toggle(e.id)} aria-expanded={open}>
                <span className="recap-date">{e.date ? formatDate(e.date) : 'Undated'}</span>
                <span className="recap-title">{e.title}</span>
                <span className={`recap-src ${e.source}`} title={e.source === 'dm' ? 'Shared by your DM' : 'From your own notes'}>
                  {e.source === 'dm' ? 'DM' : 'You'}
                </span>
                <span className="recap-caret" aria-hidden>{open ? '▾' : '▸'}</span>
              </button>
              {open && (
                <div className="recap-body rte">
                  <div className="rte-content" dangerouslySetInnerHTML={{ __html: e.html }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
