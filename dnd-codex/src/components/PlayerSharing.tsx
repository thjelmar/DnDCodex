import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { updateCampaign } from '../db/repo'
import { Icon } from './Icon'
import { useCombatMembers, useRevealContext } from '../lib/revealContext'
import type { useCombat } from './CombatRoster'
import type { Combatant } from '../lib/combat'
import type { MarkerSettings } from '../lib/liveCombat'

// The DM's controls for what players see of the combat (T-100): open initiative,
// the three health markers, and per-combatant hide, controller and marker override.
// DM only: every control returns null outside a DM campaign.

export const MARKER_LABELS: { key: keyof MarkerSettings; label: string; hint: string }[] = [
  { key: 'injured', label: 'Injured', hint: '50% or below' },
  { key: 'bloodied', label: 'Bloodied', hint: '25% or below' },
  { key: 'deathsDoor', label: 'Death’s door', hint: 'under 5%' },
]

/** The campaign's health marker settings and a setter that saves one. */
export function useMarkerSettings(): { settings: MarkerSettings; set: (k: keyof MarkerSettings, on: boolean) => void; dm: boolean } {
  const ctx = useRevealContext()
  const campaign = useLiveQuery(() => (ctx ? db.campaigns.get(ctx.campaignId) : undefined), [ctx?.campaignId])
  const settings = campaign?.combatMarkers ?? {}
  return {
    dm: !!ctx?.isDm,
    settings,
    set: (k, on) => {
      if (ctx) void updateCampaign(ctx.campaignId, { combatMarkers: { ...settings, [k]: on } })
    },
  }
}

/** Header bar: open initiative to players, and the health marker opt-ins. */
export function PlayerSharingBar({ combat }: { combat: ReturnType<typeof useCombat> }) {
  const { dm, settings, set } = useMarkerSettings()
  if (!dm) return null
  const { state } = combat
  return (
    <div className="combat-share-bar" data-testid="player-sharing-bar">
      {!state.active &&
        (state.askPlayers ? (
          <button className="btn small" onClick={() => combat.askPlayers(false)} data-testid="stop-asking">
            Stop asking players
          </button>
        ) : (
          <button className="btn small" onClick={() => combat.askPlayers(true)} data-testid="ask-players">
            Ask players for initiative
          </button>
        ))}
      {state.askPlayers && !state.active && <span className="faint">Players can join now. NPCs stay private until combat starts.</span>}
      <span className="faint">Health markers for players:</span>
      {MARKER_LABELS.map((m) => (
        <label key={m.key} className="row" style={{ gap: 4, fontSize: 13 }} title={m.hint}>
          <input type="checkbox" checked={!!settings[m.key]} onChange={(e) => set(m.key, e.target.checked)} /> {m.label}
        </label>
      ))}
    </div>
  )
}

/** Per-combatant controls: hide from players, who controls it, and its marker override. */
export function PlayerShareControls({
  c,
  onPatch,
  onHide,
  eyeOnly = false,
}: {
  c: Combatant
  onPatch: (p: Partial<Combatant>) => void
  onHide: (hidden: boolean) => void
  /** Show only the hide toggle (a monster group row). */
  eyeOnly?: boolean
}) {
  const ctx = useRevealContext()
  const members = useCombatMembers()
  if (!ctx?.isDm) return null
  const hidden = !!c.hiddenFromPlayers
  return (
    <>
      <button
        className="btn ghost small"
        onClick={() => onHide(!hidden)}
        aria-pressed={hidden}
        aria-label={hidden ? `Show ${c.name} to players` : `Hide ${c.name} from players`}
        title={hidden ? 'Hidden from players. Click to show.' : 'Visible to players. Click to hide.'}
        data-testid="hide-from-players"
      >
        <Icon name={hidden ? 'eye-off' : 'eye'} size={14} />
      </button>
      {!eyeOnly && (members.length > 0 || !c.isPC) && (
        <details className="combat-share">
          <summary title="Player controls">Players</summary>
          <div className="combat-share-pop">
            {members.length > 0 && (
              <label>
                Controlled by
                <select
                  className="input"
                  value={c.controlledBy ?? ''}
                  onChange={(e) => onPatch({ controlledBy: e.target.value || null })}
                  data-testid="controlled-by"
                >
                  <option value="">Nobody</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.name}</option>
                  ))}
                </select>
              </label>
            )}
            {!c.isPC && (
              <label>
                Health marker
                <select
                  className="input"
                  value={c.showHealthMarker == null ? 'follow' : c.showHealthMarker ? 'on' : 'off'}
                  onChange={(e) => onPatch({ showHealthMarker: e.target.value === 'follow' ? null : e.target.value === 'on' })}
                >
                  <option value="follow">Follow campaign</option>
                  <option value="off">Never show</option>
                  <option value="on">Always show</option>
                </select>
              </label>
            )}
          </div>
        </details>
      )}
    </>
  )
}
