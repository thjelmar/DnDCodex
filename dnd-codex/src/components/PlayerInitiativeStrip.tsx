import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Icon } from './Icon'
import { NumberField } from './NumberField'
import { joinCombat, leaveCombat, orderRows, setMyInitiative, type LiveCombat, type LiveCombatRow } from '../auth/liveCombat'
import { conditionMeta, rollInitiative } from '../lib/combat'
import type { HealthMarker } from '../lib/liveCombat'

// The players' view of the initiative order (T-100): a compact strip of the
// combatants the DM has revealed, with Join initiative for the player's own
// characters. It shows what the cloud copy holds and nothing else. There is no
// NPC warning here: a combatant that appears is just a new chip. This file never
// imports the DM's reveal guard.

const MARKER_TEXT: Record<HealthMarker, string> = {
  injured: 'Injured',
  bloodied: 'Bloodied',
  deaths_door: 'Death’s door',
}

interface Character {
  key: string
  name: string
  dexMod: number
  hp: number | null
  maxHp: number | null
}

/** The player's own character sheets in this campaign (local), for the Join form. */
function useMyCharacters(localCampaignId: string): Character[] {
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

export function PlayerInitiativeStrip({
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
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const characters = useMyCharacters(localCampaignId)
  if (!combat) return null

  const rows = orderRows(combat.rows)
  const mine = rows.filter((r) => userId && r.controlledBy === userId)
  const hasNow = combat.activeIds.length > 0
  const joinedNames = new Set(mine.map((r) => r.name.trim().toLowerCase()))
  const joinable = characters.filter((c) => !joinedNames.has(c.name.trim().toLowerCase()))

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    }
  }

  return (
    <div className={`pis${expanded ? ' open' : ''}${hasNow ? ' has-now' : ''}`} data-testid="initiative-strip" aria-label="Initiative order">
      <span className="pis-round" data-testid="strip-round">
        {combat.phase === 'active' ? `Round ${combat.round}` : 'Roll for initiative'}
      </span>
      <div className="pis-chips">
        {rows.map((r) => (
          <Chip
            key={r.id}
            r={r}
            now={combat.activeIds.includes(r.id)}
            mine={!!userId && r.controlledBy === userId}
            onInit={(v) => run(() => setMyInitiative(cloudCampaignId, r.id, v))}
            onLeave={() => run(() => leaveCombat(cloudCampaignId, r.id))}
          />
        ))}
        {rows.length === 0 && <span className="faint" style={{ fontSize: 13 }}>Nobody has joined yet.</span>}
      </div>
      <button type="button" className="btn small pis-more" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
        {expanded ? 'Less' : 'List'}
      </button>
      {userId && (
        <button type="button" className="btn small primary" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="join-initiative">
          {mine.length > 0 ? 'Add another' : 'Join initiative'}
        </button>
      )}
      {open && userId && (
        <JoinForm
          characters={joinable}
          onJoin={(name, init, c) =>
            run(async () => {
              await joinCombat(cloudCampaignId, name, init, c?.hp ?? null, c?.maxHp ?? null, c?.key ?? name.trim().toLowerCase())
              setOpen(false)
            })
          }
          onCancel={() => setOpen(false)}
        />
      )}
      {error && <span className="pis-error" role="alert">{error}</span>}
    </div>
  )
}

function Chip({
  r,
  now,
  mine,
  onInit,
  onLeave,
}: {
  r: LiveCombatRow
  now: boolean
  mine: boolean
  onInit: (v: number) => void
  onLeave: () => void
}) {
  const [editing, setEditing] = useState(false)
  const ally = r.kind !== 'enemy'
  // Save on Enter or when the field loses focus, once, and only for a valid change.
  const commit = (raw: string) => {
    if (!editing) return
    setEditing(false)
    const v = raw === '' ? NaN : Number(raw)
    if (Number.isInteger(v) && v >= -10 && v <= 60 && v !== r.initiative) onInit(v)
  }
  return (
    <span className={`pis-chip${now ? ' now' : ''}${mine ? ' me' : ''}`} data-testid="strip-chip" data-kind={r.kind}>
      {editing ? (
        <input
          className="input pis-init-input"
          type="number"
          min={-10}
          max={60}
          autoFocus
          defaultValue={r.initiative ?? ''}
          aria-label={`${r.name} initiative`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false)
            if (e.key === 'Enter') commit(e.currentTarget.value)
          }}
          onBlur={(e) => commit(e.currentTarget.value)}
        />
      ) : (
        <b>{r.initiative ?? '–'}</b>
      )}
      <span className={`pis-dot ${ally ? 'ally' : 'foe'}`} aria-hidden />
      <span>
        {r.name}
        {r.groupCount != null && r.groupCount > 1 ? ` ×${r.groupCount}` : ''}
      </span>
      {ally && r.hp != null && r.maxHp != null && <small data-testid="chip-hp">{r.hp}/{r.maxHp} HP</small>}
      {r.healthMarker && <small className="pis-marker" data-testid="chip-marker">{MARKER_TEXT[r.healthMarker]}</small>}
      {r.conditions.slice(0, 3).map((c) => (
        <small key={c} title={c} style={{ color: conditionMeta(c).color }}>{conditionMeta(c).code}</small>
      ))}
      {mine && (
        <>
          <button type="button" className="pis-x" aria-label={`Edit ${r.name} initiative`} title="Edit initiative" onClick={() => setEditing((e) => !e)}>
            <Icon name="pencil" size={12} />
          </button>
          <button type="button" className="pis-x" aria-label={`Remove ${r.name} from initiative`} title="Leave initiative" onClick={onLeave}>
            <Icon name="x" size={12} />
          </button>
        </>
      )}
    </span>
  )
}

function JoinForm({
  characters,
  onJoin,
  onCancel,
}: {
  characters: Character[]
  onJoin: (name: string, init: number, c: Character | null) => void
  onCancel: () => void
}) {
  const [pick, setPick] = useState(characters[0]?.key ?? '')
  const chosen = characters.find((c) => c.key === pick) ?? null
  const [name, setName] = useState(characters[0]?.name ?? '')
  const [init, setInit] = useState<number | null>(() => rollInitiative(characters[0]?.dexMod ?? 0))
  return (
    <div className="pis-pop" role="dialog" aria-label="Join initiative">
      {characters.length > 0 && (
        <label>
          Character
          <select
            className="input"
            value={pick}
            onChange={(e) => {
              const c = characters.find((x) => x.key === e.target.value) ?? null
              setPick(e.target.value)
              setName(c?.name ?? '')
              setInit(rollInitiative(c?.dexMod ?? 0))
            }}
          >
            {characters.map((c) => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
            <option value="">Another character…</option>
          </select>
        </label>
      )}
      {(characters.length === 0 || !chosen) && (
        <label>
          Name
          <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Character name" />
        </label>
      )}
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label>
          Initiative
          <NumberField value={init} min={-10} max={60} onChange={setInit} ariaLabel="Initiative" />
        </label>
        <button type="button" className="btn small" onClick={() => setInit(rollInitiative(chosen?.dexMod ?? 0))}>
          Reroll{chosen ? ` (d20 ${chosen.dexMod >= 0 ? '+' : '−'} ${Math.abs(chosen.dexMod)})` : ''}
        </button>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn small primary" disabled={!name.trim() || init == null} onClick={() => onJoin(name.trim(), init!, chosen)} data-testid="join-submit">
          Join
        </button>
        <button type="button" className="btn small" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
