import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { liveTokensForBoard, moveMyToken, placeMyTemplate, removeMyTemplate, usePlayerTemplates, useLiveScene } from '../auth/liveScene'
import { getMyColor, setMyColor } from '../auth/cloud'
import { useFullscreen } from '../lib/useFullscreen'
import { TOKEN_COLORS } from '../lib/tabletop'
import { Tabletop } from './Tabletop'
import { TokenStatusCard, hasFloatingStatus } from './TokenStatusCard'
import { Icon } from './Icon'
import type { SceneTemplate, TemplateShape } from '../db/types'

/** Spell-area presets a player can drop on the live map (shape defaults to the
 *  effect type: a burst is a circle, a breath/cone is a cone, a bolt is a line). */
const SPELL_PRESETS: { label: string; shape: TemplateShape; sizeFt: number }[] = [
  { label: 'Burst 10 ft', shape: 'circle', sizeFt: 10 },
  { label: 'Burst 20 ft', shape: 'circle', sizeFt: 20 },
  { label: 'Cone 15 ft', shape: 'cone', sizeFt: 15 },
  { label: 'Cone 30 ft', shape: 'cone', sizeFt: 30 },
  { label: 'Cone 60 ft', shape: 'cone', sizeFt: 60 },
  { label: 'Line 30 ft', shape: 'line', sizeFt: 30 },
]

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
  // Spell areas the player drops on the shared map (persisted via the RPCs).
  const [spellOpen, setSpellOpen] = useState(false)
  const [spellTool, setSpellTool] = useState<{ shape: TemplateShape; sizeFt: number; color: string } | null>(null)
  const pt = usePlayerTemplates(linkedCampaignId)

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

  // Every area on the board: the DM's templates plus the ones players dropped.
  const allTemplates = useMemo(
    () => [...(live.scene?.templates ?? []), ...pt.templates],
    [live.scene, pt.templates],
  )
  const myTemplateIds = useMemo(
    () => pt.templates.filter((t) => t.createdBy === user?.id).map((t) => t.id),
    [pt.templates, user],
  )
  const spellColor = myColor ?? '#a78bfa'

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

  function armSpell(preset: (typeof SPELL_PRESETS)[number]) {
    setMeasuring(false)
    setSpellTool({ shape: preset.shape, sizeFt: preset.sizeFt, color: spellColor })
    setSpellOpen(false)
  }

  async function placeTemplate(t: { shape: TemplateShape; col: number; row: number; sizeFt: number; dir?: number; color: string }) {
    if (!user) return
    const tpl: SceneTemplate = { id: crypto.randomUUID(), shape: t.shape, col: t.col, row: t.row, sizeFt: t.sizeFt, dir: t.dir, color: t.color }
    pt.setTemplates((ts) => [...ts, { ...tpl, createdBy: user.id }]) // optimistic
    setError(null)
    try {
      await placeMyTemplate(linkedCampaignId, tpl)
    } catch (e) {
      pt.setTemplates((ts) => ts.filter((x) => x.id !== tpl.id))
      setError(e instanceof Error ? e.message : 'Could not place that spell area.')
    }
  }

  async function clearMyTemplates() {
    const ids = myTemplateIds
    pt.setTemplates((ts) => ts.filter((t) => t.createdBy !== user?.id)) // optimistic
    for (const id of ids) {
      try {
        await removeMyTemplate(id)
      } catch {
        /* best-effort; a failed delete reappears on the next refresh */
      }
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
            onClick={() => { setSpellTool(null); setSpellOpen(false); setMeasuring((m) => !m) }}
            title="Ruler: drag on the map to measure distance in feet"
          >
            📏 {measuring ? 'Done' : 'Measure'}
          </button>
          <div className="player-spell-wrap">
            <button
              className={`btn small${spellTool ? ' primary' : ''}`}
              onClick={() => { if (spellTool) { setSpellTool(null); setSpellOpen(false) } else setSpellOpen((o) => !o) }}
              aria-expanded={spellOpen}
              title="Drop a spell area (burst, cone or line) on the map"
            >
              ✨ {spellTool ? 'Stop' : 'Spell area'}
            </button>
            {spellOpen && !spellTool && (
              <div className="player-spell-menu" role="menu">
                {SPELL_PRESETS.map((p) => (
                  <button key={p.label} className="player-spell-opt" role="menuitem" onClick={() => armSpell(p)}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {myTemplateIds.length > 0 && (
            <button className="btn ghost small" onClick={clearMyTemplates} title="Remove the spell areas you placed">
              Clear mine
            </button>
          )}
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
          {spellTool
            ? 'Tap the map to drop your spell area (drag to aim a cone or line). Tap Stop when you’re done.'
            : measuring
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
          templates={allTemplates}
          templateTool={spellTool}
          onPlaceTemplate={placeTemplate}
          measureTool={measuring}
          renderTokenPanel={(t) => {
            const cc = board.combat?.[t.id]
            return hasFloatingStatus(cc) ? <TokenStatusCard token={t} combat={cc} /> : null
          }}
        />
      </div>
      {compact && !fs.expanded && ownIds.size > 0 && (
        <p className="faint" style={{ fontSize: 12, margin: '6px 0 0' }}>Drag your token (green ring) to move it.</p>
      )}
    </div>
  )
}
