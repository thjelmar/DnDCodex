import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { liveTokensForBoard, moveMyToken, useLiveScene } from '../auth/liveScene'
import { getMyColor, setMyColor } from '../auth/cloud'
import { useFullscreen } from '../lib/useFullscreen'
import { TOKEN_COLORS } from '../lib/tabletop'
import { Tabletop } from './Tabletop'
import { Icon } from './Icon'

// The player's view of the DM's live battle map, in the live-session page's
// Tabletop (players only see maps during a session). Players pan and
// zoom their own view, drag only the token assigned to them (green dashed
// ring), pick the color their tokens wear, and can go full screen with `notes`
// beside the map.

/**
 * The board for a page that already holds the live subscription (e.g. one that
 * lays itself out differently while a map is showing), so moving the board
 * between columns doesn't re-subscribe.
 */
export function PlayerLiveBoardView({
  live,
  linkedCampaignId,
  notes,
  notesLabel = 'Notes',
  compact = false,
  empty,
  onExpandedChange,
}: {
  linkedCampaignId: string
  /** Shown beside the map in full screen (e.g. the player's session notes). */
  notes?: ReactNode
  notesLabel?: string
  /** Small inline board (e.g. a sidebar card); full screen still gets the room. */
  compact?: boolean
  /** Rendered when the DM isn't showing a map. */
  empty?: ReactNode
  /** Told when full screen opens/closes (so a page can pause a duplicate editor). */
  onExpandedChange?: (expanded: boolean) => void
  live: ReturnType<typeof useLiveScene>
}) {
  const { user } = useAuth()
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fs = useFullscreen()
  const onExpandedRef = useRef(onExpandedChange)
  onExpandedRef.current = onExpandedChange
  useEffect(() => {
    onExpandedRef.current?.(fs.expanded)
  }, [fs.expanded])
  // Unmounting while expanded (e.g. the page moves the board when the DM stops
  // the map) must still tell the page full screen is over.
  useEffect(() => () => onExpandedRef.current?.(false), [])
  const [notesOpen, setNotesOpen] = useState(true)
  // Ruler: drag the board to measure distance in feet (ephemeral, local — the
  // player's own tool; nothing is shared or persisted).
  const [measuring, setMeasuring] = useState(false)

  // My color (per campaign). Applied to my tokens right away so picking feels
  // instant; the DM's screen re-pushes it to everyone else a moment later.
  const [myColor, setMyColorState] = useState<string | null>(null)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getMyColor(linkedCampaignId, user.id).then((c) => {
      if (!cancelled) setMyColorState(c)
    })
    return () => {
      cancelled = true
    }
  }, [linkedCampaignId, user])
  async function pickColor(c: string) {
    const prev = myColor
    setMyColorState(c)
    setError(null)
    try {
      await setMyColor(linkedCampaignId, c)
    } catch (e) {
      setMyColorState(prev)
      setError(e instanceof Error ? e.message : 'Could not save your color.')
    }
  }

  const ownIds = useMemo(
    () => new Set(live.tokens.filter((t) => user && t.controlledBy === user.id).map((t) => t.id)),
    [live.tokens, user],
  )
  const board = useMemo(() => {
    const b = liveTokensForBoard(live.tokens)
    if (!myColor) return b
    return { ...b, tokens: b.tokens.map((t) => (ownIds.has(t.id) ? { ...t, color: myColor } : t)) }
  }, [live.tokens, myColor, ownIds])

  async function move(id: string, col: number, row: number) {
    const prev = live.tokens
    setError(null)
    // Optimistic: move now, roll back if the server refuses.
    live.setTokens((ts) => ts.map((t) => (t.id === id ? { ...t, col, row } : t)))
    try {
      await moveMyToken(id, col, row)
    } catch (e) {
      live.setTokens(prev)
      setError(e instanceof Error ? e.message : 'Could not move that token.')
    }
  }

  if (!user) return <p className="faint" style={{ fontSize: 13 }}>Sign in to see your DM's battle map.</p>
  if (live.loading) return <p className="faint" style={{ fontSize: 13 }}>Loading…</p>
  if (!live.scene) {
    return (
      <>
        {empty ?? (
          <div className="empty">
            <div className="big">🗺️</div>
            <p>Your DM isn't showing a battle map right now. When they do, it appears here live.</p>
          </div>
        )}
      </>
    )
  }

  const withNotes = fs.expanded && notesOpen && !!notes

  return (
    <div className={`player-live-board battlemap-editor${fs.expanded ? ' expanded' : ''}${compact ? ' compact' : ''}`}>
      <div className="player-live-bar">
        {(fs.expanded || !compact) && (
          <strong className="player-live-name">
            {live.scene.name || 'Battle Map'}
            <span className="battlemap-live-pill"><span className="battlemap-live-dot" aria-hidden /> Live</span>
          </strong>
        )}
        <div className="battlemap-mycolor" role="radiogroup" aria-label="Your token color" title="The color your tokens wear on everyone's map">
          <span className="faint">Your color</span>
          {TOKEN_COLORS.map((c) => (
            <button
              key={c}
              className={`battlemap-swatch${myColor === c ? ' on' : ''}`}
              style={{ background: c }}
              onClick={() => pickColor(c)}
              aria-label={`Color ${c}`}
              aria-checked={myColor === c}
              role="radio"
            />
          ))}
          <input
            type="color"
            className="battlemap-color-custom"
            value={myColor && !TOKEN_COLORS.includes(myColor) ? myColor : '#ffffff'}
            onChange={(e) => pickColor(e.target.value)}
            aria-label="Custom color"
            title="Pick any color"
          />
        </div>
        <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          <button
            className={`btn small${measuring ? ' primary' : ''}`}
            onClick={() => setMeasuring((m) => !m)}
            title="Ruler: drag on the map to measure distance in feet"
          >
            📏 {measuring ? 'Done' : 'Measure'}
          </button>
          {fs.expanded && notes && (
            <button className={`btn small${notesOpen ? ' primary' : ''}`} onClick={() => setNotesOpen((o) => !o)}>
              📝 {notesOpen ? `Hide ${notesLabel.toLowerCase()}` : notesLabel}
            </button>
          )}
          <button className={`btn small${fs.expanded ? ' primary' : ''}`} onClick={fs.expanded ? fs.exit : fs.enter}>
            <Icon name={fs.expanded ? 'minimize' : 'maximize'} size={14} color={fs.expanded ? 'inherit' : undefined} />{' '}
            {fs.expanded ? 'Exit full screen' : 'Full screen'}
          </button>
        </div>
      </div>

      {!fs.expanded && !compact && (
        <p className="faint" style={{ fontSize: 13, margin: '0 0 8px' }}>
          {measuring
            ? 'Drag across the map to measure distance in feet. Tap Done to move tokens again.'
            : ownIds.size > 0
              ? 'Drag your token (green ring) to move it. Scroll to zoom, drag the map to pan.'
              : 'Scroll to zoom, drag to pan. Your DM moves the tokens.'}
        </p>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}

      <div className={`battlemap-body player${withNotes ? ' with-notes' : ''}`}>
        {withNotes && <aside className="battlemap-notes">{notes}</aside>}
        <Tabletop
          width={live.scene.width}
          height={live.scene.height}
          grid={live.scene.grid}
          tokens={board.tokens}
          mapUrl={live.mapUrl}
          portraits={board.portraits}
          selectedId={selected}
          onSelect={setSelected}
          onMoveToken={move}
          onResizeToken={() => {}}
          onDeleteToken={() => {}}
          onOpenToken={() => {}}
          aligning={false}
          onAlign={() => {}}
          editable={false}
          canMoveToken={(t) => ownIds.has(t.id)}
          ownIds={ownIds}
          fog={live.scene.fog ?? null}
          combat={board.combat}
          templates={live.scene.templates ?? undefined}
          measureTool={measuring}
        />
      </div>
      {compact && !fs.expanded && ownIds.size > 0 && (
        <p className="faint" style={{ fontSize: 12, margin: '6px 0 0' }}>Drag your token (green ring) to move it.</p>
      )}
    </div>
  )
}
