import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BmIcon } from './battlemap/BmIcon'
import { BmMenu } from './battlemap/BmMenu'
import { AddCustom, ConditionPicker, type useCombat } from './CombatRoster'
import { turnSlots, type Combatant } from '../lib/combat'
import { initials } from '../lib/tabletop'

/**
 * Run mode's initiative list (the Combat tab): one row per turn slot, in order. A monster group is one
 * slot. Only the current row shows Damage, Heal and Condition. It has no Round counter or Next button:
 * those live in the map's turn strip, so each control appears once.
 */
export function InitiativeList({
  combat,
  selectedId,
  onSelect,
  colorOf,
}: {
  combat: ReturnType<typeof useCombat>
  /** The combatant whose token is selected on the map. */
  selectedId: string | null
  /** A row was picked: the combatant ids of its slot (the map selects and pans to the token). */
  onSelect: (ids: string[]) => void
  colorOf: (combatantId: string) => string | null
}) {
  const { state } = combat
  const slots = turnSlots(state.combatants)
  const n = state.combatants.length
  const current = state.active ? state.combatants[state.turnIndex] : undefined
  const currentSlot = current ? slots.find((s) => s.some((c) => c.id === current.id)) : undefined
  const [adding, setAdding] = useState(false)

  // A token picked on the map brings its row into view.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!selectedId) return
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedId])

  return (
    <div className="il" data-testid="initiative-list">
      <div className="il-head">
        <strong>Initiative</strong>
        <span className="faint">
          {slots.length} {slots.length === 1 ? 'turn' : 'turns'} · {n} {n === 1 ? 'combatant' : 'combatants'}
        </span>
      </div>

      {n === 0 ? (
        <p className="faint il-empty">No combatants. Use the swords button on an NPC in In play, or add one below.</p>
      ) : (
        <div className="il-rows" ref={listRef}>
          {slots.map((slot) => (
            <Row
              key={slot[0].id}
              slot={slot}
              combat={combat}
              turn={slot === currentSlot}
              selected={!!selectedId && slot.some((c) => c.id === selectedId)}
              onSelect={() => onSelect(slot.map((c) => c.id))}
              colorOf={colorOf}
            />
          ))}
        </div>
      )}

      {adding ? (
        <div className="il-add">
          <AddCustom onAdd={(row) => combat.addCombatants([row])} />
          <button type="button" className="bm-btn" onClick={() => setAdding(false)}>Done adding</button>
        </div>
      ) : (
        <div className="il-foot">
          <button type="button" className="bm-btn" onClick={() => setAdding(true)}>
            <BmIcon name="plus" size={16} /> Add combatant
          </button>
          <BmMenu label="More combat actions" panelClassName="bm-menu-up" trigger={<BmIcon name="more" />}>
            {(close) => (
              <>
                <button type="button" role="menuitem" className="bm-item" disabled={n === 0} onClick={() => { close(); combat.rollAll() }}>
                  Roll initiative for everyone
                </button>
                <button type="button" role="menuitem" className="bm-item" disabled={n === 0} onClick={() => { close(); combat.sortNow() }}>
                  Sort by initiative
                </button>
                <button type="button" role="menuitem" className="bm-item" disabled={n === 0 && !state.active} onClick={() => { close(); combat.end() }}>
                  End combat
                </button>
              </>
            )}
          </BmMenu>
          <Link to="/tools/combat" className="il-full">Full tracker</Link>
        </div>
      )}
    </div>
  )
}

const hpClass = (hp: number, max: number) => {
  const p = max > 0 ? hp / max : 0
  return p <= 0.25 ? 'low' : p <= 0.6 ? 'mid' : ''
}

function Row({
  slot,
  combat,
  turn,
  selected,
  onSelect,
  colorOf,
}: {
  slot: Combatant[]
  combat: ReturnType<typeof useCombat>
  turn: boolean
  selected: boolean
  onSelect: () => void
  colorOf: (id: string) => string | null
}) {
  const group = slot.length > 1
  const lead = slot[0]
  const tracked = slot.filter((c) => c.hp != null)
  const hp = tracked.reduce((a, c) => a + (c.hp ?? 0), 0)
  const max = tracked.reduce((a, c) => a + (c.maxHp ?? c.hp ?? 0), 0)
  const down = !group && lead.hp != null && lead.hp <= 0
  const conditions = [...new Set(slot.flatMap((c) => c.conditions))]
  const name = group ? 'Monster group' : lead.name
  const label = group ? slot.map((c) => c.name).join(', ') : lead.name
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((100 * hp) / max))) : 0

  return (
    <div
      className={`il-row${turn ? ' turn' : ''}${selected ? ' sel' : ''}${down ? ' down' : ''}`}
      data-testid="il-row"
      data-selected={selected ? 'true' : undefined}
      aria-current={turn ? 'step' : undefined}
    >
      <button type="button" className="il-main" onClick={onSelect} aria-pressed={selected} aria-label={`${label}${group ? ' (group)' : ''}`}>
        {group ? (
          <span className="il-stack" aria-hidden>
            {slot.map((c) => (
              <b key={c.id} style={colorOf(c.id) ? { background: colorOf(c.id)! } : undefined}>{initials(c.name)}</b>
            ))}
          </span>
        ) : (
          <span className="il-av" aria-hidden style={colorOf(lead.id) ? { background: colorOf(lead.id)! } : undefined}>
            {initials(lead.name)}
          </span>
        )}
        <span className="il-name">
          {group ? groupName(slot) : name}
          {group && <small> × {slot.length}</small>}
        </span>
      </button>

      <input
        className="il-ini"
        type="number"
        value={lead.initiative ?? ''}
        placeholder="–"
        aria-label={`${group ? groupName(slot) : lead.name} initiative`}
        title="Initiative"
        onChange={(e) => {
          const v = e.target.value === '' ? null : Number(e.target.value)
          for (const c of slot) combat.patch(c.id, { initiative: v })
        }}
      />

      {max > 0 && (
        <div className="il-hp" title="Current / max HP">
          <span className="il-bar"><i className={hpClass(hp, max)} style={{ width: `${pct}%` }} /></span>
          <span>{hp} / {max}</span>
        </div>
      )}
      {conditions.length > 0 && (
        <div className="il-conds">
          {conditions.map((c) => <span key={c} className="il-cond">{c}</span>)}
        </div>
      )}
      {!group && !turn && (
        <button type="button" className="bm-icon-btn il-x" aria-label={`Remove ${lead.name}`} title="Remove" onClick={() => combat.removeCombatant(lead.id)}>
          <BmIcon name="close" size={14} />
        </button>
      )}
      {turn && <Quick slot={slot} combat={combat} />}
    </div>
  )
}

function groupName(slot: Combatant[]): string {
  const base = slot[0].name.replace(/\s*\d+$/, '').trim() || slot[0].name
  return /s$/i.test(base) ? base : `${base}s`
}

/** Damage, Heal and Condition for the current row. A group aims at one member at a time. */
function Quick({ slot, combat }: { slot: Combatant[]; combat: ReturnType<typeof useCombat> }) {
  const group = slot.length > 1
  const [amount, setAmount] = useState('5')
  const [targetId, setTargetId] = useState(slot[0].id)
  const target = slot.find((c) => c.id === targetId) ?? slot[0]
  const n = Math.abs(Number(amount)) || 0
  return (
    <div className="il-quick">
      {group && (
        <div className="il-members" role="group" aria-label="Aim at">
          {slot.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`il-member${c.id === target.id ? ' on' : ''}`}
              aria-pressed={c.id === target.id}
              onClick={() => setTargetId(c.id)}
            >
              <span>{c.name}</span>
              <span>{c.hp != null ? `${c.hp} / ${c.maxHp ?? c.hp}` : '–'}</span>
            </button>
          ))}
        </div>
      )}
      <div className="il-quick-row">
        <input className="il-amt" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
        <button type="button" className="bm-btn" disabled={!n} onClick={() => combat.adjustHp(target.id, -n)}>
          <BmIcon name="drop" size={16} /> Damage
        </button>
        <button type="button" className="bm-btn" disabled={!n} onClick={() => combat.adjustHp(target.id, n)}>
          <BmIcon name="heart" size={16} /> Heal
        </button>
      </div>
      <ConditionPicker value={target.conditions} onChange={(conditions) => combat.patch(target.id, { conditions })} />
    </div>
  )
}
