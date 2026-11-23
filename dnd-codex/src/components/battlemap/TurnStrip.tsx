import { initials } from '../../lib/tabletop'
import type { Combatant, CombatState } from '../../lib/combat'
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
  onStart,
  onNext,
}: {
  state: CombatState
  /** Color for a combatant's chip, by combatant id (tokens on this map). */
  looks: Record<string, ChipLook>
  onStart: () => void
  onNext: () => void
}) {
  const list = state.combatants
  if (list.length === 0) return null
  const current: Combatant | undefined = state.active ? list[state.turnIndex] : undefined
  return (
    <div className="bm-turns" data-testid="bm-turns" role="group" aria-label="Turn order">
      {state.active ? (
        <>
          <div className="bm-turns-round" aria-live="polite">
            <strong>Round {state.round}</strong>
            <small>{current ? possessiveTurn(current.name) : ''}</small>
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
        {list.map((c, i) => {
          const turn = state.active && i === state.turnIndex
          const down = c.hp != null && c.hp <= 0 && !c.isPC
          return (
            <li key={c.id}>
              <span
                className={`bm-chip${turn ? ' turn' : ''}${down ? ' down' : ''}`}
                style={looks[c.id]?.color ? { background: looks[c.id].color! } : undefined}
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
