import { useState } from 'react'
import { BmIcon } from './battlemap/BmIcon'
import { TOKEN_COLORS } from '../lib/tabletop'
import type { PingsApi } from '../lib/usePings'

// Board buttons for map pings (T-102), shown beside the zoom buttons: the Ping
// tool (click or tap to ping, also the P key) and a small menu with the local
// on/off switch. On the DM's board the menu also holds the "Allow player pings
// and cursors" switch, a per-player mute, and the DM's own ping color.

export function PingControls({ pings }: { pings: PingsApi }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {pings.enabled && (
        <button
          className={`btn ghost small${pings.pingTool ? ' on' : ''}`}
          onClick={() => pings.setPingTool(!pings.pingTool)}
          aria-pressed={pings.pingTool}
          title="Ping tool: click or tap the map to ping (P)"
        >
          <BmIcon name="pin" size={16} /> Ping
        </button>
      )}
      <button className="btn ghost small" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Ping and cursor settings" aria-label="Ping and cursor settings">
        <BmIcon name="more" size={16} />
      </button>
      {open && (
        <div className="ping-menu" role="group" aria-label="Pings and cursors">
          <label className="ping-menu-row">
            <input type="checkbox" checked={pings.prefOn} onChange={(e) => pings.setPrefOn(e.target.checked)} />
            Show pings and cursors
          </label>
          {pings.isDm && (
            <>
              <label className="ping-menu-row">
                <input type="checkbox" checked={pings.allowPlayers} onChange={(e) => pings.setAllowPlayers(e.target.checked)} />
                Allow player pings and cursors
              </label>
              {pings.roster.length > 0 && (
                <div className="ping-menu-list">
                  <div className="faint">Mute a player</div>
                  {pings.roster
                    .filter((r) => r.k !== 'local')
                    .map((r) => (
                      <label key={r.k} className="ping-menu-row">
                        <input type="checkbox" checked={pings.muted.has(r.k)} onChange={() => pings.toggleMute(r.k)} />
                        <span className="ping-dot" style={{ background: r.color }} />
                        {r.name}
                      </label>
                    ))}
                </div>
              )}
              <div className="ping-menu-row" role="radiogroup" aria-label="Your ping color">
                <span className="faint">Your color</span>
                {TOKEN_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`battlemap-swatch${pings.myColor === c ? ' on' : ''}`}
                    style={{ background: c }}
                    role="radio"
                    aria-checked={pings.myColor === c}
                    aria-label={c}
                    onClick={() => pings.setMyColor(c)}
                  />
                ))}
              </div>
            </>
          )}
          {!pings.online && <div className="faint">Offline: only you see your pings.</div>}
        </div>
      )}
    </>
  )
}
