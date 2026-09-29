import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import { createImage, createScene, deleteImage, deleteScene, updateScene } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { Peek, type PeekKind } from './RunPage'
import { Tabletop } from '../components/Tabletop'
import { SidePanel } from '../components/SidePanel'
import { NumberField } from '../components/NumberField'
import { useConfirm } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { formatBytes, processImageFile } from '../lib/image'
import { detectGrid } from '../lib/gridDetect'
import { useDmLiveScene } from './useDmLiveScene'
import { useRegisterSceneEditor } from './LiveSceneKeeper'
import { useFullscreen } from '../lib/useFullscreen'
import { useCombat, combatantFromNpc, ConditionPicker } from '../components/CombatRoster'
import { makeCombatant, type Combatant } from '../lib/combat'
import { tokenCombat } from '../lib/tokenCombat'
import {
  MAP_MAX_DIM,
  TOKEN_COLORS,
  TOKEN_SIZES,
  boardCellKeys,
  defaultGrid,
  gridFromBox,
  round2,
  normalizeOffset,
  snapCenterToCell,
  tokenRevealed,
} from '../lib/tabletop'
import type { Campaign, Id, Scene, SceneFog, SceneGrid, SceneToken, TokenCombat } from '../db/types'
import { SessionNotesPanel } from './SessionNotesPanel'

// Battle Map tab: the built-in VTT. A scene list on the left; the selected
// scene's board, grid calibration, and tokens on the right. Scenes sync and back
// up like any other campaign record. One map at a time can be shown to players
// live (see useDmLiveScene); "Preview as player" shows what they'd see.

export function BattleMapPage() {
  const campaign = useCampaign()
  const scenes = useLiveQuery(
    () => db.scenes.where('campaignId').equals(campaign.id).sortBy('name'),
    [campaign.id],
  )

  const [searchParams] = useSearchParams()
  const sel = searchParams.get('sel')
  const [selectedId, setSelectedId] = useState<string | null>(() => sel)
  useEffect(() => {
    if (sel) setSelectedId(sel)
  }, [sel])
  const selected = scenes?.find((s) => s.id === selectedId) ?? null

  async function add() {
    const s = await createScene(campaign.id, { name: `Battle Map ${(scenes?.length ?? 0) + 1}` })
    setSelectedId(s.id)
  }

  return (
    <div className="battlemap-page">
      <div>
        <button className="btn primary" style={{ width: '100%', marginBottom: 12 }} onClick={add}>
          <Icon name="plus" size={15} color="inherit" /> New Battle Map
        </button>
        {scenes?.length === 0 && <p className="faint">No battle maps yet.</p>}
        {scenes?.map((s) => (
          <div
            key={s.id}
            className="list-row"
            style={{ cursor: 'pointer', borderColor: s.id === selectedId ? 'var(--accent)' : undefined }}
            onClick={() => setSelectedId(s.id)}
          >
            <div className="title">{s.name}</div>
            <span className="faint" style={{ fontSize: 12 }}>
              {s.tokens.length} token{s.tokens.length === 1 ? '' : 's'}
            </span>
          </div>
        ))}
      </div>

      <div style={{ minWidth: 0 }}>
        {selected ? (
          <SceneEditor key={selected.id} campaign={campaign} scene={selected} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div className="empty">
            <div className="big">🗺️</div>
            <p>Create a battle map, upload a map image, line up the grid, and drop tokens on it.</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The DM's editor for one battle map. Used by the Battle Map tab and by Run
 * mode (which passes its selected session so full screen's notes follow it).
 */
export function SceneEditor({
  campaign,
  scene,
  onDeleted,
  notesSessionId,
  compact = false,
}: {
  campaign: Campaign
  scene: Scene
  onDeleted: () => void
  /** Session whose notes the full-screen notes panel opens on (default: newest). */
  notesSessionId?: Id | null
  /** Embedded in a narrower pane (Run mode): start with the side panel closed. */
  compact?: boolean
}) {
  const confirm = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)
  const centerRef = useRef({ x: scene.width / 2, y: scene.height / 2 })

  // Local draft, saved on a short debounce (same model as the other editors).
  const [name, setName] = useState(scene.name)
  const [grid, setGrid] = useState<SceneGrid>(scene.grid)
  const [tokens, setTokens] = useState<SceneToken[]>(scene.tokens)
  const [size, setSize] = useState({ width: scene.width, height: scene.height })
  const [imageId, setImageId] = useState<Id | null>(scene.imageId)
  const [fog, setFog] = useState<SceneFog>(scene.fog ?? { enabled: false, revealed: [] })
  const dirty = useRef(false)
  // The latest unsaved draft, flushed on unmount (e.g. switching Run mode's
  // pane or map inside the 400ms debounce) so the last edit isn't lost.
  const unsaved = useRef<Partial<Scene> | null>(null)
  useEffect(() => {
    if (!dirty.current) return
    const patch = { name, grid, tokens, imageId, width: size.width, height: size.height, fog }
    unsaved.current = patch
    const t = setTimeout(() => {
      unsaved.current = null
      updateScene(scene.id, patch)
    }, 400)
    return () => clearTimeout(t)
  }, [name, grid, tokens, imageId, size, fog, scene.id])
  useEffect(
    () => () => {
      if (unsaved.current) updateScene(scene.id, unsaved.current)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  // While this editor is open it keeps the live map in sync (not the keeper).
  useRegisterSceneEditor(scene.id)
  const touch = () => {
    dirty.current = true
  }

  const [selectedToken, setSelectedToken] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  // Shared combat store (tracker/Run panel/board all stay in sync).
  const combat = useCombat()
  const live = useDmLiveScene(
    campaign,
    { sceneId: scene.id, name, grid, width: size.width, height: size.height, imageId, tokens, fog, combat: combat.state },
    (moves) => {
      touch()
      setTokens((ts) => ts.map((t) => {
        const m = moves.find((x) => x.id === t.id)
        return m ? { ...t, col: m.col, row: m.row } : t
      }))
    },
  )
  const [aligning, setAligning] = useState(false)
  // Fog of war: paint tool (null = not in fog mode). Painting a stroke commits a
  // set of revealed/hidden cells; the whole fog state syncs like the tokens.
  const [fogTool, setFogTool] = useState<'reveal' | 'hide' | null>(null)
  const [fogBrush, setFogBrush] = useState(0) // brush radius in cells (0 = 1×1)
  const FOG_BRUSH_MAX = 6
  function paintFog(keys: string[], reveal: boolean) {
    touch()
    setFog((f) => {
      const s = new Set(f.revealed)
      keys.forEach((k) => (reveal ? s.add(k) : s.delete(k)))
      return { ...f, revealed: [...s] }
    })
  }
  function enterFog() {
    touch()
    setAligning(false)
    setPreview(false)
    setFog((f) => ({ ...f, enabled: true }))
    setFogTool('reveal')
  }
  function exitFog() {
    setFogTool(null)
  }
  function disableFog() {
    touch()
    setFogTool(null)
    setFog((f) => ({ ...f, enabled: false }))
  }
  function revealAllFog() {
    touch()
    setFog((f) => ({ ...f, revealed: boardCellKeys(grid, size.width, size.height) }))
  }
  function coverAllFog() {
    touch()
    setFog((f) => ({ ...f, revealed: [] }))
  }
  // Align options: how many squares the box spans across, and whether to snap
  // the result to the grid lines drawn on the map image.
  const [alignSquares, setAlignSquares] = useState(1)
  const [snapToLines, setSnapToLines] = useState(true)
  const [alignNote, setAlignNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [aligningBusy, setAligningBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [peek, setPeek] = useState<{ kind: PeekKind; id: Id } | null>(null)

  // Full screen (see useFullscreen); Esc closes the stat-block peek first.
  const peekOpen = useRef(false)
  peekOpen.current = peek != null
  const fs = useFullscreen(() => peekOpen.current)
  const { expanded } = fs
  const enterFullscreen = fs.enter
  const exitFullscreen = fs.exit
  const [panelOpen, setPanelOpen] = useState(!compact)
  // Full screen only: session notes beside the map.
  const [notesOpen, setNotesOpen] = useState(true)

  const npcs = useLiveQuery(() => db.npcs.where('campaignId').equals(scene.campaignId).sortBy('name'), [scene.campaignId])
  const world = useLiveQuery(
    async () => ({
      npcs: await db.npcs.where('campaignId').equals(scene.campaignId).toArray(),
      locations: await db.locations.where('campaignId').equals(scene.campaignId).toArray(),
      items: await db.items.where('campaignId').equals(scene.campaignId).toArray(),
      notes: await db.notes.where('campaignId').equals(scene.campaignId).toArray(),
    }),
    [scene.campaignId],
  )
  const mapImage = useLiveQuery(() => (imageId ? db.images.get(imageId) : undefined), [imageId])

  const portraitIds = useMemo(
    () => [...new Set(tokens.map((t) => t.imageId).filter((x): x is string => !!x))],
    [tokens],
  )
  const portraits = useLiveQuery(
    async () => {
      const imgs = await db.images.bulkGet(portraitIds)
      const out: Record<string, string> = {}
      for (const img of imgs) if (img) out[img.id] = img.dataUrl
      return out
    },
    [portraitIds.join(',')],
  )

  function patchToken(id: string, patch: Partial<SceneToken>) {
    touch()
    setTokens((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }
  function removeToken(id: string) {
    touch()
    setTokens((ts) => ts.filter((t) => t.id !== id))
    setSelectedToken((s) => (s === id ? null : s))
  }

  // Combat link: a token can represent a combatant in the DM's tracker so the
  // board shows its HP/conditions and highlights it on its turn.
  async function addTokenToCombat(t: SceneToken) {
    const npc = t.npcId ? await db.npcs.get(t.npcId) : undefined
    const c = npc ? combatantFromNpc(npc) : makeCombatant({ name: t.label || 'Combatant' })
    combat.addCombatants([c])
    patchToken(t.id, { combatantId: c.id })
  }
  function removeTokenFromCombat(t: SceneToken) {
    if (t.combatantId) combat.removeCombatant(t.combatantId)
    patchToken(t.id, { combatantId: null })
  }
  // The overlay drawn on tokens. In player preview, filter it as players see it.
  const combatByToken = useMemo(() => {
    const st = combat.state
    const activeId = st.active ? st.combatants[st.turnIndex]?.id ?? null : null
    const map: Record<string, TokenCombat> = {}
    for (const t of tokens) {
      if (!t.combatantId) continue
      const c = st.combatants.find((x) => x.id === t.combatantId)
      if (c) map[t.id] = tokenCombat(t, c, activeId, preview)
    }
    return map
  }, [tokens, combat.state, preview])
  function addToken(input: Pick<SceneToken, 'label'> & Partial<SceneToken>) {
    const tokenSize = input.size ?? 1
    // Drop new tokens at the middle of the current view, nudged so a batch of
    // adds doesn't stack exactly on top of each other.
    const c = centerRef.current
    const cell = snapCenterToCell(grid, c.x, c.y, tokenSize)
    let { col, row } = cell
    const overlaps = (t: SceneToken) =>
      col < t.col + t.size && t.col < col + tokenSize && row < t.row + t.size && t.row < row + tokenSize
    for (let i = 0; i < 50 && tokens.some(overlaps); i++) col += 1
    const token: SceneToken = {
      id: newId(),
      color: TOKEN_COLORS[tokens.length % TOKEN_COLORS.length],
      size: tokenSize,
      col,
      row,
      ...input,
    }
    touch()
    setTokens((ts) => [...ts, token])
    setSelectedToken(token.id)
  }

  function addNpcToken(npcId: string) {
    const npc = npcs?.find((n) => n.id === npcId)
    if (!npc) return
    const count = tokens.filter((t) => t.npcId === npc.id).length
    addToken({
      label: count > 0 ? `${npc.name} ${count + 1}` : npc.name,
      npcId: npc.id,
      imageId: npc.imageId ?? null,
      size: sizeFromStatBlock(npc.statBlockData?.size),
    })
  }

  async function uploadMap(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const processed = await processImageFile(file, MAP_MAX_DIM)
      const img = await createImage(scene.campaignId, {
        name: file.name,
        mime: processed.mime,
        dataUrl: processed.dataUrl,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
      })
      const old = imageId
      touch()
      setImageId(img.id)
      setSize({ width: processed.width, height: processed.height })
      // A new map almost always has a different grid; start from a sensible default.
      setGrid((g) => ({ ...defaultGrid(processed.width), color: g.color, show: g.show }))
      if (old) await deleteImage(old)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not load that image.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeMap() {
    if (!imageId) return
    const ok = await confirm({
      title: 'Remove map image?',
      message: 'The grid and tokens stay; the board becomes a blank grid.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    const old = imageId
    touch()
    setImageId(null)
    setSize({ width: grid.cellPx * 30, height: grid.cellPx * 20 })
    await deleteImage(old)
  }

  function setGridField(patch: Partial<SceneGrid>) {
    touch()
    const next = { ...grid, ...patch }
    next.cellPx = Math.max(8, next.cellPx)
    next.offsetX = round2(normalizeOffset(next.offsetX, next.cellPx))
    next.offsetY = round2(normalizeOffset(next.offsetY, next.cellPx))
    // A blank board is sized in squares, so it grows/shrinks with the square size.
    if (!imageId && next.cellPx !== grid.cellPx) {
      setSize({
        width: Math.round(size.width / grid.cellPx) * next.cellPx,
        height: Math.round(size.height / grid.cellPx) * next.cellPx,
      })
    }
    setGrid(next)
  }

  async function applyAlign(box: { x1: number; y1: number; x2: number; y2: number }) {
    const drawn = gridFromBox(grid, box.x1, box.y1, box.x2, box.y2, alignSquares)
    if (!drawn) return
    let next = drawn
    let note: { ok: boolean; text: string }
    if (snapToLines && mapImage) {
      setAligningBusy(true)
      try {
        const found = await detectGrid(mapImage.dataUrl, drawn.cellPx)
        if (found) {
          next = { ...drawn, cellPx: found.cellPx, offsetX: found.offsetX, offsetY: found.offsetY }
          note = { ok: true, text: `Snapped to the map's grid lines: ${found.cellPx}px squares.` }
        } else {
          note = {
            ok: false,
            text: "Couldn't find drawn grid lines on this map, so your box was used as drawn. For more accuracy, box several squares and set the count.",
          }
        }
      } catch {
        note = { ok: false, text: 'Could not analyze the map image; your box was used as drawn.' }
      } finally {
        setAligningBusy(false)
      }
    } else {
      note = { ok: true, text: `Grid set from your box: ${drawn.cellPx}px squares.` }
    }
    touch()
    setGrid(next)
    setAlignNote(note)
    setAligning(false)
  }

  // Blank boards are sized in cells, so they follow the cell size.
  const cols = Math.round(size.width / grid.cellPx)
  const rows = Math.round(size.height / grid.cellPx)
  function setBlankSize(c: number, r: number) {
    touch()
    setSize({ width: Math.max(1, c) * grid.cellPx, height: Math.max(1, r) * grid.cellPx })
  }

  const current = tokens.find((t) => t.id === selectedToken) ?? null

  function openToken(t: SceneToken) {
    if (t.npcId) setPeek({ kind: 'npc', id: t.npcId })
  }
  function peekByName(target: string) {
    if (!world) return
    const lc = target.trim().toLowerCase()
    const hit =
      world.npcs.find((x) => x.name.toLowerCase() === lc) ? { kind: 'npc' as const, list: world.npcs } :
      world.locations.find((x) => x.name.toLowerCase() === lc) ? { kind: 'location' as const, list: world.locations } :
      world.items.find((x) => x.name.toLowerCase() === lc) ? { kind: 'item' as const, list: world.items } :
      null
    if (hit) {
      const e = (hit.list as { id: Id; name: string }[]).find((x) => x.name.toLowerCase() === lc)!
      setPeek({ kind: hit.kind, id: e.id })
      return
    }
    const note = world.notes.find((x) => x.title.toLowerCase() === lc)
    if (note) setPeek({ kind: 'note', id: note.id })
  }
  const peekName =
    peek && world
      ? peek.kind === 'note'
        ? world.notes.find((x) => x.id === peek.id)?.title
        : (world[`${peek.kind}s` as 'npcs' | 'locations' | 'items'] as { id: Id; name: string }[]).find((x) => x.id === peek.id)?.name
      : undefined

  // Less-used toolbar actions; inline normally, in a "More" menu when tight.
  const tight = compact && !expanded
  const moreRef = useRef<HTMLDetailsElement>(null)
  const secondary = (
    <>
          <button
            className="btn ghost small"
            onClick={() => setPanelOpen((o) => !o)}
            title={panelOpen ? 'Hide the grid & token panel for a bigger board' : 'Show the grid & token panel'}
          >
            <Icon name={panelOpen ? 'chevron-right' : 'chevron-left'} size={14} /> {panelOpen ? 'Hide panel' : 'Show panel'}
          </button>
          <button className="btn small" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={14} /> {uploading ? 'Processing…' : imageId ? 'Replace map' : 'Upload map'}
          </button>
          {imageId && (
            <button className="btn ghost small" onClick={removeMap}>Remove map</button>
          )}
          <button
            className="btn danger small"
            onClick={async () => {
              const ok = await confirm({
                title: 'Delete battle map?',
                message: (
                  <>
                    Delete <strong>{scene.name}</strong> and its map image? This can't be undone.
                  </>
                ),
                confirmLabel: 'Delete',
                danger: true,
              })
              if (ok) {
                dirty.current = false
                unsaved.current = null
                // Players shouldn't keep seeing a map that no longer exists.
                if (live.isShowing) await live.stop()
                await deleteScene(scene.id)
                onDeleted()
              }
            }}
          >
            <Icon name="trash" size={14} color="inherit" /> Delete
          </button>
    </>
  )

  // Tokens as drawn on the board. In player preview, drop hidden tokens and any
  // token standing entirely in fog — exactly what players receive.
  const revealedSet = fog.enabled ? new Set(fog.revealed) : null
  const boardTokens = (
    preview ? tokens.filter((t) => !t.hidden && (!revealedSet || tokenRevealed(t, revealedSet))) : tokens
  ).map((t) => {
    // Tokens a player controls wear that player's color.
    const c = live.colorFor(t)
    return c === t.color ? t : { ...t, color: c }
  })

  return (
    <div className={`battlemap-editor${expanded ? ' expanded' : ''}${panelOpen ? '' : ' panel-closed'}`}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => uploadMap(e.target.files?.[0])}
      />

      <div className="row between" style={{ gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ flex: tight ? '1 1 100%' : '1 1 140px', minWidth: 120, maxWidth: tight ? undefined : 320, fontWeight: 600 }}
          value={name}
          onChange={(e) => {
            touch()
            setName(e.target.value)
          }}
          aria-label="Battle map name"
        />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {live.available && (
            live.isShowing ? (
              <button className="btn small battlemap-live-on" disabled={live.busy} onClick={live.stop} title="Players can see this map live. Click to take it down.">
                <span className="battlemap-live-dot" aria-hidden /> {live.busy ? 'Working…' : 'Live · Stop showing'}
              </button>
            ) : (
              live.sessionLive ? (
                <button
                  className="btn primary small"
                  disabled={live.busy}
                  onClick={live.show}
                  title={live.otherShowing ? `Players are seeing “${live.otherName}”. This swaps it for this map.` : 'Show this map in your players’ live session'}
                >
                  <Icon name="eye" size={14} color="inherit" /> {live.busy ? 'Working…' : live.otherShowing ? 'Show this map instead' : 'Show to players'}
                </button>
              ) : (
                // Players only see maps inside a live session (Run mode).
                <span className="battlemap-needs-session" title="Players see battle maps during a live session. Start one from Run mode.">
                  <button className="btn small" disabled>
                    <Icon name="eye" size={14} /> Show to players
                  </button>
                  {!tight && <span className="faint">Start a live session first</span>}
                </span>
              )
            )
          )}
          <button
            className={`btn small${preview ? ' primary' : ''}`}
            onClick={() => {
              setPreview((p) => !p)
              setSelectedToken(null)
              setAligning(false)
              setFogTool(null)
            }}
            title="See the map exactly as players will: hidden tokens gone, no DM controls"
          >
            <Icon name={preview ? 'eye-off' : 'eye'} size={14} color={preview ? 'inherit' : undefined} /> {tight ? null : preview ? 'Exit player preview' : 'Preview as player'}
          </button>
          <button
            className={`btn small${fogTool ? ' primary' : ''}`}
            onClick={fogTool ? exitFog : enterFog}
            title="Fog of war: cover the map and reveal only where the party has been"
          >
            <Icon name="cloud" size={14} color={fogTool ? 'inherit' : undefined} /> {tight ? null : fogTool ? 'Done' : 'Fog'}
          </button>
          {expanded && (
            <button
              className={`btn small${notesOpen ? ' primary' : ''}`}
              onClick={() => setNotesOpen((o) => !o)}
              title={notesOpen ? 'Hide session notes' : 'Show session notes beside the map'}
            >
              📝 {notesOpen ? 'Hide notes' : 'Notes'}
            </button>
          )}
          <button
            className={`btn small${expanded ? ' primary' : ''}`}
            onClick={expanded ? exitFullscreen : enterFullscreen}
            title={expanded ? 'Exit full screen (Esc)' : 'Fill the whole screen with the battle map'}
          >
            <Icon name={expanded ? 'minimize' : 'maximize'} size={14} color={expanded ? 'inherit' : undefined} />
            {!tight && (expanded ? ' Exit full screen' : ' Full screen')}
          </button>
          {tight ? (
            // Narrow (Run mode's pane): tuck the less-used actions into a menu.
            <details className="battlemap-more" ref={moreRef}>
              <summary className="btn ghost small" title="More actions">⋯</summary>
              <div className="battlemap-more-menu" onClick={() => moreRef.current?.removeAttribute('open')}>
                {secondary}
              </div>
            </details>
          ) : (
            secondary
          )}
        </div>
      </div>
      {uploadError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{uploadError}</p>}
      {live.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{live.error}</p>}
      {preview && (
        <div className="battlemap-preview-banner">
          <Icon name="eye" size={14} /> Player preview: this is what players see
          {tokens.some((t) => t.hidden) ? ` (${tokens.filter((t) => t.hidden).length} hidden token${tokens.filter((t) => t.hidden).length === 1 ? '' : 's'} not shown)` : ''}.
          {!live.isShowing && live.available && ' This map isn’t shown to players yet.'}
        </div>
      )}
      {fogTool && (
        <div className="battlemap-fogbar">
          <span className="battlemap-fogbar-label"><Icon name="cloud" size={14} /> Fog</span>
          <div className="seg-filter" role="group" aria-label="Fog brush">
            <button className={fogTool === 'reveal' ? 'active' : ''} onClick={() => setFogTool('reveal')}>Reveal</button>
            <button className={fogTool === 'hide' ? 'active' : ''} onClick={() => setFogTool('hide')}>Cover</button>
          </div>
          <div className="battlemap-fogbrush" title="Brush size (squares painted per stroke)">
            <span className="faint">Brush</span>
            <button className="btn ghost small" onClick={() => setFogBrush((b) => Math.max(0, b - 1))} disabled={fogBrush === 0} aria-label="Smaller brush">−</button>
            <span className="battlemap-fogbrush-val" aria-live="polite">{2 * fogBrush + 1}×{2 * fogBrush + 1}</span>
            <button className="btn ghost small" onClick={() => setFogBrush((b) => Math.min(FOG_BRUSH_MAX, b + 1))} disabled={fogBrush === FOG_BRUSH_MAX} aria-label="Larger brush">+</button>
          </div>
          <span className="faint">Drag across the map to {fogTool === 'reveal' ? 'reveal' : 'cover'} squares.</span>
          <div className="battlemap-fogbar-actions">
            <button className="btn ghost small" onClick={revealAllFog}>Reveal all</button>
            <button className="btn ghost small" onClick={coverAllFog}>Cover all</button>
            <button className="btn ghost small" onClick={disableFog} title="Turn fog off — players see the whole map again">Turn off</button>
          </div>
        </div>
      )}
      {mapImage && (
        <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>
          {mapImage.width}×{mapImage.height}px · {formatBytes(mapImage.bytes)} · {cols}×{rows} squares
        </p>
      )}

      <div className={`battlemap-body${expanded && notesOpen ? ' with-notes' : ''}`}>
        {expanded && notesOpen && (
          <SessionNotesPanel campaignId={campaign.id} initialSessionId={notesSessionId} onWikiLink={peekByName} />
        )}
        <Tabletop
          width={size.width}
          height={size.height}
          grid={grid}
          tokens={boardTokens}
          mapUrl={mapImage?.dataUrl ?? null}
          portraits={portraits ?? {}}
          selectedId={selectedToken}
          onSelect={setSelectedToken}
          onMoveToken={(id, col, row) => patchToken(id, { col, row })}
          onResizeToken={(id, size) => patchToken(id, { size })}
          onDeleteToken={removeToken}
          onOpenToken={openToken}
          aligning={aligning}
          onAlign={applyAlign}
          centerRef={centerRef}
          editable={!preview}
          canMoveToken={preview ? () => false : undefined}
          fog={fog.enabled ? fog : null}
          fogTool={preview ? null : fogTool}
          fogBrush={fogBrush}
          onPaintFog={paintFog}
          combat={combatByToken}
        />

        <aside className="battlemap-side" hidden={!panelOpen || preview}>
          <section>
            <h4>Grid</h4>
            <label className="battlemap-check">
              <input type="checkbox" checked={grid.show} onChange={(e) => setGridField({ show: e.target.checked })} />
              Show grid
            </label>
            <div className="battlemap-fields">
              <label>
                Square size (px)
                <NumberField value={grid.cellPx} min={8} max={1000} step={0.1} decimals={2} onChange={(v) => v != null && setGridField({ cellPx: v })} ariaLabel="Square size in pixels" />
              </label>
              <label>
                Offset X
                <NumberField value={grid.offsetX} min={-1000} max={1000} step={0.5} decimals={2} onChange={(v) => v != null && setGridField({ offsetX: v })} ariaLabel="Grid offset X" />
              </label>
              <label>
                Offset Y
                <NumberField value={grid.offsetY} min={-1000} max={1000} step={0.5} decimals={2} onChange={(v) => v != null && setGridField({ offsetY: v })} ariaLabel="Grid offset Y" />
              </label>
              <label>
                Line color
                <input type="color" value={grid.color} onChange={(e) => setGridField({ color: e.target.value })} />
              </label>
            </div>
            {imageId ? (
              <>
                <button
                  className={`btn small${aligning ? ' primary' : ''}`}
                  style={{ width: '100%' }}
                  disabled={aligningBusy}
                  onClick={() => {
                    setAlignNote(null)
                    setFogTool(null)
                    setAligning((a) => !a)
                  }}
                  title="Draw a box around map squares to match the grid to them"
                >
                  {aligningBusy ? 'Matching…' : aligning ? 'Cancel align' : 'Align grid to map'}
                </button>
                {aligning && (
                  <div className="battlemap-align-opts">
                    <label>
                      Squares across in your box
                      <NumberField value={alignSquares} min={1} max={50} onChange={(v) => v != null && setAlignSquares(v)} ariaLabel="Squares across in the align box" />
                    </label>
                    <label className="battlemap-check" title="Fine-tune your box to the grid lines drawn on the map image">
                      <input type="checkbox" checked={snapToLines} onChange={(e) => setSnapToLines(e.target.checked)} />
                      Snap to the map's grid lines
                    </label>
                    <p className="faint">
                      Tip: boxing several squares (say 5 across) is far more accurate than one.
                    </p>
                  </div>
                )}
                {alignNote && !aligning && (
                  <p className={`battlemap-align-note${alignNote.ok ? '' : ' warn'}`}>{alignNote.text}</p>
                )}
              </>
            ) : (
              <div className="battlemap-fields">
                <label>
                  Columns
                  <NumberField value={cols} min={1} max={200} onChange={(v) => v != null && setBlankSize(v, rows)} ariaLabel="Columns" />
                </label>
                <label>
                  Rows
                  <NumberField value={rows} min={1} max={200} onChange={(v) => v != null && setBlankSize(cols, v)} ariaLabel="Rows" />
                </label>
              </div>
            )}
          </section>

          <section>
            <h4>Tokens</h4>
            <select
              className="select"
              value=""
              onChange={(e) => {
                if (e.target.value) addNpcToken(e.target.value)
              }}
              aria-label="Add a token from an NPC"
            >
              <option value="">＋ Add from NPC…</option>
              {npcs?.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
            <button className="btn small" style={{ width: '100%', marginTop: 6 }} onClick={() => addToken({ label: `Token ${tokens.length + 1}` })}>
              <Icon name="plus" size={14} /> Add custom token
            </button>

            {current ? (
              <div className="battlemap-token-edit">
                <label>
                  Label
                  <input className="input" value={current.label} onChange={(e) => patchToken(current.id, { label: e.target.value })} />
                </label>
                <label>
                  Size
                  <select className="select" value={current.size} onChange={(e) => patchToken(current.id, { size: Number(e.target.value) })}>
                    {TOKEN_SIZES.map((s) => (
                      <option key={s.cells} value={s.cells}>{s.label}</option>
                    ))}
                  </select>
                </label>
                {live.colorFor(current) !== current.color && (
                  <span className="faint" style={{ fontSize: 11 }}>
                    Shown in {live.members.find((m) => m.userId === current.controlledBy)?.displayName ?? 'the player'}’s color while they control it.
                  </span>
                )}
                <div className="battlemap-swatches" role="radiogroup" aria-label="Token color">
                  {TOKEN_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`battlemap-swatch${current.color === c ? ' on' : ''}`}
                      style={{ background: c }}
                      onClick={() => patchToken(current.id, { color: c })}
                      aria-label={`Color ${c}`}
                      aria-checked={current.color === c}
                      role="radio"
                    />
                  ))}
                </div>
                <label className="battlemap-check" title="Hidden tokens are never sent to players">
                  <input type="checkbox" checked={current.hidden === true} onChange={(e) => patchToken(current.id, { hidden: e.target.checked })} />
                  Hidden from players
                </label>
                {live.available && (
                  <label>
                    Controlled by
                    <select
                      className="select"
                      value={current.controlledBy ?? ''}
                      onChange={(e) => patchToken(current.id, { controlledBy: e.target.value || null })}
                      title="The player who can move this token on their screen"
                    >
                      <option value="">DM only</option>
                      {live.members.map((m) => (
                        <option key={m.userId} value={m.userId}>{m.displayName}</option>
                      ))}
                    </select>
                    {live.members.length === 0 && (
                      <span className="faint" style={{ fontSize: 11 }}>Players appear here once they join with your invite code.</span>
                    )}
                  </label>
                )}
                <TokenCombatControl
                  token={current}
                  combatant={current.combatantId ? combat.state.combatants.find((c) => c.id === current.combatantId) ?? null : null}
                  onAdd={() => addTokenToCombat(current)}
                  onRemove={() => removeTokenFromCombat(current)}
                  onFriendly={(v) => patchToken(current.id, { friendly: v })}
                  onDamage={(n) => current.combatantId && combat.adjustHp(current.combatantId, -n)}
                  onHeal={(n) => current.combatantId && combat.adjustHp(current.combatantId, n)}
                  onConditions={(conds) => current.combatantId && combat.patch(current.combatantId, { conditions: conds })}
                />
                <div className="row" style={{ gap: 6 }}>
                  {current.npcId && (
                    <button className="btn small" onClick={() => openToken(current)}>View NPC</button>
                  )}
                  <button className="btn danger small" onClick={() => removeToken(current.id)}>
                    <Icon name="trash" size={13} color="inherit" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>
                Drag tokens to move them; they snap to the grid. Click a token to select it, then drag its corner handle (or press + / −) to resize. Arrow keys nudge it, Delete removes it, and double-click an NPC token to see its stat block.
              </p>
            )}

            {tokens.length > 0 && (
              <ul className="battlemap-token-list">
                {tokens.map((t) => (
                  <li key={t.id}>
                    <button
                      className={`linklike${t.id === selectedToken ? ' on' : ''}`}
                      onClick={() => setSelectedToken(t.id)}
                    >
                      <span className="battlemap-dot" style={{ background: live.colorFor(t) }} />
                      {t.label}
                      {t.hidden && <Icon name="eye-off" size={12} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {peek && world && (
        <SidePanel title={peekName ?? 'Peek'} onClose={() => setPeek(null)}>
          <Peek kind={peek.kind} id={peek.id} world={world} campaignId={scene.campaignId} onWikiLink={peekByName} />
        </SidePanel>
      )}
    </div>
  )
}

/** Token footprint from a stat-block size ("Large" → 2 cells). */
function sizeFromStatBlock(size: string | undefined): number {
  switch ((size ?? '').toLowerCase()) {
    case 'large':
      return 2
    case 'huge':
      return 3
    case 'gargantuan':
      return 4
    default:
      return 1
  }
}


/** The combat controls in a selected token's side panel: add/remove the token
 *  from the tracker, apply damage/heal right on the map, and (for a DM-run
 *  non-PC) mark it friendly so players see its HP. */
function TokenCombatControl({
  token,
  combatant,
  onAdd,
  onRemove,
  onFriendly,
  onDamage,
  onHeal,
  onConditions,
}: {
  token: SceneToken
  combatant: Combatant | null
  onAdd: () => void
  onRemove: () => void
  onFriendly: (v: boolean) => void
  onDamage: (n: number) => void
  onHeal: (n: number) => void
  onConditions: (conds: string[]) => void
}) {
  const [amount, setAmount] = useState('')
  if (!combatant) {
    return (
      <button className="btn small" onClick={onAdd} title="Track this token in the combat tracker">
        <Icon name="swords" size={13} /> Add to combat
      </button>
    )
  }
  const ally = combatant.isPC || !!token.controlledBy
  const apply = (heal: boolean) => {
    const n = parseInt(amount, 10)
    if (!Number.isFinite(n) || n <= 0) return
    heal ? onHeal(n) : onDamage(n)
    setAmount('')
  }
  return (
    <div className="battlemap-combat-ctl">
      <div className="row between" style={{ alignItems: 'center' }}>
        <span className="faint" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="swords" size={13} /> In combat
          {combatant.hp != null && ` · ${combatant.hp}/${combatant.maxHp ?? combatant.hp} HP`}
        </span>
        <button className="btn ghost small" onClick={onRemove}>Remove</button>
      </div>
      <div className="battlemap-dmg-row">
        <input
          className="input"
          type="number"
          min={1}
          inputMode="numeric"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply(e.shiftKey) }}
          aria-label="Damage or heal amount"
          style={{ width: 78 }}
        />
        <button className="btn small" onClick={() => apply(false)} title="Apply damage (Enter)">Damage</button>
        <button className="btn ghost small" onClick={() => apply(true)} title="Heal (Shift+Enter)">Heal</button>
      </div>
      <ConditionPicker value={combatant.conditions} onChange={onConditions} />
      {ally ? (
        <span className="faint" style={{ fontSize: 11 }}>Players see its HP (party ally).</span>
      ) : (
        <label className="battlemap-check" title="Players see this token's real HP, like a party ally">
          <input type="checkbox" checked={token.friendly === true} onChange={(e) => onFriendly(e.target.checked)} />
          Friendly — players see its HP
        </label>
      )}
    </div>
  )
}
