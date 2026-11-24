import { useState } from 'react'
import { demoDm, useDemoLive } from '../lib/demoLive'
import { isDemo } from '../lib/demo'
import { Icon } from './Icon'

/**
 * "Demo controls": plays the DM for the faux live session (lib/demoLive.ts), so one person
 * can try the whole player side alone. Rendered only in the demo, on the player session page.
 */
export function DemoLiveControls() {
  const demo = useDemoLive()
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 700)
  const [target, setTarget] = useState('')
  if (!isDemo()) return null
  const c = demo.combat
  const rows = c ? [...c.rows].sort((a, b) => a.sortOrder - b.sortOrder) : []
  const pick = rows.find((r) => r.id === target) ?? rows[0]
  const tokenId = demo.tokens.find((t) => t.id === target)?.id ?? demo.tokens[0]?.id
  return (
    <section className="demo-ctl card" data-testid="demo-controls" aria-label="Demo controls">
      <button type="button" className="demo-ctl-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="play" size={13} /> <b>Demo controls</b>
        <span className="faint">You are the player. These buttons play the DM. Nothing leaves your browser.</span>
        <span className="demo-ctl-caret">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="demo-ctl-body">
          <div className="demo-ctl-row">
            <button type="button" className="btn small" data-testid="demo-ask" onClick={demoDm.askInitiative}>Ask players for initiative</button>
            <button type="button" className="btn small primary" data-testid="demo-start" onClick={demoDm.startCombat}>Start combat</button>
            <button type="button" className="btn small" data-testid="demo-next" onClick={demoDm.nextTurn} disabled={c?.phase !== 'active'}>Next turn</button>
            <button type="button" className="btn small" data-testid="demo-add" onClick={demoDm.addCombatant}>Add a wolf</button>
            <button type="button" className="btn small" data-testid="demo-end" onClick={demoDm.endCombat} disabled={!c}>End combat</button>
            <button type="button" className="btn small" data-testid="demo-ping" onClick={demoDm.ping}>Ping the map</button>
            <button type="button" className="btn small ghost" data-testid="demo-reset" onClick={demoDm.reset}>Reset demo</button>
          </div>
          <div className="demo-ctl-row">
            <label className="demo-ctl-lbl">
              Combatant
              <select className="input" value={pick?.id ?? ''} onChange={(e) => setTarget(e.target.value)} disabled={!rows.length} data-testid="demo-target">
                {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <button type="button" className="btn small" disabled={!pick} onClick={() => pick && demoDm.hp(pick.id, -5)}>Damage 5</button>
            <button type="button" className="btn small" disabled={!pick} onClick={() => pick && demoDm.hp(pick.id, 5)}>Heal 5</button>
            <button type="button" className="btn small" disabled={!pick} onClick={() => pick && demoDm.toggleCondition(pick.id, 'Prone')}>Toggle Prone</button>
          </div>
          <div className="demo-ctl-row">
            <label className="demo-ctl-lbl">
              Token
              <select className="input" value={tokenId ?? ''} onChange={(e) => setTarget(e.target.value)} data-testid="demo-token">
                {demo.tokens.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            {([['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]] as const).map(([glyph, dc, dr]) => (
              <button key={glyph} type="button" className="btn small" aria-label={`Move token ${glyph}`} onClick={() => tokenId && demoDm.moveToken(tokenId, dc, dr)}>{glyph}</button>
            ))}
          </div>
          <p className="faint demo-ctl-log" aria-live="polite" data-testid="demo-log">{demo.log[0]}</p>
        </div>
      )}
    </section>
  )
}
