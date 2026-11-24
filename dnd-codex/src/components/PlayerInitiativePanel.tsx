import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { BmIcon } from './battlemap/BmIcon'
import { NumberField } from './NumberField'
import { leaveCombat, orderRows, setMyInitiative, type LiveCombat, type LiveCombatRow } from '../auth/liveCombat'
import { rollInitiative } from '../lib/combat'
import { initials } from '../lib/tabletop'
import type { HealthMarker } from '../lib/liveCombat'

// The player's Initiative tab (T-108). It wears the DM tracker's look (the `il-*`
// classes of Run mode's InitiativeList) but is a separate component: it reads the
// privacy-filtered combat the DM shared and nothing else. Enemies show an optional
// Injured / Bloodied / Death's door marker and never HP. A player edits only their
// own rows. Join initiative lives in the map's turn strip (PlayerTurnStrip).
// Like the rest of the player code, this file never imports the DM's reveal guard.

const MARKER_TEXT: Record<HealthMarker, string> = { injured: 'Injured', bloodied: 'Bloodied', deaths_door: 'Death’s door' }

export interface Character {
  key: string
  name: string
  dexMod: number
  hp: number | null
  maxHp: number | null
}

/** The player's own character sheets in this campaign (local), for the Join form. */
export function useMyCharacters(localCampaignId: string): Character[] {
  const notes = useLiveQuery(
    () => db.playerNotes.where('campaignId').equals(localCampaignId).filter((n) => n.section === 'character').toArray(),
    [localCampaignId],
  )
  return (notes ?? []).map((n) => {
    const sheet = n.characterData
    const dex = sheet?.abilities?.dex
    return {
      key: n.id,
      name: n.title || 'My character',
      dexMod: typeof dex === 'number' ? Math.floor((dex - 10) / 2) : 0,
      hp: sheet?.currentHp ?? sheet?.maxHp ?? null,
      maxHp: sheet?.maxHp ?? null,
    }
  })
}

const hpClass = (hp: number, max: number) => {
  const p = max > 0 ? hp / max : 0
  return p <= 0.25 ? 'low' : p <= 0.6 ? 'mid' : ''
}

export function PlayerInitiativePanel({
  combat,
  cloudCampaignId,
  localCampaignId,
  userId,
}: {
  combat: LiveCombat | null
  cloudCampaignId: string
  localCampaignId: string
  userId: string | null
}) {
  const rows = useMemo(() => (combat ? orderRows(combat.rows) : []), [combat])
  const [error, setError] = useState<string | null>(null)

  if (!combat) {
    return (
      <div className="pl-empty" data-testid="initiative-empty">
        <b>No combat yet</b>
        <p className="faint">Your DM will ask for initiative when a fight starts. Your turn order appears here.</p>
      </div>
    )
  }

  const mine = rows.filter((r) => userId && r.controlledBy === userId)
  void localCampaignId
  const combatants = rows.reduce((a, r) => a + (r.groupCount != null && r.groupCount > 1 ? r.groupCount : 1), 0)

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <div className="il" data-testid="initiative-list">
      <div className="il-head">
        <strong>Initiative</strong>
        <span className="faint" data-testid="il-count">
          {combat.phase === 'active' ? `Round ${combat.round} · ` : ''}
          {rows.length} {rows.length === 1 ? 'turn' : 'turns'} · {combatants} {combatants === 1 ? 'combatant' : 'combatants'}
        </span>
      </div>

      {combat.phase === 'gathering' && (
        <p className="faint il-empty" data-testid="gathering-hint">
          {mine.length > 0 ? 'You are in. Enemies appear when your DM starts combat.' : 'Your DM is asking for initiative. Use Join initiative on the map strip.'}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="faint il-empty">Nobody has joined yet.</p>
      ) : (
        <div className="il-rows">
          {rows.map((r) => (
            <Row
              key={r.id}
              r={r}
              turn={combat.activeIds.includes(r.id)}
              mine={!!userId && r.controlledBy === userId}
              cloudCampaignId={cloudCampaignId}
              run={run}
            />
          ))}
        </div>
      )}
      {error && <p className="pis-error" role="alert">{error}</p>}

    </div>
  )
}

function Row({
  r,
  turn,
  mine,
  cloudCampaignId,
  run,
}: {
  r: LiveCombatRow
  turn: boolean
  mine: boolean
  cloudCampaignId: string
  run: (fn: () => Promise<unknown>) => Promise<void>
}) {
  const ally = r.kind !== 'enemy'
  const group = r.groupCount != null && r.groupCount > 1
  const showHp = ally && r.hp != null && r.maxHp != null && r.maxHp > 0
  const down = ally && r.hp != null && r.hp <= 0
  const pct = showHp ? Math.max(0, Math.min(100, Math.round((100 * r.hp!) / r.maxHp!))) : 0
  // Save on Enter or blur, once, and only for a valid change.
  const commit = (raw: string, el: HTMLInputElement) => {
    const v = raw === '' ? NaN : Number(raw)
    if (Number.isInteger(v) && v >= -10 && v <= 60) {
      if (v !== r.initiative) void run(() => setMyInitiative(cloudCampaignId, r.id, v))
    } else el.value = String(r.initiative ?? '')
  }
  return (
    <div
      className={`il-row${turn ? ' turn' : ''}${down ? ' down' : ''}${mine ? ' mine' : ''}`}
      data-testid="dock-row"
      data-kind={r.kind}
      aria-current={turn ? 'step' : undefined}
    >
      <div className="il-main static">
        <span className="il-av" aria-hidden style={mine ? { background: 'var(--accent)' } : undefined}>{initials(r.name)}</span>
        <span className="il-name">
          {r.name}
          {group && <small> × {r.groupCount}</small>}
          {mine && <small className="il-you"> · you</small>}
        </span>
      </div>

      {mine ? (
        <input
          key={r.initiative ?? 'none'}
          className="il-ini"
          type="number"
          min={-10}
          max={60}
          defaultValue={r.initiative ?? ''}
          placeholder="–"
          aria-label={`Edit ${r.name} initiative`}
          title="Your initiative"
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          onBlur={(e) => commit(e.currentTarget.value, e.currentTarget)}
        />
      ) : (
        <span className="il-ini il-ini-ro" data-testid="dock-init" aria-label={`${r.name} initiative`}>{r.initiative ?? '–'}</span>
      )}

      {showHp && (
        <div className="il-hp" title="Current / max HP">
          <span className="il-bar"><i className={hpClass(r.hp!, r.maxHp!)} style={{ width: `${pct}%` }} /></span>
          <span data-testid="dock-hp">{r.hp} / {r.maxHp}</span>
        </div>
      )}
      {(r.healthMarker || r.conditions.length > 0) && (
        <div className="il-conds">
          {r.healthMarker && <span className="il-cond il-marker" data-testid="dock-marker">{MARKER_TEXT[r.healthMarker]}</span>}
          {r.conditions.map((c) => <span key={c} className="il-cond">{c}</span>)}
        </div>
      )}
      {mine && (
        <button
          type="button"
          className="bm-icon-btn il-x"
          aria-label={`Remove ${r.name} from initiative`}
          title="Leave initiative"
          onClick={() => run(() => leaveCombat(cloudCampaignId, r.id))}
        >
          <BmIcon name="close" size={14} />
        </button>
      )}
    </div>
  )
}

const ANOTHER = '__another__'

/**
 * The form at the bottom of the list, styled like the DM's Add combatant. Pick a character
 * (pre-filled with name and HP) and set the initiative number; a character already in the
 * order is updated instead of added twice.
 */
export function JoinForm({
  joinable,
  mine,
  onJoin,
  onSet,
  onDone,
}: {
  joinable: Character[]
  mine: LiveCombatRow[]
  onJoin: (name: string, init: number, c: Character | null) => void
  onSet: (rowId: string, init: number) => void
  onDone: () => void
}) {
  // Options: characters not yet in (join), rows already in (set), or a typed name (join).
  const first = joinable[0] ? `c:${joinable[0].key}` : mine[0] ? `r:${mine[0].id}` : ANOTHER
  const [pick, setPick] = useState(first)
  const chosenChar = pick.startsWith('c:') ? joinable.find((c) => `c:${c.key}` === pick) ?? null : null
  const chosenRow = pick.startsWith('r:') ? mine.find((r) => `r:${r.id}` === pick) ?? null : null
  const [name, setName] = useState('')
  const dexMod = chosenChar?.dexMod ?? 0
  const [init, setInit] = useState<number | null>(() => (chosenRow ? chosenRow.initiative : rollInitiative(joinable[0]?.dexMod ?? 0)))
  const setting = !!chosenRow
  const finalName = chosenChar ? chosenChar.name : name.trim()
  const ok = init != null && (setting || !!finalName)
  const submit = () => {
    if (!ok) return
    if (chosenRow) onSet(chosenRow.id, init!)
    else onJoin(finalName, init!, chosenChar)
  }
  const optionsCount = joinable.length + mine.length
  return (
    <div className="card il-join" style={{ cursor: 'default' }} role="group" aria-label={mine.length > 0 ? 'Set my initiative' : 'Join initiative'} data-testid="join-form">
      <div className="sidebar-heading" style={{ margin: '0 0 10px' }}>{setting ? 'Set my initiative' : 'Join initiative'}</div>
      <div className="combat-addform" onKeyDown={(e) => { if (e.key === 'Enter' && !(e.target instanceof HTMLSelectElement)) submit() }}>
        {(optionsCount > 0) && (
          <select
            className="input"
            aria-label="Character"
            value={pick}
            style={{ flex: '2 1 140px' }}
            onChange={(e) => {
              const v = e.target.value
              setPick(v)
              const c = joinable.find((x) => `c:${x.key}` === v)
              const r = mine.find((x) => `r:${x.id}` === v)
              setInit(r ? r.initiative : rollInitiative(c?.dexMod ?? 0))
            }}
          >
            {joinable.map((c) => <option key={c.key} value={`c:${c.key}`}>{c.name}</option>)}
            {mine.map((r) => <option key={r.id} value={`r:${r.id}`}>{r.name} (in the order)</option>)}
            <option value={ANOTHER}>Another character…</option>
          </select>
        )}
        {pick === ANOTHER && (
          <input className="input" aria-label="Name" placeholder="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={{ flex: '2 1 140px' }} />
        )}
        <NumberField className="combat-add-num" value={init} min={-10} max={60} placeholder="Init" onChange={setInit} ariaLabel="Initiative" />
        {chosenChar && (
          <button type="button" className="bm-btn" onClick={() => setInit(rollInitiative(dexMod))} title="Roll d20 plus your Dexterity modifier">
            <BmIcon name="dice" size={16} /> Roll {dexMod >= 0 ? '+' : '−'}{Math.abs(dexMod)}
          </button>
        )}
        {chosenChar && chosenChar.hp != null && (
          <span className="faint" style={{ fontSize: 13 }} data-testid="join-hp">HP {chosenChar.hp}{chosenChar.maxHp != null ? ` / ${chosenChar.maxHp}` : ''}</span>
        )}
        <span className="il-join-actions">
          <button type="button" className="btn small primary" onClick={submit} disabled={!ok} data-testid="join-submit">
            {setting ? 'Set' : 'Join'}
          </button>
          <button type="button" className="bm-btn" onClick={onDone}>Done</button>
        </span>
      </div>
    </div>
  )
}
