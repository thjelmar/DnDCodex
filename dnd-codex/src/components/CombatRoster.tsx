import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from './Icon'
import { NumberField } from './NumberField'
import { useConfirm } from './ConfirmDialog'
import {
  CONDITIONS,
  emptyCombat,
  getCombat,
  setCombat,
  subscribeCombat,
  makeCombatant,
  rollInitiative,
  rollAllInitiative,
  sortByInitiative,
  parseLeadingInt,
  type Combatant,
  type CombatState,
} from '../lib/combat'
import { abilityMod } from '../lib/statblock'
import type { Id, NPC } from '../db/types'

// Combat tracker building blocks shared by the full Combat Tracker page and the
// campaign Run screen. Both read/write the ONE active combat in localStorage
// (`codex.combat`), so a fight started in one view carries over to the other.

/** A tracker row for a campaign NPC, pulling HP/AC/DEX from its stat block. */
export function combatantFromNpc(npc: NPC): Combatant {
  const sb = npc.statBlockData
  return makeCombatant({
    name: npc.name,
    dexMod: sb ? abilityMod(sb.abilities.dex) : 0,
    hp: sb ? parseLeadingInt(sb.hp) : null,
    ac: sb ? parseLeadingInt(sb.ac) : null,
  })
}

/** Read-only live view of the one combat, for surfaces that only display it
 *  (e.g. the battle-map overlay, the live push). */
export function useCombatState(): CombatState {
  return useSyncExternalStore(subscribeCombat, getCombat)
}

/** The active combat plus every operation the tracker UIs need. Backed by the
 *  shared store so the tracker, Run panel, and board overlay all stay in sync. */
export function useCombat() {
  const confirm = useConfirm()
  const state = useSyncExternalStore(subscribeCombat, getCombat)
  const setState = setCombat

  function patch(id: Id, p: Partial<Combatant>) {
    setState((s) => ({ ...s, combatants: s.combatants.map((c) => (c.id === id ? { ...c, ...p } : c)) }))
  }

  function adjustHp(id: Id, delta: number) {
    setState((s) => ({
      ...s,
      combatants: s.combatants.map((c) => {
        if (c.id !== id) return c
        // delta < 0 = damage, > 0 = heal. Track cumulative net damage taken so
        // players can see how hurt an enemy is without its HP pool.
        const damageTaken = Math.max(0, (c.damageTaken ?? 0) - delta)
        if (c.hp == null) return { ...c, damageTaken }
        const raw = c.hp + delta
        const hi = c.maxHp ?? raw
        return { ...c, hp: Math.max(0, Math.min(raw, hi)), damageTaken }
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

  const activeId = state.active ? state.combatants[state.turnIndex]?.id ?? null : null

  return { state, setState, activeId, patch, adjustHp, addCombatants, removeCombatant, rollAll, sortNow, start, step, end }
}

export function CombatantRow({
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
        className="combat-init-f"
        inputClassName="combat-init"
        value={c.initiative}
        placeholder="–"
        onChange={(v) => onPatch({ initiative: v })}
        ariaLabel={`${c.name} initiative`}
        title="Initiative — click ▲▼, or focus and scroll"
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
          className="combat-hp-f"
          inputClassName="combat-hp-cur"
          value={c.hp}
          min={0}
          max={c.maxHp ?? undefined}
          onChange={(v) => onPatch({ hp: v ?? 0 })}
          ariaLabel={`${c.name} current HP`}
          title="Current HP — click ▲▼, or focus and scroll"
        />
        <span className="faint">/</span>
        <NumberField
          className="combat-hp-f"
          inputClassName="combat-hp-max"
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

export function ConditionPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
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

export function AddCustom({ onAdd }: { onAdd: (row: Combatant) => void }) {
  const [name, setName] = useState('')
  const [hp, setHp] = useState<number | null>(null)
  const [ac, setAc] = useState<number | null>(null)
  const [init, setInit] = useState<number | null>(null)
  const [isPC, setIsPC] = useState(false)

  function submit() {
    if (!name.trim()) return
    onAdd(makeCombatant({ name, isPC, hp, ac, initiative: init }))
    setName(''); setHp(null); setAc(null); setInit(null)
  }

  return (
    <div className="card" style={{ cursor: 'default' }}>
      <div className="sidebar-heading" style={{ margin: '0 0 10px' }}>Add combatant</div>
      <div className="combat-addform" onKeyDown={(e) => { if (e.key === 'Enter') submit() }}>
        <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '2 1 140px' }} />
        <NumberField className="combat-add-num" value={init} min={0} placeholder="Init" onChange={setInit} ariaLabel="Initiative" />
        <NumberField className="combat-add-num" value={hp} min={0} placeholder="HP" onChange={setHp} ariaLabel="HP" />
        <NumberField className="combat-add-num" value={ac} min={0} placeholder="AC" onChange={setAc} ariaLabel="AC" />
        <label className="row" style={{ gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={isPC} onChange={(e) => setIsPC(e.target.checked)} /> PC
        </label>
        <button className="btn small primary" onClick={submit} disabled={!name.trim()}>Add</button>
      </div>
    </div>
  )
}
