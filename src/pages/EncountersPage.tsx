import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import { createEncounter, updateEncounter, deleteEncounter } from '../db/repo'
import { useConfirm } from '../components/ConfirmDialog'
import {
  SRD_MONSTERS,
  searchSrd,
  searchOpen5e,
  crToXp,
  crLabel,
  CR_VALUES,
  type Monster,
} from '../lib/monsters'
import {
  partyBudget,
  encounterXp,
  rateEncounter,
  clampLevel,
  RATING_LABEL,
  RATING_COLOR,
} from '../lib/encounter'
import type { EncounterCombatant } from '../db/types'

const MAX_ROWS = 80

/**
 * Standalone DM tool (Tools menu, not tied to one campaign): build a combat
 * encounter against a party's level and save it into a campaign of your choice.
 */
export function EncountersPage() {
  const confirm = useConfirm()

  // DM campaigns available as "save to" targets, and a name lookup for labels.
  const dmCampaigns = useLiveQuery(
    () => db.campaigns.orderBy('updatedAt').reverse().filter((c) => !c.archived && c.role !== 'player').toArray(),
    [],
  )
  const allCampaigns = useLiveQuery(() => db.campaigns.toArray(), [])
  const campaignName = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>()
    for (const c of allCampaigns ?? []) m.set(c.id, { name: c.name, color: c.color })
    return m
  }, [allCampaigns])

  // Every saved encounter across all campaigns (this tool is global).
  const saved = useLiveQuery(() => db.encounters.orderBy('updatedAt').reverse().toArray(), [])

  // Working encounter state.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('New Encounter')
  const [saveToId, setSaveToId] = useState('')
  const [players, setPlayers] = useState(4)
  const [level, setLevel] = useState(1)
  const [combatants, setCombatants] = useState<EncounterCombatant[]>([])

  // Default the "save to" campaign to the most recent one, once loaded.
  useEffect(() => {
    if (!saveToId && dmCampaigns && dmCampaigns.length > 0) setSaveToId(dmCampaigns[0].id)
  }, [dmCampaigns, saveToId])

  const budget = partyBudget(players, clampLevel(level))
  const totalXp = encounterXp(combatants)
  const rating = rateEncounter(totalXp, budget)

  function addMonster(m: Monster) {
    setCombatants((prev) => {
      const existing = prev.find((c) => c.slug === m.slug && c.slug != null)
      if (existing) return prev.map((c) => (c === existing ? { ...c, count: c.count + 1 } : c))
      return [
        ...prev,
        { id: newId(), slug: m.slug, name: m.name, cr: m.cr, hp: m.hp, ac: m.ac, dex: m.dex, count: 1 },
      ]
    })
  }

  function setCount(id: string, count: number) {
    setCombatants((prev) => prev.flatMap((c) => (c.id === id ? (count <= 0 ? [] : [{ ...c, count }]) : [c])))
  }

  function resetBuilder() {
    setEditingId(null)
    setName('New Encounter')
    setCombatants([])
  }

  async function save() {
    if (!saveToId) return
    const payload = { name, players, level: clampLevel(level), combatants }
    if (editingId) {
      await updateEncounter(editingId, { ...payload, campaignId: saveToId })
    } else {
      const created = await createEncounter(saveToId, payload)
      setEditingId(created.id)
    }
  }

  function load(id: string) {
    const enc = saved?.find((e) => e.id === id)
    if (!enc) return
    setEditingId(enc.id)
    setName(enc.name)
    setSaveToId(enc.campaignId)
    setPlayers(enc.players)
    setLevel(enc.level)
    setCombatants(enc.combatants)
  }

  async function removeSaved(id: string, encName: string) {
    if (!(await confirm({ title: 'Delete encounter?', message: `Delete “${encName}”?`, confirmLabel: 'Delete', danger: true }))) return
    await deleteEncounter(id)
    if (editingId === id) resetBuilder()
  }

  const canSave = Boolean(saveToId) && (combatants.length > 0 || name.trim() !== 'New Encounter')

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">🧰 Encounter Builder</h1>
          <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
            Build a combat and save it to a campaign. Difficulty uses the 2024 XP budgets.
          </div>
        </div>
        <Link to="/" className="btn ghost small">← Campaigns</Link>
      </div>

      {(dmCampaigns?.length ?? 0) === 0 && (
        <p className="faint">Create a DM campaign first — encounters are saved into a campaign.</p>
      )}

      <div className="row between" style={{ margin: '8px 0 14px', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field" style={{ margin: 0 }}>
            <span className="faint" style={{ fontSize: 12 }}>Encounter name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ fontWeight: 600, maxWidth: 300 }} />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="faint" style={{ fontSize: 12 }}>Save to campaign</span>
            <select className="select" value={saveToId} onChange={(e) => setSaveToId(e.target.value)} style={{ maxWidth: 240 }}>
              {(dmCampaigns ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost small" onClick={resetBuilder}>New</button>
          <button className="btn primary small" onClick={save} disabled={!canSave}>
            {editingId ? 'Save changes' : 'Save encounter'}
          </button>
        </div>
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: -6, marginBottom: 12 }}>
        {editingId ? 'Editing a saved encounter' : 'New encounter (unsaved)'}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(280px, 360px) 1fr', gap: 18, alignItems: 'start' }}>
        {/* Left: party + current encounter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ cursor: 'default' }}>
            <div className="sidebar-heading" style={{ margin: '0 0 10px' }}>Party</div>
            <div className="row" style={{ gap: 12 }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="faint" style={{ fontSize: 12 }}>Players</span>
                <input className="input" type="number" min={1} max={12} value={players}
                  onChange={(e) => setPlayers(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span className="faint" style={{ fontSize: 12 }}>Level</span>
                <input className="input" type="number" min={1} max={20} value={level}
                  onChange={(e) => setLevel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
              </label>
            </div>
            <div className="row between" style={{ marginTop: 12, gap: 6, fontSize: 13 }}>
              <BudgetPill label="Low" value={budget.low} />
              <BudgetPill label="Moderate" value={budget.moderate} />
              <BudgetPill label="High" value={budget.high} />
            </div>
          </div>

          <div className="card" style={{ cursor: 'default' }}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <div className="sidebar-heading" style={{ margin: 0 }}>Encounter</div>
              <span style={{ fontWeight: 700, color: RATING_COLOR[rating] }}>{RATING_LABEL[rating]}</span>
            </div>
            {combatants.length === 0 ? (
              <p className="faint" style={{ margin: '4px 0' }}>Add monsters from the list to build your encounter.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {combatants.map((c) => (
                  <div key={c.id} className="row between" style={{ gap: 8, alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                      <div className="faint" style={{ fontSize: 11 }}>CR {crLabel(c.cr)} · {crToXp(c.cr).toLocaleString()} XP</div>
                    </div>
                    <div className="row" style={{ gap: 4, alignItems: 'center' }}>
                      <button className="btn ghost small" onClick={() => setCount(c.id, c.count - 1)} aria-label="One fewer">−</button>
                      <span style={{ minWidth: 18, textAlign: 'center' }}>{c.count}</span>
                      <button className="btn ghost small" onClick={() => setCount(c.id, c.count + 1)} aria-label="One more">+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="row between" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <span className="faint">Total</span>
              <span style={{ fontWeight: 600 }}>{totalXp.toLocaleString()} XP</span>
            </div>
          </div>

          {saved && saved.length > 0 && (
            <div className="card" style={{ cursor: 'default' }}>
              <div className="sidebar-heading" style={{ margin: '0 0 10px' }}>Saved encounters</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {saved.map((e) => {
                  const camp = campaignName.get(e.campaignId)
                  return (
                    <div key={e.id} className="row between" style={{ gap: 8, alignItems: 'center' }}>
                      <button onClick={() => load(e.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', textAlign: 'left', minWidth: 0, padding: 2, flex: 1 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: editingId === e.id ? 700 : 400 }}>{e.name}</div>
                        <div className="faint" style={{ fontSize: 11 }}>
                          <span style={{ color: camp?.color }}>●</span> {camp?.name ?? 'Unknown'} · {e.combatants.reduce((n, c) => n + c.count, 0)} creatures
                        </div>
                      </button>
                      <button className="btn ghost small" onClick={() => removeSaved(e.id, e.name)} aria-label="Delete">🗑</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: monster browser */}
        <MonsterBrowser onAdd={addMonster} />
      </div>
    </div>
  )
}

function BudgetPill({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div className="faint" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value.toLocaleString()}</div>
    </div>
  )
}

function MonsterBrowser({ onAdd }: { onAdd: (m: Monster) => void }) {
  const [query, setQuery] = useState('')
  const [minCr, setMinCr] = useState<number | ''>('')
  const [maxCr, setMaxCr] = useState<number | ''>('')
  const [online, setOnline] = useState<Monster[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const results = useMemo(() => {
    const srd = searchSrd({ query, minCr: minCr === '' ? undefined : minCr, maxCr: maxCr === '' ? undefined : maxCr })
    const seen = new Set(srd.map((m) => m.slug))
    return [...srd, ...online.filter((m) => !seen.has(m.slug))]
  }, [query, minCr, maxCr, online])

  async function searchMore() {
    if (!query.trim()) return
    setLoading(true)
    setError('')
    try {
      setOnline(await searchOpen5e(query))
    } catch {
      setError('Could not reach Open5e (offline?). Showing SRD results only.')
    } finally {
      setLoading(false)
    }
  }

  const shown = results.slice(0, MAX_ROWS)

  return (
    <div className="card" style={{ cursor: 'default', padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input className="input" placeholder="Search monsters (e.g. goblin, dragon)…" value={query}
          onChange={(e) => { setQuery(e.target.value); setOnline([]) }} />
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="faint" style={{ fontSize: 12 }}>CR</span>
          <select className="select" value={minCr} onChange={(e) => setMinCr(e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 90 }}>
            <option value="">min</option>
            {CR_VALUES.map((cr) => <option key={cr} value={cr}>{crLabel(cr)}</option>)}
          </select>
          <span className="faint">–</span>
          <select className="select" value={maxCr} onChange={(e) => setMaxCr(e.target.value === '' ? '' : Number(e.target.value))} style={{ width: 90 }}>
            <option value="">max</option>
            {CR_VALUES.map((cr) => <option key={cr} value={cr}>{crLabel(cr)}</option>)}
          </select>
          <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>{results.length} of {SRD_MONSTERS.length}+</span>
        </div>
      </div>

      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {shown.map((m) => (
          <div key={m.source + ':' + m.slug} className="row between" style={{ gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0 }}>
              <div className="title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name} {m.source === 'open5e' && <span className="tag" style={{ fontSize: 10 }}>Open5e</span>}
              </div>
              <div className="faint" style={{ fontSize: 11 }}>{m.size} {m.type} · CR {crLabel(m.cr)} · {crToXp(m.cr).toLocaleString()} XP</div>
            </div>
            <button className="btn small" onClick={() => onAdd(m)}>Add</button>
          </div>
        ))}
        {shown.length === 0 && <p className="faint" style={{ padding: 16, textAlign: 'center' }}>No monsters match.</p>}
        {results.length > MAX_ROWS && (
          <p className="faint" style={{ padding: '8px 12px', fontSize: 12 }}>+{results.length - MAX_ROWS} more — refine your search.</p>
        )}
      </div>

      <div style={{ padding: 10, borderTop: '1px solid var(--border)' }} className="row between">
        <span className="faint" style={{ fontSize: 12 }}>{error || 'Bundled SRD monsters work offline.'}</span>
        <button className="btn ghost small" onClick={searchMore} disabled={!query.trim() || loading}>
          {loading ? 'Searching…' : '🔎 Search Open5e'}
        </button>
      </div>
    </div>
  )
}
