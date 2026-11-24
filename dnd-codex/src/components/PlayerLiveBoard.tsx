import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { liveTokensForBoard, moveMyToken, placeMyTemplate, removeMyTemplate, usePlayerTemplates, useLiveScene } from '../auth/liveScene'
import { getMyColor, setMyColor } from '../auth/cloud'
import { useFullscreen } from '../lib/useFullscreen'
import { PHONE_QUERY, useIsPhone } from '../lib/usePhone'
import { TOKEN_COLORS } from '../lib/tabletop'
import { BoardOverlays } from './BoardOverlays'
import { ringSquares } from '../lib/rangeRing'
import { Tabletop } from './Tabletop'
import { usePings } from '../lib/usePings'
import { TokenStatusCard, hasFloatingStatus } from './TokenStatusCard'
import { Icon } from './Icon'
import { BmIcon, type BmIconName } from './battlemap/BmIcon'
import { useMapClearRight, type PanelPlacement } from '../lib/usePanelPlacement'
import type { SceneTemplate, TemplateShape } from '../db/types'

/** True at 860px wide and below, where the full-screen session panel becomes a drawer. */
function useNarrowFs(): boolean {
  return useMedia('(max-width: 860px)')
}

function useMedia(q: string): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches)
  useEffect(() => {
    const m = window.matchMedia?.(q)
    if (!m) return
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

/**
 * One tool in the player's bar. On the session page's rail it is the DM rail's own button
 * (`bm-tool` with a Run Mode icon, so size, centering and the on state match); elsewhere it is
 * the labelled button the bar has always used.
 */
function BarBtn({
  rail,
  icon,
  glyph,
  text,
  on,
  onClick,
  pressed,
  expanded,
  label,
  title,
  testId,
  dot,
}: {
  rail?: boolean
  icon?: BmIconName
  glyph?: ReactNode
  text?: string
  on?: boolean
  onClick: () => void
  pressed?: boolean
  expanded?: boolean
  label: string
  title?: string
  testId?: string
  /** A color swatch in place of an icon (the token color button). */
  dot?: string
}) {
  const swatch = dot ? <span aria-hidden className="player-color-dot" style={{ background: dot }} /> : null
  if (rail) {
    return (
      <button type="button" className={`bm-tool${on ? ' on' : ''}`} onClick={onClick} aria-pressed={pressed} aria-expanded={expanded} aria-label={label} title={title ?? label} data-testid={testId}>
        {swatch ?? (icon && <BmIcon name={icon} size={20} />)}
      </button>
    )
  }
  return (
    <button className={`btn small${on ? ' primary' : ''}`} onClick={onClick} aria-pressed={pressed} aria-expanded={expanded} aria-label={label} title={title} data-testid={testId}>
      {swatch ?? glyph}{text && <> <span className="pl-lbl">{text}</span></>}
    </button>
  )
}

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
  fsExtras,
  compact = false,
  rail = false,
  empty,
  onExpandedChange,
  pagePanel,
}: {
  linkedCampaignId: string
  /** Shown beside the map in full screen (e.g. the player's session notes). */
  notes?: ReactNode
  notesLabel?: string
  /**
   * The session page's own player UI, shown inside full screen so it matches the page: the
   * "Your turn" banner, the initiative strip (Join initiative), the demo controls, and the tabbed
   * panel (docked right, or a drawer on narrow screens). The page renders them here instead of in
   * its own layout while full screen is open, so there is one live copy. Without it, full screen
   * falls back to `notes` beside the map.
   */
  fsExtras?: { turn?: ReactNode; strip?: ReactNode; demo?: ReactNode; panel?: ReactNode; place?: PanelPlacement }
  /** The session panel's open/closed control for the page's own rail (full screen uses `fsExtras.place`). */
  pagePanel?: { open: boolean; onToggle: () => void }
  /** Small inline board (e.g. a sidebar card); full screen still gets the room. */
  compact?: boolean
  /** Tools as a slim vertical rail beside the map (the session page's Run Mode look). */
  rail?: boolean
  /** Rendered when the DM isn't showing a map. */
  empty?: ReactNode
  /** Told when full screen opens/closes (so a page can pause a duplicate editor). */
  onExpandedChange?: (expanded: boolean) => void
  live: ReturnType<typeof useLiveScene>
}) {
  const { user, profile } = useAuth()
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fs = useFullscreen()
  const bodyRef = useRef<HTMLDivElement>(null)
  const fsPlace = fsExtras?.place
  useMapClearRight(bodyRef, fs.expanded && fsPlace?.mode === 'float')
  const onExpandedRef = useRef(onExpandedChange)
  onExpandedRef.current = onExpandedChange
  useEffect(() => {
    onExpandedRef.current?.(fs.expanded)
  }, [fs.expanded])
  // Unmounting while expanded (e.g. the page moves the board when the DM stops
  // the map) must still tell the page full screen is over.
  useEffect(() => () => onExpandedRef.current?.(false), [])
  // On a phone the notes start closed and open as a drawer, so the map keeps the room (T-96).
  const isPhone = useIsPhone()
  const [notesOpen, setNotesOpen] = useState(() => !(typeof window !== 'undefined' && window.matchMedia?.(PHONE_QUERY).matches))
  const [colorOpen, setColorOpen] = useState(false)
  // The session panel: docked on wide screens, a drawer from 860px down (and on every phone).
  const narrow = useNarrowFs()
  const [panelPick, setPanelPick] = useState<boolean | null>(null)
  const panelOpen = panelPick ?? !narrow
  // A short landscape window (a phone turned sideways, even without a touch screen) gets the phone layout too.
  const shortScreen = useMedia('(max-height: 500px)')
  const phoneFs = fs.expanded && (isPhone || shortScreen)
  // The page's demo banner and phone top bar hide while a phone is in full screen (see styles.css).
  useEffect(() => {
    if (!phoneFs) return
    document.documentElement.dataset.bmFs = '1'
    return () => {
      delete document.documentElement.dataset.bmFs
    }
  }, [phoneFs])
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
  // Range ring (T-103): on a player's own turn, for their own token that has a speed
  // the DM shared. The toggle is per player and per browser; the DM never sees it.
  const [ringOn, setRingOn] = useState(() => {
    try { return localStorage.getItem('codex.bm.playerRange') !== '0' } catch { return true }
  })
  function toggleRing() {
    setRingOn((on) => {
      try { localStorage.setItem('codex.bm.playerRange', on ? '0' : '1') } catch { /* ignore */ }
      return !on
    })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'r') return
      toggleRing()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const myRingTokens = useMemo(
    () => live.tokens.filter((t) => ownIds.has(t.id) && t.speedFt != null && ringSquares(t.speedFt) > 0),
    [live.tokens, ownIds],
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
  // Pings and colored cursors (T-102): players ping in their own color.
  const pings = usePings({
    campaignId: live.scene ? linkedCampaignId : null,
    sceneId: live.scene?.sceneId ?? '',
    userId: user?.id,
    name: profile?.display_name || 'Player',
    savedColor: myColor,
    isDm: false,
  })
  if (!live.scene) {
    return (
      <>
        {empty ?? (
          <div className="empty">
            <div className="big"><BmIcon name="map" size={36} /></div>
            <p>Your DM isn't showing a battle map right now. When they do, it appears here live.</p>
          </div>
        )}
      </>
    )
  }

  const withPanel = fs.expanded && !!fsExtras?.panel
  // Wide full screen follows the page's placement (docked, floating, own window, closed); a narrow
  // one keeps its own drawer toggle.
  const placed = !!fsPlace && !narrow
  const panelShown = placed ? fsPlace.mode !== 'closed' : panelOpen
  const panelDocked = placed ? fsPlace.mode === 'docked' : panelOpen
  const togglePanel = placed ? fsPlace.toggle : () => setPanelPick(!panelOpen)
  const withNotes = fs.expanded && !withPanel && notesOpen && !!notes

  return (
    <div className={`player-live-board battlemap-editor${fs.expanded ? ' expanded' : ''}${compact ? ' compact' : ''}${rail && !fs.expanded ? ' pl-rail' : ''}${rail && fs.expanded ? ' pl-fs-rail' : ''}${phoneFs ? ' phone-fs' : ''}${colorOpen ? ' color-open' : ''}${withNotes ? ' notes-open' : ''}${withPanel ? ` pl-fs-shell${panelDocked ? ' panel-open' : ''}${narrow ? ' pl-fs-narrow' : ''}` : ''}`}>
      {fs.expanded && rail && fsExtras?.demo && <div className="pl-fs-demo">{fsExtras.demo}</div>}
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
          {fs.expanded && !rail && fsExtras?.demo}
          {(phoneFs || rail) && (
            <BarBtn
              rail={rail}
              on={colorOpen}
              onClick={() => setColorOpen((o) => !o)}
              expanded={colorOpen}
              label="Your token color"
              title="Pick the color your tokens wear"
              dot={myColor ?? '#a78bfa'}
            />
          )}
          {myRingTokens.length > 0 && (
            <BarBtn
              rail={rail}
              icon="range"
              glyph={<BmIcon name="range" size={16} />}
              text="Range"
              on={ringOn}
              onClick={toggleRing}
              pressed={ringOn}
              label="Range ring"
              title="Range ring (R): show how far you can move on your turn"
              testId="player-range-toggle"
            />
          )}
          <BarBtn
            rail={rail}
            icon="measure"
            glyph={<BmIcon name="measure" size={16} />}
            text={measuring ? 'Done' : 'Measure'}
            on={measuring}
            onClick={() => { setSpellTool(null); setSpellOpen(false); setMeasuring((m) => !m) }}
            title="Ruler: drag on the map to measure distance in feet"
            label={measuring ? 'Done' : 'Measure'}
          />
          <div className="player-spell-wrap">
            <BarBtn
              rail={rail}
              icon="templates"
              glyph={<BmIcon name="templates" size={16} />}
              text={spellTool ? 'Stop' : 'Spell area'}
              on={!!spellTool}
              onClick={() => { if (spellTool) { setSpellTool(null); setSpellOpen(false) } else setSpellOpen((o) => !o) }}
              expanded={spellOpen}
              title="Drop a spell area (burst, cone or line) on the map"
              label={spellTool ? 'Stop' : 'Spell area'}
            />
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
          {myTemplateIds.length > 0 && (rail ? (
            <BarBtn rail icon="trash" label="Clear mine" title="Remove the spell areas you placed" onClick={clearMyTemplates} />
          ) : (
            <button className="btn ghost small" onClick={clearMyTemplates} title="Remove the spell areas you placed">
              Clear mine
            </button>
          ))}
          {withPanel && (
            <BarBtn
              rail={rail}
              icon="inspector"
              glyph={<Icon name="swords" size={14} />}
              text={panelShown ? 'Hide panel' : 'Session panel'}
              on={panelShown}
              onClick={togglePanel}
              expanded={panelShown}
              label={panelShown ? 'Hide session panel' : 'Session panel'}
              testId="fs-panel-toggle"
            />
          )}
          {!fs.expanded && pagePanel && rail && (
            <BarBtn
              rail
              icon="inspector"
              on={pagePanel.open}
              onClick={pagePanel.onToggle}
              expanded={pagePanel.open}
              label={pagePanel.open ? 'Hide session panel' : 'Session panel'}
              testId="page-panel-toggle"
            />
          )}
          {fs.expanded && !withPanel && notes && (
            <button className={`btn small${notesOpen ? ' primary' : ''}`} onClick={() => setNotesOpen((o) => !o)} aria-label={notesOpen ? `Hide ${notesLabel.toLowerCase()}` : notesLabel}>
              <BmIcon name="notes" size={16} /> <span className="pl-lbl">{notesOpen ? `Hide ${notesLabel.toLowerCase()}` : notesLabel}</span>
            </button>
          )}
          <BarBtn
            rail={rail}
            icon={fs.expanded ? 'fullscreen-exit' : 'fullscreen'}
            glyph={<Icon name={fs.expanded ? 'minimize' : 'maximize'} size={14} color={fs.expanded ? 'inherit' : undefined} />}
            text={fs.expanded ? 'Exit full screen' : 'Full screen'}
            on={fs.expanded}
            onClick={fs.expanded ? fs.exit : fs.enter}
            label={fs.expanded ? 'Exit full screen' : 'Full screen'}
            testId="map-fullscreen"
          />
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
      {withPanel && (fsExtras?.turn || fsExtras?.strip) && (
        <div className="pl-fs-hud">
          {fsExtras?.turn}
          {fsExtras?.strip}
        </div>
      )}

      <div ref={bodyRef} className={`battlemap-body player${withNotes ? ' with-notes' : ''}`}>
        {withNotes && <aside className="battlemap-notes">{notes}</aside>}
        <Tabletop
          pings={pings}
          overlays={
            <BoardOverlays
              grid={live.scene.grid}
              width={live.scene.width}
              height={live.scene.height}
              viewer="player"
              tokens={board.tokens}
              ring={(() => {
                if (!ringOn) return null
                const mine = myRingTokens.find((t) => t.combat?.active)
                const bt = mine ? board.tokens.find((t) => t.id === mine.id) : null
                return mine && bt ? { token: bt, squares: ringSquares(mine.speedFt), rule: 'standard' as const } : null
              })()}
            />
          }
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
        {withPanel && panelShown && (panelDocked ? <div className="pl-fs-panel" data-testid="fs-panel">{fsExtras?.panel}</div> : fsExtras?.panel)}
      </div>
      {compact && !fs.expanded && ownIds.size > 0 && (
        <p className="faint" style={{ fontSize: 12, margin: '6px 0 0' }}>Drag your token (green ring) to move it.</p>
      )}
    </div>
  )
}
