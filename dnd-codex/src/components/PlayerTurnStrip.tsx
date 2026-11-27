import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { BmIcon } from './battlemap/BmIcon'
import { possessiveTurn } from './battlemap/TurnStrip'
import { JoinForm, useMyCharacters } from './PlayerInitiativePanel'
import { endMyTurn, joinCombat, leaveCombat, orderRows, setMyInitiative, type LiveCombat, type LiveCombatRow } from '../auth/liveCombat'
import { initials } from '../lib/tabletop'

// The player's turn strip (T-108), bottom left of the map. It wears the DM's turn strip
// (battlemap/TurnStrip.tsx): the same `bm-turns` pill, round and turn line, and one round chip per
// combatant in order. A player gets no Next. On their own turn the strip shows End turn; while the DM
// gathers initiative it shows Join initiative; a pop-up above the strip sets the initiative number or
// leaves the combat. Chips carry initials only, never HP. This file never imports the DM's reveal guard.

/** True while the DM is asking and this player is not in the order: drives the badge on the tab. */
export function needsInitiative(combat: LiveCombat | null, userId: string | null): boolean {
  return !!combat && combat.phase === 'gathering' && !!userId && !combat.rows.some((r) => r.controlledBy === userId)
}

export function PlayerTurnStrip({
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
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const characters = useMyCharacters(localCampaignId)
  const [popStyle, setPopStyle] = useState<CSSProperties>({})

  // Keep the pop-up inside the visible area and clear of the strip (T-118). It is portalled to <body>
  // and fixed-positioned from the strip's rect: above the strip when there is room, else below it,
  // else beside it. Its height is capped to the room it has and it scrolls inside. Bars that are
  // covered (the session header behind full screen) are ignored.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = Math.min(340, vw - 24)
      let top = 8
      for (const bar of document.querySelectorAll('.session-header, .player-live-bar, .demo-banner')) {
        const b = bar.getBoundingClientRect()
        if (b.height <= 0 || b.bottom >= r.top || b.width < vw * 0.6) continue /* only full-width bars above the map */
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
        if (hit && bar.contains(hit)) top = Math.max(top, b.bottom + 8)
      }
      const above = r.top - top - 8
      const below = vh - r.bottom - 16
      const left = Math.max(8, Math.min(r.left, vw - w - 8))
      const base: CSSProperties = { position: 'fixed', left, overflowY: 'auto' }
      const best = Math.max(above, below)
      if (best < 140) {
        // Too little room above or below: open beside the strip, as tall as the screen allows.
        const right = r.right + 8
        const sideLeft = right + w <= vw - 8 ? right : r.left - 8 - w >= 8 ? r.left - 8 - w : null
        if (sideLeft != null) { setPopStyle({ ...base, left: sideLeft, top, maxHeight: Math.max(120, vh - top - 8) }); return }
      }
      // Above the strip unless that side has little room and below has more.
      if (above < 240 && below > above) setPopStyle({ ...base, top: r.bottom + 8, maxHeight: Math.max(80, below) })
      else setPopStyle({ ...base, bottom: vh - r.top + 8, maxHeight: Math.max(80, above) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])

  // Close the pop-up on Escape or a press outside it.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: PointerEvent) => { const t = e.target as Node; if (ref.current && !ref.current.contains(t) && !popRef.current?.contains(t)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [open])
  // No combat closes everything; a new turn clears "Waiting for your DM".
  const myTurn = combat && combat.phase === 'active' && userId ? combat.rows.filter((r) => r.controlledBy === userId && combat.activeIds.includes(r.id)) : []
  const turnRowId = myTurn[0]?.id
  useEffect(() => { setAsked(null) }, [turnRowId])
  useEffect(() => { if (!combat) setOpen(false) }, [combat])
  if (!combat) return null

  const rows = orderRows(combat.rows)
  const mine = rows.filter((r) => userId && r.controlledBy === userId)
  const asking = needsInitiative(combat, userId)
  const joinedNames = new Set(mine.map((r) => r.name.trim().toLowerCase()))
  const joinable = characters.filter((c) => !joinedNames.has(c.name.trim().toLowerCase()))
  const active = combat.phase === 'active'
  const current = rows.find((r) => combat.activeIds.includes(r.id))
  const turnLine = current ? possessiveTurn(current.name) : ''

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`bm-turns pl-turns${asking ? ' asking' : ''}`} data-testid="initiative-strip" role="group" aria-label="Turn order" ref={ref}>
      <div className="bm-turns-round" aria-live="polite">
        {active ? (
          <>
            <strong data-testid="strip-round">Round {combat.round}</strong>
            <small data-testid={myTurn.length > 0 ? 'your-turn' : undefined}>
              {myTurn.length > 0 ? `Your turn${myTurn.length === 1 ? ` · ${myTurn[0].name}` : ''}` : turnLine}
            </small>
          </>
        ) : (
          <>
            <strong data-testid="strip-round">Roll for initiative</strong>
            <small>{mine.length > 0 ? 'You are in' : 'Your DM is asking'}</small>
          </>
        )}
      </div>

      {myTurn.length > 0 && (
        <button
          type="button"
          className="bm-btn primary bm-turns-next"
          data-testid="end-turn"
          disabled={busy || asked === turnRowId}
          onClick={() => run(async () => { await endMyTurn(cloudCampaignId, turnRowId!); setAsked(turnRowId!) })}
        >
          {asked === turnRowId ? 'Waiting for your DM…' : 'End turn'}
        </button>
      )}
      {userId && mine.length === 0 && (
        <button type="button" className={`bm-btn${asking ? ' primary pl-ask-btn' : ''} bm-turns-next`} data-testid="join-initiative" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Join initiative
        </button>
      )}
      {userId && mine.length > 0 && myTurn.length === 0 && !active && (
        <button type="button" className="bm-btn bm-turns-next" data-testid="join-initiative" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Set my initiative
        </button>
      )}
      {userId && mine.length > 0 && active && (
        <button
          type="button"
          className="bm-icon-btn"
          data-testid="strip-options"
          aria-expanded={open}
          aria-label="Set my initiative or leave combat"
          title="Set my initiative or leave combat"
          onClick={() => setOpen((o) => !o)}
        >
          <BmIcon name="more" />
        </button>
      )}
      <span className="bm-turns-sep" aria-hidden />
      <ol className="bm-turns-chips">
        {rows.map((r) => (
          <li key={r.id}><Chip r={r} turn={combat.activeIds.includes(r.id)} mine={!!userId && r.controlledBy === userId} /></li>
        ))}
        {rows.length === 0 && <li className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>Nobody yet</li>}
      </ol>

      {open && userId && createPortal(
        <div className="pl-turns-pop" data-testid="join-pop" style={popStyle} ref={popRef} role="dialog" aria-label="Join initiative">
          <JoinForm
            joinable={joinable}
            mine={mine}
            onJoin={(name, init, c) =>
              run(async () => {
                await joinCombat(cloudCampaignId, name, init, c?.hp ?? null, c?.maxHp ?? null, c?.key ?? name.trim().toLowerCase())
                setOpen(false)
              })
            }
            onSet={(rowId, init) =>
              run(async () => {
                await setMyInitiative(cloudCampaignId, rowId, init)
                setOpen(false)
              })
            }
            onDone={() => setOpen(false)}
          />
          {mine.length > 0 && (
            <button
              type="button"
              className="bm-btn"
              style={{ marginTop: 8 }}
              data-testid="leave-combat"
              onClick={() => run(async () => { for (const r of mine) await leaveCombat(cloudCampaignId, r.id); setOpen(false) })}
            >
              Leave combat
            </button>
          )}
        </div>,
        document.body,
      )}
      {error && <span className="pis-error pl-turns-err" role="alert">{error}</span>}
    </div>
  )
}

function Chip({ r, turn, mine }: { r: LiveCombatRow; turn: boolean; mine: boolean }) {
  const down = r.kind !== 'enemy' && r.hp != null && r.hp <= 0
  const group = r.groupCount != null && r.groupCount > 1
  return (
    <span
      className={`bm-chip${turn ? ' turn' : ''}${down ? ' down' : ''}${mine ? ' mine' : ''}`}
      data-testid="strip-chip"
      data-kind={r.kind}
      aria-current={turn ? 'step' : undefined}
      title={`${r.name}${group ? ` × ${r.groupCount}` : ''}${r.initiative != null ? ` (initiative ${r.initiative})` : ''}`}
    >
      {initials(r.name)}
    </span>
  )
}
