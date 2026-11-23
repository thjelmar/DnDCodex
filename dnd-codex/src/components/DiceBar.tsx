import { useState } from 'react'
import { HISTORY_KEY, MAX_HISTORY, loadHistory } from './DiceRoller'
import { quickRoll, rollExpression, type RollMode, type RollResult } from '../lib/dice'

const DICE = [4, 6, 8, 10, 12, 20, 100]
const MODES: { id: RollMode; label: string }[] = [
  { id: 'disadvantage', label: 'Dis' },
  { id: 'normal', label: 'Norm' },
  { id: 'advantage', label: 'Adv' },
]

/**
 * Run mode's quick dice row under the map: a die button rolls at once, a formula field rolls an
 * expression, and Dis, Norm and Adv apply to a d20. It shares the roll history with the Dice tab (the
 * tab holds the full roller), through the same localStorage key. The bar hides while the tab is open,
 * so one set of dice is on screen at a time.
 */
export function DiceBar() {
  const [mode, setMode] = useState<RollMode>('normal')
  const [expr, setExpr] = useState('')
  const [latest, setLatest] = useState<RollResult | undefined>(() => loadHistory()[0])

  function record(r: RollResult | null) {
    if (!r) return
    setLatest(r)
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify([r, ...loadHistory()].slice(0, MAX_HISTORY)))
    } catch {
      /* private mode: the result still shows here */
    }
  }
  function rollFormula() {
    const r = rollExpression(expr, Date.now())
    if (r) {
      record(r)
      setExpr('')
    }
  }

  return (
    <div className="dice-bar" role="group" aria-label="Quick dice" data-testid="dice-bar">
      <div className="dice-bar-dice">
        {DICE.map((s) => (
          <button key={s} type="button" className="dice-bar-die" onClick={() => record(quickRoll(1, s, 0, mode, Date.now()))} aria-label={`Roll d${s}`}>
            d{s}
          </button>
        ))}
      </div>
      <input
        className="dice-bar-expr"
        value={expr}
        placeholder="2d6+3"
        aria-label="Roll formula"
        onChange={(e) => setExpr(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') rollFormula() }}
      />
      <button type="button" className="bm-btn primary" onClick={rollFormula} disabled={!expr.trim()}>Roll</button>
      <div className="bm-seg" role="group" aria-label="Advantage">
        {MODES.map((m) => (
          <button key={m.id} type="button" className={mode === m.id ? 'on' : ''} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <span className="dice-bar-last" aria-live="polite">
        {latest ? (
          <>
            <span className="faint">{latest.expression}</span>
            <b data-testid="dice-bar-total">{latest.total}</b>
          </>
        ) : (
          <span className="faint">Roll a die</span>
        )}
      </span>
    </div>
  )
}
