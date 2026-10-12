import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createCampaign } from '../db/repo'
import { Modal } from '../components/Modal'
import { Icon, type IconName } from '../components/Icon'
import { useAuth } from '../auth/AuthProvider'
import { JoinCampaignModal } from '../auth/JoinCampaignModal'
import { AddPlayerCampaignModal } from '../components/AddPlayerCampaignModal'
import { todayISODate } from '../lib/format'
import type { Campaign } from '../db/types'

const COLORS = ['#7c3aed', '#db2777', '#0891b2', '#ca8a04', '#16a34a', '#dc2626', '#2563eb']

// Feature highlights for the empty-state hero. Icons are real IconName entries.
const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'book', title: 'Campaign codex', text: 'NPCs, locations, notes, and items — all linked together.' },
  { icon: 'map', title: 'Battle maps', text: 'A built-in VTT with tokens, fog of war, and live play.' },
  { icon: 'calendar', title: 'Scheduling', text: 'Set a date, let players RSVP, and get reminders.' },
  { icon: 'clock', title: 'Timeline', text: 'Dated events and plot threads, kept in order.' },
  { icon: 'pin', title: 'World map', text: 'Pin locations and share a read-only map with players.' },
  { icon: 'sparkles', title: 'Generators', text: 'Towns, taverns, NPC names, and plot hooks on tap.' },
]

const isPlayer = (c: Campaign) => c.role === 'player'
const routeFor = (c: Campaign) => (isPlayer(c) ? `/player/${c.id}` : `/campaign/${c.id}`)

/** "Friday, Oct 17 at 7:00 PM" (date only when no time is set). */
function formatWhen(date: string, time?: string | null): string {
  const hhmm = time && /^\d{2}:\d{2}$/.test(time) ? time : '12:00'
  const d = new Date(date.slice(0, 10) + 'T' + hhmm + ':00')
  if (isNaN(d.getTime())) return date
  const day = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  if (!time) return day
  return `${day} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}
/** Short "Fri, Oct 17" for the campaign cards. */
function shortWhen(date: string): string {
  const d = new Date(date.slice(0, 10) + 'T12:00:00')
  if (isNaN(d.getTime())) return date
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

type Counts = { npcs: number; locations: number; sessions: number }
/** "14 NPCs · 9 locations · 6 sessions" — omits any zero; null when all empty. */
function countLine(c: Counts): string | null {
  const parts: string[] = []
  if (c.npcs) parts.push(`${c.npcs} NPC${c.npcs === 1 ? '' : 's'}`)
  if (c.locations) parts.push(`${c.locations} location${c.locations === 1 ? '' : 's'}`)
  if (c.sessions) parts.push(`${c.sessions} session${c.sessions === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : null
}

export function HomePage() {
  const navigate = useNavigate()
  const { profile, user, configured, signIn } = useAuth()
  const all = useLiveQuery(() => db.campaigns.orderBy('updatedAt').reverse().toArray(), [])

  const [creating, setCreating] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)

  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [color, setColor] = useState(COLORS[0])

  // The "New Campaign" sidebar link routes here with ?new=1 to open the dialog.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setCreating(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const active = (all ?? []).filter((c) => !c.archived)
  const archived = (all ?? []).filter((c) => c.archived)
  const today = todayISODate()

  // Entity counts per DM campaign for the cards (players' local tables are empty,
  // so counts only apply to campaigns you run). Cheap: campaignId is indexed.
  const dmIds = active.filter((c) => !isPlayer(c)).map((c) => c.id)
  const counts = useLiveQuery(async () => {
    const out: Record<string, Counts> = {}
    for (const id of dmIds) {
      const [npcs, locations, sessions] = await Promise.all([
        db.npcs.where('campaignId').equals(id).count(),
        db.locations.where('campaignId').equals(id).count(),
        db.sessions.where('campaignId').equals(id).count(),
      ])
      out[id] = { npcs, locations, sessions }
    }
    return out
  }, [dmIds.join(',')])
  const nextSession = useMemo(() => {
    const dated = active.filter((c) => c.nextSessionDate && c.nextSessionDate >= today)
    dated.sort((a, b) =>
      (a.nextSessionDate! + (a.nextSessionTime || '99:99')).localeCompare(b.nextSessionDate! + (b.nextSessionTime || '99:99')),
    )
    return dated[0] ?? null
  }, [active, today])

  async function handleCreate() {
    const c = await createCampaign({ name, summary, color })
    setCreating(false)
    setName('')
    setSummary('')
    navigate(`/campaign/${c.id}`)
  }

  // "Join with a code" needs an account; otherwise fall back to linking a shared campaign.
  function openJoin() {
    if (user) setJoinOpen(true)
    else setAddOpen(true)
  }

  const firstName = profile?.display_name?.trim().split(/\s+/)[0]

  const modals = (
    <>
      {creating && (
        <Modal
          title="New campaign"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn primary" onClick={handleCreate}>Create</button>
            </>
          }
        >
          <div className="field">
            <label>Name</label>
            <input className="input" autoFocus value={name} placeholder="Curse of the Shattered Crown"
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
          </div>
          <div className="field">
            <label>Summary (optional)</label>
            <input className="input" value={summary} placeholder="A one-line pitch for the campaign"
              onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="field">
            <label>Accent color</label>
            <div className="row wrap">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} aria-label={`Color ${c}`}
                  style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: color === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
        </Modal>
      )}
      {joinOpen && <JoinCampaignModal onClose={() => setJoinOpen(false)} />}
      <AddPlayerCampaignModal open={addOpen} onClose={() => setAddOpen(false)} />
      {signInOpen && (
        <Modal title="Sign in" onClose={() => setSignInOpen(false)}
          footer={<button className="btn ghost" onClick={() => setSignInOpen(false)}>Cancel</button>}>
          <p style={{ marginTop: 0 }}>Sign in to sync your campaigns across devices and share with your group. Your local campaigns stay right here either way.</p>
          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn primary" onClick={() => signIn('discord')}>Continue with Discord</button>
            <button className="btn" onClick={() => signIn('google')}>Continue with Google</button>
          </div>
        </Modal>
      )}
    </>
  )

  // Still loading the first query — render nothing to avoid a hero/dashboard flash.
  if (all === undefined) return <div className="content" />

  // ---- Empty state: the universal welcome hero (no campaigns at all) ----
  if (active.length === 0) {
    return (
      <div className="content home">
        <div className="home-hero">
          <div className="home-hero-top">
            <div className="home-brand"><Icon name="swords" size={22} /> D&amp;D Codex</div>
            {configured && !user && (
              <button className="btn" onClick={() => setSignInOpen(true)}>Sign in</button>
            )}
          </div>
          <h1>Run your whole campaign in one place</h1>
          <p>Session notes, NPCs, maps, battle maps, and scheduling — local-first, free, and yours. Works offline, syncs when you sign in.</p>
          <div className="home-cta">
            <button className="btn primary lg" onClick={() => setCreating(true)}><Icon name="plus" size={16} color="inherit" /> Start a campaign</button>
            <button className="btn lg" onClick={openJoin}><Icon name="key" size={16} color="inherit" /> Join with a code</button>
          </div>
        </div>
        <div className="home-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="home-feature">
              <Icon name={f.icon} size={22} />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
        {modals}
      </div>
    )
  }

  // ---- Dashboard: you have at least one campaign ----
  return (
    <div className="content home">
      <div className="page-header">
        <h1 className="mb-0 home-greet">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h1>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={openJoin}><Icon name="key" size={15} color="inherit" /> Join</button>
          <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} color="inherit" /> New campaign</button>
        </div>
      </div>

      {nextSession && (
        <button
          className="home-next"
          onClick={() => navigate(`${routeFor(nextSession)}?planner=1`)}
        >
          <div>
            <div className="home-next-lbl">Next session</div>
            <div className="home-next-line">{nextSession.name} — {formatWhen(nextSession.nextSessionDate!, nextSession.nextSessionTime)}</div>
          </div>
          <span className="home-next-go"><Icon name="chevron-right" size={18} color="inherit" /></span>
        </button>
      )}

      <div className="home-seclbl">Your campaigns</div>
      <div className="home-campaigns">
        {active.map((c) => (
          <button key={c.id} className="home-ccard" onClick={() => navigate(routeFor(c))}>
            <div className="home-ccard-top">
              <span className="home-dot" style={{ background: c.color }} />
              <span className={`home-badge ${isPlayer(c) ? 'pl' : 'dm'}`}>{isPlayer(c) ? 'Player' : 'DM'}</span>
            </div>
            <h3>{c.name}</h3>
            <div className="home-ccard-meta">
              {(!isPlayer(c) && counts?.[c.id] && countLine(counts[c.id])) || c.summary || <span className="faint">No summary yet.</span>}
            </div>
            {c.nextSessionDate && c.nextSessionDate >= today ? (
              <div className="home-ccard-when"><Icon name="calendar" size={13} color="inherit" /> {shortWhen(c.nextSessionDate)}</div>
            ) : (
              <div className="home-ccard-when none"><Icon name="calendar-x" size={13} color="inherit" /> No session set</div>
            )}
          </button>
        ))}
        <button className="home-ccard add" onClick={() => setCreating(true)}>
          <Icon name="plus" size={24} color="inherit" />
          <span>New or join a campaign</span>
        </button>
      </div>

      <div className="home-seclbl">Tools</div>
      <div className="home-tools">
        <Link to="/tools/generators" className="home-tool"><Icon name="sparkles" size={18} /> Generators</Link>
        <Link to="/tools/encounters" className="home-tool"><Icon name="swords" size={18} /> Encounters</Link>
        <Link to="/tools/combat" className="home-tool"><Icon name="shield" size={18} /> Combat tracker</Link>
      </div>

      {archived.length > 0 && (
        <>
          <div className="home-seclbl">Archived</div>
          <div className="home-campaigns">
            {archived.map((c) => (
              <button key={c.id} className="home-ccard" style={{ opacity: 0.6 }} onClick={() => navigate(routeFor(c))}>
                <div className="home-ccard-top">
                  <span className="home-dot" style={{ background: c.color }} />
                  <span className={`home-badge ${isPlayer(c) ? 'pl' : 'dm'}`}>{isPlayer(c) ? 'Player' : 'DM'}</span>
                </div>
                <h3>{c.name}</h3>
                <div className="home-ccard-meta"><span className="faint">Archived</span></div>
              </button>
            ))}
          </div>
        </>
      )}

      {modals}
    </div>
  )
}
