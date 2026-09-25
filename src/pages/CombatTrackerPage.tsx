import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Icon } from '../components/Icon'
import { NumberField } from '../components/NumberField'
import { useConfirm } from '../components/ConfirmDialog'
import { abilityMod } from '../lib/statblock'
import {
  CONDITIONS,
  emptyCombat,
  loadCombat,
  saveCombat,
  makeCombatant,
  rollInitiative,
  rollAllInitiative,
  sortByInitiative,
  parseLeadingInt,
  type Combatant,
  type CombatState,
} from '../lib/combat'
import type { Encounter, Id, NPC } from '../db/types'

/**
 * At-the-table combat/initiative tracker (Tools menu). Combatants come from a
 * saved encounter (its "Run" button), the current campaign's NPCs, or a custom
 * quick-add. Tracks initiative order, round/turn, HP, and conditions. The active
 * combat lives in localStorage so a refresh mid-fight doesn't lose it.
 */
export function CombatTrackerPage() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const location = useLocation()
  const [state, setState] = useState<CombatState>(() => loadCombat())

  // Persist every change — combat is transient, DM-only, never synced/backed up.
  useEffect(() => { saveCombat(state) }, [state])

  const dmCampaigns = useLiveQuery(
    () => db.campaigns.orderBy('updatedAt').reverse().filter((c) => !c.archived && c.role !== 'player').toArray(),
    [],
  )
  // Default the NPC-picker campaign to the most recent DM campaign.
  useEffect(() => {
    if (!state.campaignId && dmCampaigns && dmCampaigns.length > 0) {
      setState((s) => (s.campaignId ? s : { ...s, campaignId: dmCampaigns[0].id }))
    }
  }, [dmCampaigns, state.campaignId])

  // "Run" an encounter: EncountersPage navigates here with its id in router
  // state. Consume it once, then clear it so a refresh doesn't re-import.
  const consumedRun = useRef(false)
  useEffect(() => {
    const runId = (location.state as { runEncounterId?: string } | null)?.runEncounterId
    if (!runId || consumedRun.current) return
    consumedRun.current = true
    ;(async () => {
      const enc = await db.encounters.get(runId)
      navigate(location.pathname, { replace: true, state: null })
      if (!enc) return
      const rows = combatantsFromEncounter(enc)
      if (state.combatants.length > 0) {
        const ok = await confirm({
          title: 'Replace current combat?',
          message: `Running “${enc.name}” will clear the ${state.combatants.length} combatant(s) currently tracked.`,
          confirmLabel: 'Replace',
          danger: true,
        })
        if (!ok) return
      }
      setState({ ...emptyCombat(), name: enc.name, campaignId: enc.campaignId, combatants: rows })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const { combatants } = state

  function patch(id: Id, p: Partial<Combatant>) {
    setState((s) => ({ ...s, combatants: s.combatants.map((c) => (c.id === id ? { ...c, ...p } : c)) }))
  }

  function adjustHp(id: Id, delta: number) {
    setState((s) => ({
      ...s,
      combatants: s.combatants.map((c) => {
        if (c.id !== id || c.hp == null) return c
        const raw = c.hp + delta
        const hi = c.maxHp ?? raw
        return { ...c, hp: Math.max(0, Math.min(raw, hi)) }
      }),
    }))
  }

  function addCombatants(rows: Combatant[]) {
    setState((s) => ({ ...s, combatants: [...s.combatants, ...rows] }))
  }

  function removeCombatant(id: Id) {
    setState((s) => {
      const idx = s.combatants.findIndex((c) => c.id === id)
      const list = s.combatants.filter((c) => c.id !== id)
      let ti = s.turnIndex
      if (idx !== -1 && idx < s.turnIndex) ti -= 1
      if (ti >= list.length) ti = Math.max(0, list.length - 1)
      return { ...s, combatants: list, turnIndex: ti }
    })
  }

  function rollAll() {
    setState((s) => ({ ...s, combatants: rollAllInitiative(s.combatants) }))
  }

  function sortNow() {
    setState((s) => {
      const activeId = s.combatants[s.turnIndex]?.id
      const list = sortByInitiative(s.combatants)
      const ti = Math.max(0, list.findIndex((c) => c.id === activeId))
      return { ...s, combatants: list, turnIndex: ti }
    })
  }

  function start() {
    setState((s) => {
      if (s.combatants.length === 0) return s
      const rolled = s.combatants.map((c) => (c.initiative == null ? { ...c, initiative: rollInitiative(c.dexMod) } : c))
      return { ...s, combatants: sortByInitiative(rolled), active: true, round: 1, turnIndex: 0 }
    })
  }

  function step(dir: 1 | -1) {
    setState((s) => {
      if (s.combatants.length === 0) return s
      let ti = s.turnIndex + dir
      let round = s.round
      if (ti >= s.combatants.length) { ti = 0; round += 1 }
      if (ti < 0) { ti = s.combatants.length - 1; round = Math.max(1, round - 1) }
      return { ...s, turnIndex: ti, round }
    })
  }

  async function end() {
    const ok = await confirm({
      title: 'End combat?',
      message: 'Clear all combatants and end the encounter?',
      confirmLabel: 'End combat',
      danger: true,
    })
    if (!ok) return
    setState((s) => ({ ...emptyCombat(), name: s.name, campaignId: s.campaignId }))
  }

  const activeId = state.active ? combatants[state.turnIndex]?.id : null

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">
            <Icon name="swords" size={22} /> Combat Tracker
          </h1>
          <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
            Run initiative at the table — track turns, HP, and conditions. Stored on this device.
          </div>
        </div>
        <Link to="/tools/encounters" className="btn ghost small">← Encounter Builder</Link>
      </div>

      {/* Control bar */}
      <div className="combat-bar">
        <input
          className="input"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          style={{ fontWeight: 600, maxWidth: 220 }}
          aria-label="Combat name"
        />
        {state.active ? (
          <>
            <div className="combat-round">
              <span className="faint" style={{ fontSize: 11 }}>Round</span>
              <strong style={{ fontSize: 20 }}>{state.round}</strong>
            </div>
            <button className="btn ghost small" onClick={() => step(-1)} title="Previous turn">
              <Icon name="chevron-left" size={16} />
            </button>
            <button className="btn primary" onClick={() => step(1)} title="Next turn">
              Next <Icon name="chevron-right" size={16} color="inherit" />
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={start} disabled={combatants.length === 0}>
            Start combat
          </button>
        )}
        <div className="combat-bar-spacer" />
        <button className="btn ghost small" onClick={rollAll} disabled={combatants.length === 0} title="Roll initiative for everyone">
          <Icon name="dice" size={15} /> Roll initiative
        </button>
        <button className="btn ghost small" onClick={sortNow} disabled={combatants.length === 0} title="Re-sort by initiative">
          Sort
        </button>
        {(combatants.length > 0 || state.active) && (
          <button className="btn ghost small danger" onClick={end}>End combat</button>
        )}
      </div>

      {/* Roster */}
      {combatants.length === 0 ? (
        <p className="faint" style={{ marginTop: 24 }}>
          No combatants yet. Add them below, or open the Encounter Builder and press <strong>Run</strong> on a saved encounter.
        </p>
      ) : (
        <div className="combat-list">
          {combatants.map((c, i) => (
            <CombatantRow
              key={c.id}
              c={c}
              index={i}
              active={c.id === activeId}
              onPatch={(p) => patch(c.id, p)}
              onDamage={(n) => adjustHp(c.id, -n)}
              onHeal={(n) => adjustHp(c.id, n)}
              onRemove={() => removeCombatant(c.id)}
            />
          ))}
        </div>
      )}

      {/* Add combatants */}
      <div className="combat-add">
        <AddCustom onAdd={(row) => addCombatants([row])} />
        <NpcPicker
          campaignId={state.campaignId}
          campaigns={dmCampaigns ?? []}
          onCampaign={(id) => setState((s) => ({ ...s, campaignId: id }))}
          onAdd={(row) => addCombatants([row])}
        />
      </div>
    </div>
  )
}

/** Expand a saved encounter's lines into individual tracker rows (Goblin 1/2/3),
 *  sharing a group key per line so a group rolls one initiative. */
function combatantsFromEncounter(enc: Encounter): Combatant[] {
  const out: Combatant[] = []
  for (const line of enc.combatants) {
    const dexMod = line.dex != null ? abilityMod(line.dex) : 0
    for (let i = 0; i < line.count; i++) {
      out.push(
        makeCombatant({
          name: line.count > 1 ? `${line.name} ${i + 1}` : line.name,
          dexMod,
          hp: line.hp,
          ac: line.ac,
          groupKey: line.id,
        }),
      )
    }
  }
  return out
}

function CombatantRow({
  c,
  index,
  active,
  onPatch,
  onDamage,
  onHeal,
  onRemove,
}: {
  c: Combatant
  index: number
  active: boolean
  onPatch: (p: Partial<Combatant>) => void
  onDamage: (n: number) => void
  onHeal: (n: number) => void
  onRemove: () => void
}) {
  const down = c.hp != null && c.hp <= 0
  return (
    <div className={`combat-row${active ? ' active' : ''}${down ? ' down' : ''}`}>
      {active && <div className="combat-turn-marker" aria-hidden />}
      <span className="combat-order faint">{index + 1}</span>

      <NumberField
        inputClassName="combat-init"
        steppers={false}
        value={c.initiative}
        placeholder="–"
        onChange={(v) => onPatch({ initiative: v })}
        ariaLabel={`${c.name} initiative`}
        title="Initiative — scroll or ↑/↓ to adjust"
      />

      <div className="combat-name-cell">
        <div className="combat-name">
          {down && <Icon name="skull" size={15} color="var(--text-dim)" />}
          {c.isPC && <span className="combat-pc-tag">PC</span>}
          <span style={{ fontWeight: 600 }}>{c.name}</span>
        </div>
        <ConditionPicker
          value={c.conditions}
          onChange={(conditions) => onPatch({ conditions })}
        />
      </div>

      {c.ac != null && (
        <span className="combat-ac" title="Armor Class">
          <Icon name="shield" size={14} /> {c.ac}
        </span>
      )}

      <HpControl c={c} onDamage={onDamage} onHeal={onHeal} onPatch={onPatch} />

      <button className="btn ghost small" onClick={onRemove} aria-label={`Remove ${c.name}`} title="Remove">
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}

function HpControl({
  c,
  onDamage,
  onHeal,
  onPatch,
}: {
  c: Combatant
  onDamage: (n: number) => void
  onHeal: (n: number) => void
  onPatch: (p: Partial<Combatant>) => void
}) {
  const [amount, setAmount] = useState('')
  if (c.hp == null) {
    return (
      <button
        className="btn ghost small combat-hp-add"
        onClick={() => onPatch({ hp: 1, maxHp: 1 })}
        title="Track HP for this combatant"
      >
        <Icon name="heart" size={14} /> HP
      </button>
    )
  }
  const apply = (heal: boolean) => {
    const n = Math.abs(Number(amount))
    if (!n) return
    if (heal) onHeal(n)
    else onDamage(n)
    setAmount('')
  }
  return (
    <div className="combat-hp">
      <span className="combat-hp-num" title="Current / max HP">
        <Icon name="heart" size={14} color={c.hp <= 0 ? 'var(--text-dim)' : 'var(--danger)'} />
        <NumberField
          inputClassName="combat-hp-cur"
          steppers={false}
          value={c.hp}
          min={0}
          max={c.maxHp ?? undefined}
          onChange={(v) => onPatch({ hp: v ?? 0 })}
          ariaLabel={`${c.name} current HP`}
          title="Current HP — scroll or ↑/↓ to adjust"
        />
        <span className="faint">/</span>
        <NumberField
          inputClassName="combat-hp-max"
          steppers={false}
          value={c.maxHp}
          min={0}
          onChange={(v) => onPatch({ maxHp: v })}
          ariaLabel={`${c.name} max HP`}
          title="Max HP"
        />
      </span>
      <input
        className="input combat-hp-amt"
        type="number"
        value={amount}
        placeholder="0"
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') apply(false); if (e.key === '+') apply(true) }}
        aria-label="Damage or heal amount"
      />
      <button className="btn ghost small danger" onClick={() => apply(false)} title="Damage">−</button>
      <button className="btn ghost small" onClick={() => apply(true)} title="Heal" style={{ color: 'var(--good)' }}>+</button>
    </div>
  )
}

function ConditionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function toggle(cond: string) {
    onChange(value.includes(cond) ? value.filter((v) => v !== cond) : [...value, cond])
  }

  return (
    <div className="combat-conds" ref={ref}>
      {value.map((cond) => (
        <button key={cond} className="combat-cond-chip" onClick={() => toggle(cond)} title={`Remove ${cond}`}>
          {cond} <Icon name="x" size={10} color="inherit" />
        </button>
      ))}
      <button className="combat-cond-add" onClick={() => setOpen((o) => !o)} title="Add a condition">
        <Icon name="plus" size={11} /> Condition
      </button>
      {open && (
        <div className="combat-cond-pop">
          {CONDITIONS.map((cond) => (
            <label key={cond} className="combat-cond-opt">
              <input type="checkbox" checked={value.includes(cond)} onChange={() => toggle(cond)} />
              <span>{cond}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function AddCustom({ onAdd }: { onAdd: (row: Combatant) => void }) {
  const [name, setName] = useState('')
  const [hp, setHp] = useState('')
  const [ac, setAc] = useState('')
  const [init, setInit] = useState('')
  const [isPC, setIsPC] = useState(false)

  function submit() {
    if (!name.trim()) return
    onAdd(
      makeCombatant({
        name,
        isPC,
        hp: hp === '' ? null : Number(hp),
        ac: ac === '' ? null : Number(ac),
        initiative: init === '' ? null : Number(init),
      }),
    )
    setName(''); setHp(''); setAc(''); setInit('')
  }

  return (
    <div className="card" style={{ cursor: 'default' }}>
      <div className="sidebar-heading" style={{ margin: '0 0 10px' }}>Add combatant</div>
      <div className="combat-addform" onKeyDown={(e) => { if (e.key === 'Enter') submit() }}>
        <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '2 1 140px' }} />
        <input className="input" type="number" placeholder="Init" value={init} onChange={(e) => setInit(e.target.value)} style={{ width: 64 }} aria-label="Initiative" />
        <input className="input" type="number" placeholder="HP" value={hp} onChange={(e) => setHp(e.target.value)} style={{ width: 70 }} aria-label="HP" />
        <input className="input" type="number" placeholder="AC" value={ac} onChange={(e) => setAc(e.target.value)} style={{ width: 64 }} aria-label="AC" />
        <label className="row" style={{ gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={isPC} onChange={(e) => setIsPC(e.target.checked)} /> PC
        </label>
        <button className="btn small primary" onClick={submit} disabled={!name.trim()}>Add</button>
      </div>
    </div>
  )
}

function NpcPicker({
  campaignId,
  campaigns,
  onCampaign,
  onAdd,
}: {
  campaignId: Id | null
  campaigns: { id: string; name: string }[]
  onCampaign: (id: string) => void
  onAdd: (row: Combatant) => void
}) {
  const npcs = useLiveQuery(
    () => (campaignId ? db.npcs.where('campaignId').equals(campaignId).sortBy('name') : Promise.resolve([] as NPC[])),
    [campaignId],
  )

  function add(npc: NPC) {
    const sb = npc.statBlockData
    onAdd(
      makeCombatant({
        name: npc.name,
        dexMod: sb ? abilityMod(sb.abilities.dex) : 0,
        hp: sb ? parseLeadingInt(sb.hp) : null,
        ac: sb ? parseLeadingInt(sb.ac) : null,
      }),
    )
  }

  return (
    <div className="card" style={{ cursor: 'default' }}>
      <div className="row between" style={{ marginBottom: 10, gap: 8, alignItems: 'center' }}>
        <div className="sidebar-heading" style={{ margin: 0 }}>Add from NPCs</div>
        {campaigns.length > 0 && (
          <select className="select" value={campaignId ?? ''} onChange={(e) => onCampaign(e.target.value)} style={{ width: 160, padding: '4px 8px' }}>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      {(npcs?.length ?? 0) === 0 ? (
        <p className="faint" style={{ margin: '2px 0', fontSize: 13 }}>No NPCs in this campaign.</p>
      ) : (
        <div className="combat-npc-list">
          {npcs!.map((npc) => (
            <div key={npc.id} className="row between" style={{ gap: 8, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{npc.name}</div>
                <div className="faint" style={{ fontSize: 11 }}>
                  {npc.statBlockData ? `HP ${parseLeadingInt(npc.statBlockData.hp) ?? '—'} · AC ${parseLeadingInt(npc.statBlockData.ac) ?? '—'}` : 'No stat block'}
                </div>
              </div>
              <button className="btn small" onClick={() => add(npc)}>Add</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
