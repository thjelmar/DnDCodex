import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import { quickRoll, rollExpression, type RollMode, type RollResult } from '../lib/dice'

const DICE = [4, 6, 8, 10, 12, 20, 100]
const HISTORY_KEY = 'dnd-codex-dice-history'
const MAX_HISTORY = 20

function loadHistory(): RollResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as RollResult[]) : []
  } catch {
    return []
  }
}

export function DiceRoller({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [count, setCount] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [mode, setMode] = useState<RollMode>('normal')
  const [expr, setExpr] = useState('')
  const [history, setHistory] = useState<RollResult[]>(loadHistory)
  const exprRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
  }, [history])

  const latest = history[0]

  function record(result: RollResult | null) {
    if (result) setHistory((h) => [result, ...h].slice(0, MAX_HISTORY))
  }

  function rollDie(sides: number) {
    record(quickRoll(Math.max(1, count), sides, modifier, mode, Date.now()))
  }

  function rollExpr() {
    const result = rollExpression(expr, Date.now())
    if (result) {
      record(result)
      setExpr('')
    } else if (expr.trim()) {
      // Flash an invalid state by keeping the field; a subtle shake via class.
      exprRef.current?.focus()
    }
  }

  if (!open) return null

  return (
    <Modal
      title="🎲 Dice Roller"
      onClose={onClose}
      footer={
        <>
          {history.length > 0 && (
            <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => setHistory([])}>
              Clear log
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {/* Latest result */}
      <div
        className="card"
        style={{ cursor: 'default', textAlign: 'center', padding: '18px 16px', marginBottom: 16 }}
      >
        {latest ? (
          <>
            <div style={{ fontSize: 46, fontFamily: 'var(--serif)', lineHeight: 1, color: 'var(--accent)' }}>
              {latest.total}
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              <span className="faint">{latest.expression} · </span>
              {latest.terms.map((t, i) => (
                <span key={i}>
                  {t.rolls.length > 0 && (
                    <>
                      [
                      {t.rolls.map((r, j) => (
                        <span
                          key={j}
                          style={{
                            fontWeight: t.keptIndex === j ? 700 : 400,
                            opacity: t.keptIndex !== undefined && t.keptIndex !== j ? 0.4 : 1,
                            textDecoration:
                              t.keptIndex !== undefined && t.keptIndex !== j ? 'line-through' : 'none',
                            color: r === maxFace(t.label) ? 'var(--good)' : undefined,
                          }}
                        >
                          {r}
                          {j < t.rolls.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                      ]{' '}
                    </>
                  )}
                  {t.rolls.length === 0 && <span>{t.label} </span>}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="faint">Roll a die to get started.</div>
        )}
      </div>

      {/* Quantity / modifier / advantage controls */}
      <div className="row wrap" style={{ gap: 12, marginBottom: 12, alignItems: 'flex-end' }}>
        <div className="field" style={{ margin: 0, width: 78 }}>
          <label>Count</label>
          <input
            type="number"
            className="input"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
          />
        </div>
        <div className="field" style={{ margin: 0, width: 90 }}>
          <label>Modifier</label>
          <input
            type="number"
            className="input"
            value={modifier}
            onChange={(e) => setModifier(Number(e.target.value) || 0)}
          />
        </div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 180 }}>
          <label>d20 roll</label>
          <div className="dice-mode">
            {(['disadvantage', 'normal', 'advantage'] as RollMode[]).map((m) => (
              <button
                key={m}
                className={mode === m ? 'active' : ''}
                onClick={() => setMode(m)}
                title={m}
              >
                {m === 'normal' ? 'Normal' : m === 'advantage' ? 'Adv' : 'Dis'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dice buttons */}
      <div className="dice-grid">
        {DICE.map((sides) => (
          <button key={sides} className="die-btn" onClick={() => rollDie(sides)}>
            <span className="die-label">d{sides}</span>
          </button>
        ))}
      </div>

      {/* Custom expression */}
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <input
          ref={exprRef}
          className="input"
          placeholder="Custom roll, e.g. 2d6+3 or 1d8+1d6"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && rollExpr()}
        />
        <button className="btn primary" onClick={rollExpr} disabled={!expr.trim()}>
          Roll
        </button>
      </div>

      {/* History */}
      {history.length > 1 && (
        <div style={{ marginTop: 18 }}>
          <div className="sidebar-heading" style={{ margin: '0 0 6px' }}>
            Log
          </div>
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {history.slice(1).map((r, i) => (
              <div key={i} className="row between" style={{ padding: '4px 2px', fontSize: 13 }}>
                <span className="faint">{r.expression}</span>
                <span>
                  {r.terms
                    .filter((t) => t.rolls.length)
                    .map((t) => `[${t.rolls.join(', ')}]`)
                    .join(' ')}{' '}
                  <strong style={{ color: 'var(--text)' }}>= {r.total}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

// Best-effort: highlight a natural-max die (e.g. a 20 on a d20) green.
function maxFace(label: string): number {
  const m = /d(\d+)/.exec(label)
  return m ? parseInt(m[1], 10) : -1
}
