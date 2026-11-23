import { initials } from '../../lib/tabletop'
import { turnSlots, type CombatState } from '../../lib/combat'
import { groupNameFor } from '../../lib/battleGroups'
import { BmIcon } from './BmIcon'

/** "Sable's turn", and "Thugs' turn" for a name that ends in s. */
export function possessiveTurn(name: string): string {
  return /s$/i.test(name) ? `${name}' turn` : `${name}'s turn`
}

/** A chip's look: initials and color, taken from the combatant's token on this map. */
export interface ChipLook {
  color: string | null
}

/**
 * The turn order strip, bottom left of the map: the round, whose turn it is, a
 * Next button (key N) and one chip per combatant. It reads the shared combat
 * state, so the Run mode tracker and this strip always agree.
 */
export function TurnStrip({
  state,
  looks,
  groupNames,
  onStart,
  onNext,
  onSelect,
}: {
  state: CombatState
  /** Color for a combatant's chip, by combatant id (tokens on this map). */
  looks: Record<string, ChipLook>
  /** Group names by group id, for the "Thugs' turn" line. */
  groupNames?: Record<string, string>
  onStart: () => void
  onNext: () => void
  /** A chip was clicked: the combatant ids of its slot. */
  onSelect?: (ids: string[]) => void
}) {
  const list = state.combatants
  if (list.length === 0) return null
  // A monster group is one slot, drawn as one chip of stacked avatars.
  const slots = turnSlots(list)
  const currentSlot = state.active ? slots.find((s) => s.some((c) => c.id === list[state.turnIndex]?.id)) : undefined
  const turnLine = !currentSlot
    ? ''
    : currentSlot.length > 1
      ? possessiveTurn(groupNames?.[currentSlot[0].groupKey ?? ''] ?? groupNameFor(currentSlot.map((c) => c.name)))
      : possessiveTurn(currentSlot[0].name)
  return (
    <div className="bm-turns" data-testid="bm-turns" role="group" aria-label="Turn order">
      {state.active ? (
        <>
          <div className="bm-turns-round" aria-live="polite">
            <strong>Round {state.round}</strong>
            <small>{turnLine}</small>
          </div>
          <button type="button" className="bm-btn primary bm-turns-next" onClick={onNext} title="Next turn (N)">
            Next <BmIcon name="play" size={12} />
          </button>
        </>
      ) : (
        <button type="button" className="bm-btn primary bm-turns-next" onClick={onStart} title="Roll any missing initiative and start at the top of the order">
          Start combat
        </button>
      )}
      <span className="bm-turns-sep" aria-hidden />
      <ol className="bm-turns-chips">
        {slots.map((slot) => {
          const turn = !!currentSlot && slot === currentSlot
          if (slot.length > 1) {
            return (
              <li key={slot[0].id}>
                <span className={`bm-gchip${turn ? ' turn' : ''}`} data-testid="bm-group-chip" aria-label="Monster group" aria-current={turn ? 'step' : undefined} onClick={onSelect ? () => onSelect(slot.map((m) => m.id)) : undefined} style={onSelect ? { cursor: 'pointer' } : undefined}>
                  {slot.map((c) => (
                    <b key={c.id} className="bm-chip" style={looks[c.id]?.color ? { background: looks[c.id].color! } : undefined}>
                      {initials(c.name)}
                    </b>
                  ))}
                </span>
              </li>
            )
          }
          const c = slot[0]
          const down = c.hp != null && c.hp <= 0 && !c.isPC
          return (
            <li key={c.id}>
              <span
                className={`bm-chip${turn ? ' turn' : ''}${down ? ' down' : ''}`}
                style={{ ...(looks[c.id]?.color ? { background: looks[c.id].color! } : {}), ...(onSelect ? { cursor: 'pointer' } : {}) }}
                onClick={onSelect ? () => onSelect([c.id]) : undefined}
                title={`${c.name}${c.initiative != null ? ` (initiative ${c.initiative})` : ''}`}
                aria-current={turn ? 'step' : undefined}
              >
                {initials(c.name)}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
