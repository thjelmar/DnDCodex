import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useCampaign } from './CampaignLayout'
import {
  createPlotThread, updatePlotThread, deletePlotThread,
  createTimelineEvent, updateTimelineEvent, deleteTimelineEvent,
} from '../db/repo'
import { RichTextEditor } from '../components/RichTextEditor'
import { Modal } from '../components/Modal'
import { Icon } from '../components/Icon'
import { useConfirm } from '../components/ConfirmDialog'
import { checkTimeline, reorderByYear, type TimelineIssue } from '../lib/timelineCheck'
import type { PlotThread, TimelineEvent, ThreadStatus, EventRef } from '../db/types'

const STATUS_META: Record<ThreadStatus, { label: string; color: string }> = {
  foreshadowed: { label: 'Foreshadowed', color: '#7f77dd' },
  open: { label: 'Open', color: '#ba7517' },
  resolved: { label: 'Resolved', color: '#1d9e75' },
}
const THREAD_COLORS = ['#7f77dd', '#1d9e75', '#d4537e', '#378add', '#ba7517', '#e2504a', '#888780']
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/** The campaign timeline: dated in-world events grouped into plot threads with a
 *  running status. A chronological complement to the Thought Map for DM prep. */
export function TimelinePage() {
  const campaign = useCampaign()
  const cid = campaign.id

  const threads = useLiveQuery(() => db.plotThreads.where('campaignId').equals(cid).toArray(), [cid]) ?? []
  const events = useLiveQuery(() => db.timelineEvents.where('campaignId').equals(cid).sortBy('sortKey'), [cid]) ?? []

  const [threadFilter, setThreadFilter] = useState<string | null>(null)
  const [editEvent, setEditEvent] = useState<TimelineEvent | null>(null)
  const [editThread, setEditThread] = useState<PlotThread | null>(null)
  const [checkOpen, setCheckOpen] = useState(false)

  const issues = useMemo(() => checkTimeline(events, threads), [events, threads])
  const warnCount = issues.filter((i) => i.severity === 'warn').length

  const threadById = useMemo(() => new Map(threads.map((t) => [t.id, t])), [threads])
  const shown = threadFilter ? events.filter((e) => e.threadId === threadFilter) : events

  async function newEvent() {
    const e = await createTimelineEvent(cid, { threadId: threadFilter })
    setEditEvent(e)
  }
  async function newThread() {
    const t = await createPlotThread(cid)
    setEditThread(t)
  }

  return (
    <div className="timeline-page">
      <div className="row between" style={{ alignItems: 'baseline', marginBottom: 4 }}>
        <h2 className="mb-0">Timeline</h2>
        <div className="row" style={{ gap: 8 }}>
          {events.length > 0 && (
            <button className={`btn small${warnCount ? ' has-issues' : ''}`} onClick={() => setCheckOpen(true)} title="Check the timeline for ordering issues">
              <Icon name={warnCount ? 'bug' : 'check'} size={14} /> Check{warnCount ? ` · ${warnCount}` : ''}
            </button>
          )}
          <button className="btn primary small" onClick={newEvent}><Icon name="plus" size={14} color="inherit" /> New event</button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 16 }}>
        In-world dated events and the plot threads they belong to — a chronological view of your world.
      </p>

      <div className="timeline-layout">
        <div className="timeline-main">
          {events.length === 0 ? (
            <div className="empty"><p>No events yet. Add the first beat of your story.</p></div>
          ) : shown.length === 0 ? (
            <p className="faint">No events in this thread yet.</p>
          ) : (
            <ol className="timeline-list">
              {shown.map((e) => {
                const thread = e.threadId ? threadById.get(e.threadId) : null
                const preview = stripHtml(e.body)
                return (
                  <li key={e.id} className="timeline-item">
                    <span className="timeline-dot" style={{ background: thread?.color ?? 'var(--border-strong)' }} />
                    <button className="timeline-card" onClick={() => setEditEvent(e)}>
                      <div className="row between" style={{ alignItems: 'baseline', gap: 8 }}>
                        <span className="timeline-date">{e.dateLabel || <span className="faint">(no date)</span>}{typeof e.year === 'number' && <span className="faint"> · yr {e.year}</span>}</span>
                        {thread && (
                          <span className="timeline-thread" style={{ borderColor: thread.color }}>
                            {thread.name}
                            <span className="timeline-status" style={{ color: STATUS_META[thread.status].color }}>· {STATUS_META[thread.status].label}</span>
                          </span>
                        )}
                      </div>
                      <div className="timeline-title">{e.title}</div>
                      {preview && <div className="timeline-preview">{preview.slice(0, 160)}{preview.length > 160 ? '…' : ''}</div>}
                      {e.refs.length > 0 && (
                        <div className="timeline-refs">{e.refs.length} link{e.refs.length === 1 ? '' : 's'}</div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <aside className="timeline-aside">
          <div className="row between" style={{ alignItems: 'center', marginBottom: 8 }}>
            <div className="sidebar-heading" style={{ margin: 0 }}>Plot threads</div>
            <button className="btn ghost small" onClick={newThread}><Icon name="plus" size={13} /> New</button>
          </div>
          <button className={`timeline-threadrow${threadFilter === null ? ' on' : ''}`} onClick={() => setThreadFilter(null)}>
            <span className="timeline-dot sm" style={{ background: 'var(--border-strong)' }} />
            <span style={{ flex: 1, textAlign: 'left' }}>All events</span>
            <span className="faint">{events.length}</span>
          </button>
          {threads.map((t) => {
            const n = events.filter((e) => e.threadId === t.id).length
            return (
              <div key={t.id} className={`timeline-threadrow${threadFilter === t.id ? ' on' : ''}`}>
                <button className="timeline-threadrow-main" onClick={() => setThreadFilter(threadFilter === t.id ? null : t.id)}>
                  <span className="timeline-dot sm" style={{ background: t.color }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    {t.name}
                    <span className="timeline-status" style={{ color: STATUS_META[t.status].color, display: 'block', fontSize: 11 }}>{STATUS_META[t.status].label}</span>
                  </span>
                  <span className="faint">{n}</span>
                </button>
                <button className="btn ghost small" aria-label="Edit thread" onClick={() => setEditThread(t)}><Icon name="pencil" size={12} /></button>
              </div>
            )
          })}
          {threads.length === 0 && <p className="faint" style={{ fontSize: 13 }}>No threads yet. Group events into arcs (a mystery, a war, a prophecy).</p>}
        </aside>
      </div>

      {editEvent && <EventModal key={editEvent.id} event={editEvent} threads={threads} onClose={() => setEditEvent(null)} />}
      {editThread && <ThreadModal key={editThread.id} thread={editThread} onClose={() => setEditThread(null)} />}
      {checkOpen && (
        <CheckModal
          issues={issues}
          events={events}
          onClose={() => setCheckOpen(false)}
          onGoto={(id) => { const e = events.find((x) => x.id === id); if (e) { setCheckOpen(false); setEditEvent(e) } }}
        />
      )}
    </div>
  )
}

function CheckModal({ issues, events, onClose, onGoto }: { issues: TimelineIssue[]; events: TimelineEvent[]; onClose: () => void; onGoto: (id: string) => void }) {
  const reorder = reorderByYear(events)
  const canReorder = issues.some((i) => i.kind === 'order' || i.kind === 'thread-order') && reorder.length > 0
  const applyReorder = async () => {
    for (const r of reorder) await updateTimelineEvent(r.id, { sortKey: r.sortKey })
  }
  return (
    <Modal
      title="Timeline check"
      onClose={onClose}
      footer={
        <>
          {canReorder && <button className="btn" onClick={applyReorder}><Icon name="check" size={14} /> Reorder by year</button>}
          <button className="btn primary" onClick={onClose}>Done</button>
        </>
      }
    >
      {issues.length === 0 ? (
        <div className="row" style={{ gap: 8, alignItems: 'center', color: 'var(--good)' }}>
          <Icon name="check" size={18} color="inherit" /> No timeline issues found.
        </div>
      ) : (
        <>
          <p className="faint" style={{ marginTop: 0, fontSize: 12.5 }}>
            Checks the timeline’s own events against their in-world years. It doesn’t read descriptions.
          </p>
          <div className="timeline-issues">
            {issues.map((i) => (
              <div key={i.id} className={`timeline-issue ${i.severity}`}>
                <Icon name={i.severity === 'warn' ? 'bug' : 'eye'} size={15} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5 }}>{i.message}</div>
                  <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>{i.suggestion}</div>
                </div>
                {i.eventId && <button className="btn ghost small" onClick={() => onGoto(i.eventId!)}>Open</button>}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}

function EventModal({ event, threads, onClose }: { event: TimelineEvent; threads: PlotThread[]; onClose: () => void }) {
  const campaign = useCampaign()
  const cid = campaign.id
  const navigate = useNavigate()
  const confirm = useConfirm()
  const npcs = useLiveQuery(() => db.npcs.where('campaignId').equals(cid).sortBy('name'), [cid]) ?? []
  const locations = useLiveQuery(() => db.locations.where('campaignId').equals(cid).sortBy('name'), [cid]) ?? []
  const sessions = useLiveQuery(() => db.sessions.where('campaignId').equals(cid).reverse().sortBy('date'), [cid]) ?? []

  const [title, setTitle] = useState(event.title)
  const [dateLabel, setDateLabel] = useState(event.dateLabel)
  const [sortKey, setSortKey] = useState(event.sortKey)
  const [year, setYear] = useState<string>(event.year == null ? '' : String(event.year))
  const [threadId, setThreadId] = useState(event.threadId ?? '')
  const [body, setBody] = useState(event.body)
  const [refs, setRefs] = useState<EventRef[]>(event.refs)

  const save = () => updateTimelineEvent(event.id, { title: title.trim() || 'Untitled', dateLabel, sortKey, year: year.trim() === '' ? null : Number(year), threadId: threadId || null, body, refs })

  const nameFor = (r: EventRef) => {
    const list = r.kind === 'npc' ? npcs : r.kind === 'location' ? locations : sessions
    const hit = list.find((x) => x.id === r.id) as { name?: string; title?: string } | undefined
    return hit?.name ?? hit?.title ?? '(removed)'
  }
  const openRef = (r: EventRef) => {
    save()
    const seg = r.kind === 'npc' ? 'npcs' : r.kind === 'location' ? 'locations' : 'sessions'
    navigate(`/campaign/${cid}/${seg}?sel=${r.id}`)
    onClose()
  }
  const addRef = (v: string) => {
    if (!v) return
    const [kind, id] = v.split(':') as [EventRef['kind'], string]
    if (!refs.some((r) => r.kind === kind && r.id === id)) setRefs((prev) => [...prev, { kind, id }])
  }

  return (
    <Modal
      title="Timeline event"
      onClose={() => { save(); onClose() }}
      footer={
        <>
          <button
            className="btn danger small"
            onClick={async () => {
              if (await confirm({ title: 'Delete event?', message: <>Delete <strong>{title || 'this event'}</strong>? This can’t be undone.</>, confirmLabel: 'Delete', danger: true })) {
                await deleteTimelineEvent(event.id)
                onClose()
              }
            }}
          >Delete</button>
          <button className="btn primary" onClick={() => { save(); onClose() }}>Done</button>
        </>
      }
    >
      <div className="form-row" style={{ gridTemplateColumns: '1fr 135px 90px 80px' }}>
        <div className="field"><label>Title</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field"><label>In-world date</label><input className="input" value={dateLabel} placeholder="15 Flamerule, 1492 DR" onChange={(e) => setDateLabel(e.target.value)} /></div>
        <div className="field"><label title="In-world year as a number — used by the consistency check">Year</label><input className="input" type="number" value={year} placeholder="1492" onChange={(e) => setYear(e.target.value)} /></div>
        <div className="field"><label title="Lower = earlier in the list">Sort</label><input className="input" type="number" value={sortKey} onChange={(e) => setSortKey(Number(e.target.value) || 0)} /></div>
      </div>
      <div className="field">
        <label>Plot thread</label>
        <select className="input" value={threadId} onChange={(e) => setThreadId(e.target.value)}>
          <option value="">— none —</option>
          {threads.map((t) => <option key={t.id} value={t.id}>{t.name} ({STATUS_META[t.status].label})</option>)}
        </select>
      </div>
      <div className="field">
        <label>Links to</label>
        <select className="input" value="" onChange={(e) => addRef(e.target.value)}>
          <option value="">+ add a link…</option>
          <optgroup label="NPCs">{npcs.map((n) => <option key={n.id} value={`npc:${n.id}`}>{n.name}</option>)}</optgroup>
          <optgroup label="Locations">{locations.map((l) => <option key={l.id} value={`location:${l.id}`}>{l.name}</option>)}</optgroup>
          <optgroup label="Sessions">{sessions.map((s) => <option key={s.id} value={`session:${s.id}`}>{s.title || s.date}</option>)}</optgroup>
        </select>
        {refs.length > 0 && (
          <div className="timeline-refchips">
            {refs.map((r) => (
              <span key={`${r.kind}:${r.id}`} className="timeline-refchip">
                <button className="timeline-refchip-open" onClick={() => openRef(r)}>{nameFor(r)}</button>
                <button className="timeline-refchip-x" aria-label="Remove link" onClick={() => setRefs((prev) => prev.filter((x) => !(x.kind === r.kind && x.id === r.id)))}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      <RichTextEditor campaignId={cid} value={body} onChange={setBody} label="Details" placeholder="What happens, who's involved, consequences… use [[wiki links]] too." minHeight={140} />
    </Modal>
  )
}

function ThreadModal({ thread, onClose }: { thread: PlotThread; onClose: () => void }) {
  const confirm = useConfirm()
  const [name, setName] = useState(thread.name)
  const [status, setStatus] = useState<ThreadStatus>(thread.status)
  const [color, setColor] = useState(thread.color)
  const [description, setDescription] = useState(thread.description)
  const save = () => updatePlotThread(thread.id, { name: name.trim() || 'Untitled thread', status, color, description })

  return (
    <Modal
      title="Plot thread"
      onClose={() => { save(); onClose() }}
      footer={
        <>
          <button
            className="btn danger small"
            onClick={async () => {
              if (await confirm({ title: 'Delete thread?', message: <>Delete <strong>{name || 'this thread'}</strong>? Its events stay but become unthreaded.</>, confirmLabel: 'Delete', danger: true })) {
                await deletePlotThread(thread.id)
                onClose()
              }
            }}
          >Delete</button>
          <button className="btn primary" onClick={() => { save(); onClose() }}>Done</button>
        </>
      }
    >
      <div className="field"><label>Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="The Crimson Prophecy" /></div>
      <div className="field">
        <label>Status</label>
        <div className="dice-mode">
          {(['foreshadowed', 'open', 'resolved'] as ThreadStatus[]).map((s) => (
            <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>{STATUS_META[s].label}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Color</label>
        <div className="worldmap-swatches">
          {THREAD_COLORS.map((c) => (
            <button key={c} className={`worldmap-swatch${color === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => setColor(c)} />
          ))}
        </div>
      </div>
      <div className="field"><label>Notes (optional)</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this thread is about" /></div>
    </Modal>
  )
}
