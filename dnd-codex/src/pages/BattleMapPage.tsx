import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import { createImage, createScene, deleteImage, deleteScene, updateScene } from '../db/repo'
import { deleteMapImage, downloadMapDataUrl } from '../lib/mapStorage'
import { importMapImage } from '../lib/mapImport'
import { useCampaign } from './CampaignLayout'
import { Peek, type PeekKind } from './RunPage'
import { Tabletop } from '../components/Tabletop'
import { TokenStatusCard, hasFloatingStatus } from '../components/TokenStatusCard'
import { SidePanel } from '../components/SidePanel'
import { BattleLibrary } from '../components/BattleLibrary'
import { libraryAvailable } from '../lib/battleLibrary'
import { usePublisher } from '../lib/libraryPublish'
import { PublishToLibraryModal } from '../components/LibraryPublish'
import { EntityImage } from '../components/EntityImage'
import { NumberField } from '../components/NumberField'
import { useConfirm } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import { BmIcon, type BmIconName } from '../components/battlemap/BmIcon'
import { BmMenu } from '../components/battlemap/BmMenu'
import { Inspector, TokenRow, type InspectorTab } from '../components/battlemap/Inspector'
import { formatBytes, processImageFile } from '../lib/image'
import { detectGrid } from '../lib/gridDetect'
import { useDmLiveScene } from './useDmLiveScene'
import { usePlayerTemplates } from '../auth/liveScene'
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
import { TokenIconPicker } from '../components/TokenIcon'
import { EMOJI_TOKEN_ICONS, GENERIC_TOKEN_ICON, npcTokenIcon, pickTokenIcon } from '../lib/tokenIcons'
import type { Campaign, Id, Scene, SceneFog, SceneGrid, SceneTemplate, SceneToken, TemplateShape, TokenCombat, TokenShape } from '../db/types'

/** Quick-add palette for non-NPC object tokens (T-21). Each drops a labeled,
 *  emoji-faced token; squares read better for built things (boats, doors). */
const TOKEN_PRESETS: { label: string; icon: string; shape: TokenShape }[] = [
  { label: 'Horse', icon: '🐴', shape: 'circle' },
  { label: 'Boat', icon: '⛵', shape: 'square' },
  { label: 'Wagon', icon: '🛒', shape: 'square' },
  { label: 'Crate', icon: '📦', shape: 'square' },
  { label: 'Chest', icon: '🧰', shape: 'square' },
  { label: 'Door', icon: '🚪', shape: 'square' },
  { label: 'Campfire', icon: '🔥', shape: 'circle' },
  { label: 'Rock', icon: '🪨', shape: 'circle' },
  { label: 'Tree', icon: '🌲', shape: 'circle' },
  { label: 'Trap', icon: '⚠️', shape: 'square' },
  { label: 'Flag', icon: '🚩', shape: 'square' },
  { label: 'Remains', icon: '💀', shape: 'circle' },
]
import { SessionNotesPanel } from './SessionNotesPanel'

// Palette for area templates (distinct from token colors: warmer, "spell effect").
const TEMPLATE_COLORS = ['#ef4444', '#f59e0b', '#a855f7', '#22c55e', '#3b82f6']
// Shapes offered, each with a tiny SVG glyph for its toolbar button.
const TEMPLATE_SHAPES: { shape: TemplateShape; label: string; glyph: JSX.Element }[] = [
  { shape: 'circle', label: 'Circle', glyph: <circle cx={8} cy={8} r={6} /> },
  { shape: 'cone', label: 'Cone', glyph: <polygon points="8,2 14,14 2,14" /> },
  { shape: 'line', label: 'Line', glyph: <rect x={2} y={6} width={12} height={4} /> },
]

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

  // Map library panel (hidden in the demo and when there is no backend).
  const [libOpen, setLibOpen] = useState(false)
  const canBrowse = libraryAvailable()
  const publisher = usePublisher()
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishedNote, setPublishedNote] = useState<string | null>(null)

  return (
    // While a map is open the list collapses into a switcher in the editor
    // header, so the board gets the whole width instead of a tall, mostly-empty
    // column beside it; the list only shows when nothing is open.
    <div className={`battlemap-page${selected ? ' editing bm-page' : ''}`}>
      {!selected && (
        <div className="battlemap-maps">
          <button className="btn primary" style={{ width: '100%', marginBottom: 12 }} onClick={add}>
            <Icon name="plus" size={15} color="inherit" /> New Battle Map
          </button>
          {canBrowse && (
            <button className="btn" style={{ width: '100%', marginBottom: 12 }} onClick={() => setLibOpen(true)}>
              <Icon name="map" size={15} /> Browse library
            </button>
          )}
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
      )}

      <div style={{ minWidth: 0 }}>
        {publishNote(publishedNote, () => setPublishedNote(null), !!selected)}
        {selected ? (
          <SceneEditor
            key={selected.id}
            campaign={campaign}
            scene={selected}
            onDeleted={() => setSelectedId(null)}
            scenes={scenes ?? []}
            onSelectScene={setSelectedId}
            onNewScene={add}
            onBrowseLibrary={canBrowse ? () => setLibOpen(true) : undefined}
            onPublishToLibrary={publisher && selected?.imageId ? () => setPublishOpen(true) : undefined}
            studio
          />
        ) : (
          <div className="empty">
            <div className="big">🗺️</div>
            <p>Create a battle map, upload a map image, line up the grid, and drop tokens on it.</p>
          </div>
        )}
      </div>
      {publishOpen && selected && (
        <PublishToLibraryModal
          scene={selected}
          onClose={() => setPublishOpen(false)}
          onDone={(t, newVersion) => {
            setPublishOpen(false)
            setPublishedNote(`${newVersion ? `Saved v${t.version} of` : 'Saved a draft of'} “${t.title}”.`)
          }}
        />
      )}
      {libOpen && (
        <SidePanel title="Battle map library" onClose={() => setLibOpen(false)}>
          <BattleLibrary
            campaignId={campaign.id}
            onUsed={(scene) => {
              setSelectedId(scene.id)
              setLibOpen(false)
            }}
          />
        </SidePanel>
      )}
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
  scenes,
  onSelectScene,
  onNewScene,
  onBrowseLibrary,
  onPublishToLibrary,
  studio = false,
}: {
  campaign: Campaign
  scene: Scene
  onDeleted: () => void
  /** Session whose notes the full-screen notes panel opens on (default: newest). */
  notesSessionId?: Id | null
  /** Embedded in a narrower pane (Run mode): start with the side panel closed. */
  compact?: boolean
  /** All of the campaign's maps, for the header switcher (Battle Map tab only;
   *  omitted in Run mode). When given, the header shows a map picker + New. */
  scenes?: Scene[]
  onSelectScene?: (id: string) => void
  onNewScene?: () => void
  /** Opens the map library panel (omitted when the library is unavailable). */
  onBrowseLibrary?: () => void
  /** Opens the publish form (publishers only). */
  onPublishToLibrary?: () => void
  /** The round 2 layout: one top bar, a tool rail, an edge-to-edge board and a
   *  tabbed inspector. Run mode keeps the compact classic layout (false). */
  studio?: boolean
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
  const [templates, setTemplates] = useState<SceneTemplate[]>(scene.templates ?? [])
  const dirty = useRef(false)
  // The latest unsaved draft, flushed on unmount (e.g. switching Run mode's
  // pane or map inside the 400ms debounce) so the last edit isn't lost.
  const unsaved = useRef<Partial<Scene> | null>(null)
  useEffect(() => {
    if (!dirty.current) return
    const patch = { name, grid, tokens, imageId, width: size.width, height: size.height, fog, templates }
    unsaved.current = patch
    const t = setTimeout(() => {
      unsaved.current = null
      updateScene(scene.id, patch)
    }, 400)
    return () => clearTimeout(t)
  }, [name, grid, tokens, imageId, size, fog, templates, scene.id])
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
  const [addTokenOpen, setAddTokenOpen] = useState(false)
  const tokenImageRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState(false)
  // Shared combat store (tracker/Run panel/board all stay in sync).
  const combat = useCombat()
  // Spell areas players dropped — shown read-only on the DM board so the DM sees
  // what they conjured (the DM's own templates live in `templates`).
  const playerTemplates = usePlayerTemplates(scene.campaignId)
  const live = useDmLiveScene(
    campaign,
    { sceneId: scene.id, name, grid, width: size.width, height: size.height, imageId, tokens, fog, templates, combat: combat.state },
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
    setMeasuring(false)
    setTemplatesOpen(false)
    setTemplateShape(null)
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

  // Measurement & area templates. The ruler (measuring) is an ephemeral DM tool;
  // placed templates persist on the scene and sync to players like fog.
  const [measuring, setMeasuring] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [templateShape, setTemplateShape] = useState<TemplateShape | null>(null)
  const [templateSizeFt, setTemplateSizeFt] = useState(20)
  const [templateColor, setTemplateColor] = useState(TEMPLATE_COLORS[0])
  const templateTool = templatesOpen && templateShape ? { shape: templateShape, sizeFt: templateSizeFt, color: templateColor } : null
  // Only one board tool at a time.
  function toggleMeasure() {
    setMeasuring((m) => {
      if (m) return false
      setAligning(false)
      setPreview(false)
      setFogTool(null)
      setTemplatesOpen(false)
      setTemplateShape(null)
      return true
    })
  }
  function toggleTemplates() {
    setTemplatesOpen((o) => {
      if (o) {
        setTemplateShape(null)
        return false
      }
      setAligning(false)
      setPreview(false)
      setFogTool(null)
      setMeasuring(false)
      return true
    })
  }
  function armTemplate(shape: TemplateShape) {
    setTemplateShape((s) => (s === shape ? null : shape))
  }
  function placeTemplate(t: { shape: TemplateShape; col: number; row: number; sizeFt: number; dir?: number; color: string }) {
    touch()
    setTemplates((ts) => [...ts, { ...t, id: crypto.randomUUID() }])
  }
  function removeTemplate(id: string) {
    touch()
    setTemplates((ts) => ts.filter((t) => t.id !== id))
  }
  function clearTemplates() {
    touch()
    setTemplates([])
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
  // In full screen, Esc closes the inspector drawer before it leaves full screen.
  const drawerOpenRef = useRef(false)
  const fs = useFullscreen(() => peekOpen.current || drawerOpenRef.current)
  const { expanded } = fs
  const enterFullscreen = fs.enter
  const exitFullscreen = fs.exit
  const [panelOpen, setPanelOpen] = useState(!compact)
  // Full screen only: session notes beside the map.
  const [notesOpen, setNotesOpen] = useState(true)
  // Studio layout state: inspector (docked, floating, or an on-demand drawer
  // in full screen and on a phone), its tab, the token filter and the hint chip.
  const isPhone = useIsPhone()
  const [dockOpen, setDockOpen] = useState(!compact)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [inspFloat, setInspFloat] = useState(false)
  const [inspTab, setInspTab] = useState<InspectorTab>('tokens')
  const [tokenFilter, setTokenFilter] = useState('')
  const [hintOn, setHintOn] = useState(true)
  const asDrawer = expanded || isPhone
  const inspVisible = asDrawer ? drawerOpen : dockOpen
  drawerOpenRef.current = studio && asDrawer && drawerOpen
  function toggleInspector() {
    if (asDrawer) setDrawerOpen((o) => !o)
    else setDockOpen((o) => !o)
  }
  useEffect(() => {
    if (!studio) return
    const t = setTimeout(() => setHintOn(false), 12000)
    return () => clearTimeout(t)
  }, [studio])
  useEffect(() => {
    if (selectedToken) setHintOn(false)
  }, [selectedToken])

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
  // Another device pulled this map's record without the base64 (it lives in
  // Storage). Fetch the binary once and cache it back into Dexie, so the board,
  // grid detection, and offline all read `dataUrl` uniformly from then on.
  const hydrating = useRef<string | null>(null)
  useEffect(() => {
    if (!mapImage || mapImage.dataUrl || !mapImage.storagePath) return
    if (hydrating.current === mapImage.id) return
    hydrating.current = mapImage.id
    downloadMapDataUrl(mapImage.storagePath)
      .then((dataUrl) => {
        // Local-only cache: write straight to Dexie WITHOUT enqueuing a sync and
        // WITHOUT bumping updatedAt, so this doesn't echo back to other devices
        // (which would ping-pong the base64 strip forever).
        if (dataUrl) return db.images.update(mapImage.id, { dataUrl })
      })
      .finally(() => {
        if (hydrating.current === mapImage.id) hydrating.current = null
      })
  }, [mapImage?.id, mapImage?.dataUrl, mapImage?.storagePath])

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
      // Stamped on the token so players' boards (which have no NPC data)
      // show the same icon.
      tokenIcon: npcTokenIcon(npc),
      size: sizeFromStatBlock(npc.statBlockData?.size),
    })
  }

  // Create a token straight from an uploaded image (one step, vs. add-then-edit).
  async function addTokenFromImage(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    try {
      const processed = await processImageFile(file)
      const img = await createImage(scene.campaignId, {
        name: file.name,
        mime: processed.mime,
        dataUrl: processed.dataUrl,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
      })
      const label = file.name.replace(/\.[^.]+$/, '').slice(0, 24) || `Token ${tokens.length + 1}`
      addToken({ label, imageId: img.id })
    } catch {
      /* not an image / decode failure — ignore */
    } finally {
      setAddTokenOpen(false)
      if (tokenImageRef.current) tokenImageRef.current.value = ''
    }
  }

  async function uploadMap(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const processed = await processImageFile(file, MAP_MAX_DIM)
      // Creates the local image and uploads the binary to Storage (best effort).
      const img = await importMapImage(scene.campaignId, {
        name: file.name,
        mime: processed.mime,
        dataUrl: processed.dataUrl,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
      })
      const old = imageId
      const oldImg = old ? await db.images.get(old) : undefined
      touch()
      setImageId(img.id)
      setSize({ width: processed.width, height: processed.height })
      // A new map almost always has a different grid; start from a sensible default.
      setGrid((g) => ({ ...defaultGrid(processed.width), color: g.color, show: g.show }))
      if (old) await deleteImage(old)
      if (oldImg?.storagePath) await deleteMapImage(oldImg.storagePath)
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
    const oldImg = await db.images.get(old)
    touch()
    setImageId(null)
    setSize({ width: grid.cellPx * 30, height: grid.cellPx * 20 })
    await deleteImage(old)
    if (oldImg?.storagePath) await deleteMapImage(oldImg.storagePath)
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
    // The DM's board follows the NPC's current icon (override or keyword
    // pick) so a change on the NPC sheet shows up without re-placing tokens.
    const npc = t.npcId ? npcs?.find((n) => n.id === t.npcId) : undefined
    const icon = npc && !t.tokenIcon ? npcTokenIcon(npc) : t.tokenIcon
    const next = icon && icon !== t.tokenIcon ? { ...t, tokenIcon: icon } : t
    return c === t.color ? next : { ...next, color: c }
  })

  const gridSection = (
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
  )

  const tokenEditor = current ? (
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
                <label>
                  Shape
                  <div className="seg" role="radiogroup" aria-label="Token shape">
                    {(['circle', 'square'] as TokenShape[]).map((sh) => (
                      <button
                        key={sh}
                        type="button"
                        className={`seg-btn${(current.shape ?? 'circle') === sh ? ' on' : ''}`}
                        role="radio"
                        aria-checked={(current.shape ?? 'circle') === sh}
                        onClick={() => patchToken(current.id, { shape: sh })}
                      >
                        {sh === 'circle' ? 'Circle' : 'Square'}
                      </button>
                    ))}
                  </div>
                </label>
                <TokenIconPicker
                  value={current.tokenIcon}
                  autoId={pickTokenIcon({ name: current.label }) ?? GENERIC_TOKEN_ICON}
                  onChange={(id) => patchToken(current.id, { tokenIcon: id })}
                />
                <label>
                  Emoji
                  <input
                    className="input"
                    value={current.icon ?? ''}
                    maxLength={4}
                    placeholder="🐴 (optional)"
                    onChange={(e) => patchToken(current.id, { icon: e.target.value || null })}
                  />
                </label>
                <div className="field">
                  <span className="faint" style={{ fontSize: 11 }}>Token image (optional — overrides the emoji)</span>
                  <EntityImage
                    campaignId={scene.campaignId}
                    imageId={current.imageId ?? null}
                    onChange={(id) => patchToken(current.id, { imageId: id })}
                    label="token image"
                  />
                </div>
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
  ) : null

  const fogBar = (
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
  )

  const measureBar = (
        <div className="battlemap-fogbar">
          <span className="battlemap-fogbar-label">📏 Ruler</span>
          <span className="faint">Drag across the map to measure. Distances use 5-ft squares (diagonals count as 5 ft).</span>
        </div>
  )

  const templateBar = (
        <div className="battlemap-fogbar battlemap-templatebar">
          <span className="battlemap-fogbar-label"><Icon name="sparkles" size={14} /> Templates</span>
          <div className="seg-filter" role="group" aria-label="Template shape">
            {TEMPLATE_SHAPES.map((s) => (
              <button key={s.shape} className={templateShape === s.shape ? 'active' : ''} onClick={() => armTemplate(s.shape)} title={s.label}>
                <svg width={16} height={16} viewBox="0 0 16 16" style={{ fill: 'currentColor', verticalAlign: 'middle' }}>{s.glyph}</svg> {s.label}
              </button>
            ))}
          </div>
          <label className="battlemap-tpl-size" title={templateShape === 'circle' ? 'Radius in feet' : 'Length in feet'}>
            <span className="faint">{templateShape === 'circle' ? 'Radius' : 'Length'}</span>
            <NumberField value={templateSizeFt} min={5} max={200} step={5} onChange={(v) => v != null && setTemplateSizeFt(v)} ariaLabel="Template size in feet" />
            <span className="faint">ft</span>
          </label>
          <div className="battlemap-tpl-colors" role="group" aria-label="Template color">
            {TEMPLATE_COLORS.map((c) => (
              <button
                key={c}
                className={`battlemap-tpl-swatch${templateColor === c ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => setTemplateColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={templateColor === c}
              />
            ))}
          </div>
          <span className="faint">
            {templateShape
              ? templateShape === 'circle'
                ? 'Click the map to drop the circle.'
                : `Press at the origin and drag to aim the ${templateShape}.`
              : 'Pick a shape, then place it on the map.'}
          </span>
          {templates.length > 0 && (
            <div className="battlemap-tpl-list">
              {templates.map((t) => (
                <span key={t.id} className="battlemap-tpl-chip" style={{ borderColor: t.color }}>
                  <span className="battlemap-tpl-dot" style={{ background: t.color }} />
                  {t.shape} {t.sizeFt}ft
                  <button className="battlemap-tpl-remove" onClick={() => removeTemplate(t.id)} aria-label="Remove template" title="Remove">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="battlemap-fogbar-actions">
            <button className="btn ghost small" onClick={clearTemplates} disabled={templates.length === 0}>Clear all</button>
          </div>
        </div>
  )

  const board = (
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
          templates={[...templates, ...playerTemplates.templates]}
          templateTool={preview ? null : templateTool}
          onPlaceTemplate={placeTemplate}
          measureTool={!preview && measuring}
          renderTokenPanel={(t) =>
            preview ? (
              hasFloatingStatus(combatByToken[t.id]) ? <TokenStatusCard token={t} combat={combatByToken[t.id]} /> : null
            ) : (
              <div className="tabletop-quickcombat">
                <div className="tabletop-quickcombat-head">
                  <div className="tabletop-quickcombat-name" title={t.label}>{t.label}</div>
                  {studio && (
                    <>
                      <button type="button" className="bm-icon-btn" onClick={() => duplicateToken(t)} aria-label={`Duplicate ${t.label}`} title="Duplicate this token">
                        <BmIcon name="duplicate" size={15} />
                      </button>
                      <button type="button" className="bm-icon-btn" onClick={() => removeToken(t.id)} aria-label={`Delete ${t.label}`} title="Delete this token">
                        <BmIcon name="trash" size={15} />
                      </button>
                    </>
                  )}
                </div>
                <TokenCombatControl
                  token={t}
                  combatant={t.combatantId ? combat.state.combatants.find((c) => c.id === t.combatantId) ?? null : null}
                  onAdd={() => addTokenToCombat(t)}
                  onRemove={() => removeTokenFromCombat(t)}
                  onFriendly={(v) => patchToken(t.id, { friendly: v })}
                  onDamage={(n) => t.combatantId && combat.adjustHp(t.combatantId, -n)}
                  onHeal={(n) => t.combatantId && combat.adjustHp(t.combatantId, n)}
                  onConditions={(conds) => t.combatantId && combat.patch(t.combatantId, { conditions: conds })}
                />
              </div>
            )
          }
        />
  )

  // ---- Studio layout (round 2) ----------------------------------------------
  // Keyboard: I inspector, F full screen, V select, M measure, Esc closes the drawer.
  // (Hooks above run in every layout; this effect only acts in the studio.)
  const keyActions = useRef({ toggleInspector, fullscreen: () => {}, select: () => {}, measure: () => {}, closeDrawer: () => {} })
  const preview0 = preview
  function selectTool() {
    setFogTool(null)
    setMeasuring(false)
    setTemplatesOpen(false)
    setTemplateShape(null)
    setAligning(false)
  }
  function setPreviewMode(on: boolean) {
    setPreview(on)
    setSelectedToken(null)
    selectTool()
  }
  keyActions.current = {
    toggleInspector,
    fullscreen: () => (expanded ? exitFullscreen() : enterFullscreen()),
    select: selectTool,
    measure: () => !preview0 && toggleMeasure(),
    closeDrawer: () => setDrawerOpen(false),
  }
  useEffect(() => {
    if (!studio) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      const a = keyActions.current
      if (k === 'i') a.toggleInspector()
      else if (k === 'f') a.fullscreen()
      else if (k === 'v') a.select()
      else if (k === 'm') a.measure()
      else if (k === 'escape') a.closeDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [studio])

  function duplicateToken(t: SceneToken) {
    const overlaps = (c: number, r: number) =>
      tokens.some((o) => c < o.col + o.size && o.col < c + t.size && r < o.row + o.size && o.row < r + t.size)
    let col = t.col + t.size
    for (let i = 0; i < 50 && overlaps(col, t.row); i++) col += 1
    const m = /^(.*?)(\d+)$/.exec(t.label.trim())
    const used = new Set(tokens.map((o) => o.label))
    let label = `${t.label} copy`
    if (m) {
      for (let n = Number(m[2]) + 1; n < 1000; n++) {
        if (!used.has(`${m[1]}${n}`)) {
          label = `${m[1]}${n}`
          break
        }
      }
    }
    const copy: SceneToken = { ...t, id: newId(), col, label, combatantId: null, controlledBy: null }
    touch()
    setTokens((ts) => [...ts, copy])
    setSelectedToken(copy.id)
  }

  if (studio) {
    const combatantOf = (t: SceneToken) => (t.combatantId ? combat.state.combatants.find((c) => c.id === t.combatantId) : undefined)
    const kindOf = (t: SceneToken): 'hero' | 'foe' | 'object' => {
      const c = combatantOf(t)
      if (t.controlledBy || c?.isPC || t.friendly) return 'hero'
      if (t.npcId || c) return 'foe'
      return 'object'
    }
    const hpOf = (t: SceneToken) => {
      const c = combatantOf(t)
      return c && c.hp != null ? `${c.hp}/${c.maxHp ?? c.hp}` : null
    }
    const needle = tokenFilter.trim().toLowerCase()
    const shown = tokens.filter((t) => !needle || t.label.toLowerCase().includes(needle))
    const tokenGroups: { title: string; list: SceneToken[] }[] = [
      { title: 'Heroes', list: shown.filter((t) => kindOf(t) === 'hero') },
      { title: 'Foes', list: shown.filter((t) => kindOf(t) === 'foe') },
      { title: 'Objects', list: shown.filter((t) => kindOf(t) === 'object') },
    ]
    const tool = fogTool ? 'fog' : measuring ? 'measure' : templatesOpen ? 'templates' : 'select'
    const railBtn = (id: string, icon: BmIconName, label: string, on: boolean, onClick: () => void) => (
      <button
        key={id}
        type="button"
        className={`bm-tool${on ? ' on' : ''}`}
        aria-pressed={on}
        aria-label={label}
        title={label}
        data-testid={`tool-${id}`}
        disabled={preview}
        onClick={onClick}
      >
        <BmIcon name={icon} size={20} />
      </button>
    )
    const toggleFog = () => (fogTool ? exitFog() : enterFog())

    const inspMode = asDrawer ? 'drawer' : inspFloat ? 'float' : 'docked'
    const inspector = inspVisible && (
      <Inspector
        mode={inspMode}
        tab={inspTab}
        onTab={setInspTab}
        onToggleFloat={() => setInspFloat((f) => !f)}
        onClose={() => (asDrawer ? setDrawerOpen(false) : setDockOpen(false))}
      >
        {inspTab === 'tokens' && (
          <>
            <input
              className="bm-filter"
              placeholder="Filter tokens"
              value={tokenFilter}
              onChange={(e) => setTokenFilter(e.target.value)}
              aria-label="Filter tokens"
            />
            {tokens.length === 0 && <p className="faint bm-empty">No tokens yet. Use Add token or Add object in the tool rail.</p>}
            {tokenGroups.map(
              (g) =>
                g.list.length > 0 && (
                  <div key={g.title} className="bm-group">
                    <div className="bm-group-title">{g.title}</div>
                    {g.list.map((t) => (
                      <TokenRow
                        key={t.id}
                        label={t.label}
                        color={live.colorFor(t)}
                        hp={hpOf(t)}
                        hidden={t.hidden === true}
                        selected={t.id === selectedToken}
                        onSelect={() => setSelectedToken(t.id)}
                        onToggleHidden={() => patchToken(t.id, { hidden: !t.hidden })}
                      />
                    ))}
                  </div>
                ),
            )}
            {tokenEditor && (
              <div className="bm-detail">
                <div className="bm-group-title">Selected token</div>
                {tokenEditor}
              </div>
            )}
          </>
        )}
        {inspTab === 'grid' && gridSection}
        {inspTab === 'map' && (
          <section>
            <h4>Map</h4>
            {mapImage ? (
              <p className="faint" style={{ fontSize: 12 }}>
                {mapImage.width}×{mapImage.height}px · {formatBytes(mapImage.bytes)} · {cols}×{rows} squares
              </p>
            ) : (
              <p className="faint" style={{ fontSize: 12 }}>
                This board is a blank grid ({cols}×{rows} squares). Upload a map image from the overflow menu in the top bar.
                A landscape image around 16:10 (for example 2400×1500 px) fills the default view. Images over {MAP_MAX_DIM}px on a side are shrunk to fit.
              </p>
            )}
            {scene.source?.credit && (
              <p className="faint" style={{ fontSize: 12 }}>
                Map art:{' '}
                {scene.source.creditUrl ? (
                  <a href={scene.source.creditUrl} target="_blank" rel="noopener noreferrer">{scene.source.credit}</a>
                ) : (
                  scene.source.credit
                )}
              </p>
            )}
            {uploadError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{uploadError}</p>}
          </section>
        )}
      </Inspector>
    )

    const flyoutBar = preview ? null : fogTool ? fogBar : measuring ? measureBar : templatesOpen ? templateBar : null
    const campBase = `/campaign/${campaign.id}`

    return (
      <div className={`bm-studio${expanded ? ' expanded' : ''}`} data-testid="bm-studio">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => uploadMap(e.target.files?.[0])} />
        <input ref={tokenImageRef} type="file" accept="image/*" hidden onChange={(e) => addTokenFromImage(e.target.files)} />

        <header className="bm-top">
          <nav className="bm-crumb" aria-label="Breadcrumb">
            <Link to={campBase}>{campaign.name}</Link>
            <span aria-hidden>/</span>
            <span aria-current="page">Battle Map</span>
          </nav>
          {scenes && onSelectScene && (
            <BmMenu
              label="Switch battle map"
              trigger={
                <>
                  <BmIcon name="map" />
                  <span className="bm-lbl">Maps</span>
                  <BmIcon name="chevron-down" size={14} />
                </>
              }
            >
              {(close) =>
                scenes.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={s.id === scene.id}
                    className={`bm-item${s.id === scene.id ? ' on' : ''}`}
                    onClick={() => {
                      onSelectScene(s.id)
                      close()
                    }}
                  >
                    {s.name || 'Untitled map'}
                  </button>
                ))
              }
            </BmMenu>
          )}
          {onNewScene && (
            <button type="button" className="bm-btn" onClick={onNewScene} aria-label="New battle map" title="New battle map">
              <BmIcon name="plus" />
              <span className="bm-lbl">New map</span>
            </button>
          )}
          <input
            className="bm-name"
            value={name}
            onChange={(e) => {
              touch()
              setName(e.target.value)
            }}
            aria-label="Battle map name"
          />
          <span className="bm-spacer" />
          <div className="bm-seg" role="group" aria-label="View">
            <button type="button" className={!preview ? 'on' : ''} aria-pressed={!preview} onClick={() => setPreviewMode(false)}>
              Edit
            </button>
            <button
              type="button"
              className={preview ? 'on' : ''}
              aria-pressed={preview}
              onClick={() => setPreviewMode(true)}
              title="See the map exactly as players will: hidden tokens gone, no DM controls"
            >
              Preview<span className="bm-lbl"> as player</span>
            </button>
          </div>
          <button
            type="button"
            className={`bm-btn bm-sq${inspVisible ? ' on' : ''}`}
            aria-pressed={inspVisible}
            aria-label="Inspector"
            title="Show or hide the scene inspector (I)"
            onClick={toggleInspector}
          >
            <BmIcon name="inspector" />
          </button>
          {expanded && (
            <button
              type="button"
              className={`bm-btn bm-sq${notesOpen ? ' on' : ''}`}
              aria-pressed={notesOpen}
              aria-label="Session notes"
              title={notesOpen ? 'Hide session notes' : 'Show session notes beside the map'}
              onClick={() => setNotesOpen((o) => !o)}
            >
              <BmIcon name="notes" />
            </button>
          )}
          <button
            type="button"
            className="bm-btn bm-sq"
            aria-label={expanded ? 'Exit full screen' : 'Full screen'}
            title={expanded ? 'Exit full screen (F)' : 'Full screen (F)'}
            onClick={expanded ? exitFullscreen : enterFullscreen}
          >
            <BmIcon name={expanded ? 'fullscreen-exit' : 'fullscreen'} />
          </button>
          {live.available &&
            (live.isShowing ? (
              <button
                type="button"
                className="bm-btn bm-live-on"
                disabled={live.busy}
                onClick={live.stop}
                title="Players can see this map live. Click to take it down."
              >
                <span className="battlemap-live-dot" aria-hidden />
                <span className="bm-lbl">{live.busy ? 'Working…' : 'Live · Stop'}</span>
              </button>
            ) : (
              <button
                type="button"
                className="bm-btn"
                disabled={live.busy || !live.sessionLive}
                onClick={live.show}
                aria-label={live.otherShowing ? 'Show this map instead' : 'Show to players'}
                title={
                  !live.sessionLive
                    ? 'Players see battle maps during a live session. Start one from Run mode.'
                    : live.otherShowing
                      ? `Players are seeing “${live.otherName}”. This swaps it for this map.`
                      : 'Show this map in your players’ live session'
                }
              >
                <BmIcon name="broadcast" />
                <span className="bm-lbl">{live.busy ? 'Working…' : live.otherShowing ? 'Show instead' : 'Show to players'}</span>
              </button>
            ))}
          <Link to={`/run/${campaign.id}`} className="bm-btn primary" title="At-the-table screen: session notes, what's in play, combat and dice">
            <BmIcon name="play" size={16} />
            <span className="bm-lbl">Run session</span>
          </Link>
          <BmMenu label="More actions" panelClassName="bm-menu-right" trigger={<BmIcon name="more" />}>
            {(close) => (
              <>
                <button type="button" role="menuitem" className="bm-item" disabled={uploading} onClick={() => { close(); fileRef.current?.click() }}>
                  <BmIcon name="upload" size={16} /> {uploading ? 'Processing…' : imageId ? 'Replace map' : 'Upload map'}
                </button>
                {imageId && (
                  <button type="button" role="menuitem" className="bm-item" onClick={() => { close(); removeMap() }}>
                    <BmIcon name="map" size={16} /> Remove map image
                  </button>
                )}
                {onPublishToLibrary && (
                  <button type="button" role="menuitem" className="bm-item" onClick={() => { close(); onPublishToLibrary() }}>
                    <BmIcon name="library" size={16} /> Publish to library
                  </button>
                )}
                {onBrowseLibrary && (
                  <button type="button" role="menuitem" className="bm-item" onClick={() => { close(); onBrowseLibrary() }}>
                    <BmIcon name="library" size={16} /> Browse library
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="bm-item danger"
                  onClick={async () => {
                    close()
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
                      if (live.isShowing) await live.stop()
                      await deleteScene(scene.id)
                      onDeleted()
                    }
                  }}
                >
                  <BmIcon name="trash" size={16} /> Delete map
                </button>
              </>
            )}
          </BmMenu>
        </header>

        <div className="bm-work">
          <div className="bm-rail" role="toolbar" aria-orientation="vertical" aria-label="Map tools">
            {railBtn('select', 'select', 'Select (V)', tool === 'select', selectTool)}
            {railBtn('measure', 'measure', 'Measure (M)', tool === 'measure', toggleMeasure)}
            <hr />
            {railBtn('fog', 'fog', 'Fog of war', tool === 'fog', toggleFog)}
            {railBtn('templates', 'templates', 'Area templates', tool === 'templates', toggleTemplates)}
            <hr />
            <BmMenu
              label="Add token"
              className="bm-rail-menu"
              buttonClassName="bm-tool"
              panelClassName="bm-menu-side"
              trigger={<BmIcon name="add-token" size={20} />}
            >
              {(close) => (
                <>
                  <div className="bm-menu-title">Add from NPC</div>
                  <div className="bm-menu-scroll">
                    {npcs?.length ? (
                      npcs.map((n) => (
                        <button key={n.id} type="button" role="menuitem" className="bm-item" onClick={() => { addNpcToken(n.id); close() }}>
                          {n.name}
                        </button>
                      ))
                    ) : (
                      <p className="faint bm-empty">No NPCs yet.</p>
                    )}
                  </div>
                  <div className="bm-menu-sep" />
                  <button type="button" role="menuitem" className="bm-item" onClick={() => { addToken({ label: `Token ${tokens.length + 1}` }); close() }}>
                    <BmIcon name="plus" size={16} /> Custom token
                  </button>
                  <button type="button" role="menuitem" className="bm-item" onClick={() => { close(); tokenImageRef.current?.click() }}>
                    <BmIcon name="upload" size={16} /> From an image
                  </button>
                </>
              )}
            </BmMenu>
            <BmMenu
              label="Add object"
              className="bm-rail-menu"
              buttonClassName="bm-tool"
              panelClassName="bm-menu-side"
              trigger={<BmIcon name="add-object" size={20} />}
            >
              {(close) => (
                <div className="bm-presets">
                  {TOKEN_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      role="menuitem"
                      className="bm-preset"
                      title={p.label}
                      onClick={() => {
                        addToken({ label: p.label, tokenIcon: EMOJI_TOKEN_ICONS[p.icon] ?? null, icon: EMOJI_TOKEN_ICONS[p.icon] ? null : p.icon, shape: p.shape })
                        close()
                      }}
                    >
                      <span aria-hidden>{p.icon}</span>
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </BmMenu>
          </div>

          {expanded && notesOpen && (
            <div className="bm-notes">
              <SessionNotesPanel campaignId={campaign.id} initialSessionId={notesSessionId} onWikiLink={peekByName} />
            </div>
          )}

          <div className="bm-map">
            {board}
            {preview && (
              <div className="bm-banner" role="status">
                <BmIcon name="eye" size={15} /> Player preview: this is what players see
                {tokens.some((t) => t.hidden) ? ` (${tokens.filter((t) => t.hidden).length} hidden)` : ''}
                {!live.isShowing && live.available && '. Not shown to players yet'}
              </div>
            )}
            {flyoutBar && <div className="bm-flyout">{flyoutBar}</div>}
            {hintOn && tool === 'select' && !preview && !aligning && (
              <div className="bm-hint">Drag tokens to move. Arrow keys nudge.</div>
            )}
            {live.error && (
              <div className="bm-notice" role="status">
                {live.error && <span style={{ color: 'var(--danger)' }}>{live.error}</span>}
              </div>
            )}
            {asDrawer && drawerOpen && <div className="bm-scrim" onClick={() => setDrawerOpen(false)} aria-hidden />}
            {inspMode !== 'docked' && inspector}
          </div>
          {inspMode === 'docked' && inspector}
        </div>

        {peek && world && (
          <SidePanel title={peekName ?? 'Peek'} onClose={() => setPeek(null)}>
            <Peek kind={peek.kind} id={peek.id} world={world} campaignId={scene.campaignId} onWikiLink={peekByName} />
          </SidePanel>
        )}
      </div>
    )
  }

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
        <div className="row" style={{ gap: 8, flex: tight ? '1 1 100%' : '1 1 260px', minWidth: 0 }}>
          {scenes && onSelectScene && (
            <select
              className="select battlemap-switch"
              value={scene.id}
              onChange={(e) => onSelectScene(e.target.value)}
              aria-label="Switch battle map"
              title="Switch battle map"
            >
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>{s.name || 'Untitled map'}</option>
              ))}
            </select>
          )}
          <input
            className="input"
            style={{ flex: '1 1 140px', minWidth: 120, maxWidth: tight ? undefined : 320, fontWeight: 600 }}
            value={name}
            onChange={(e) => {
              touch()
              setName(e.target.value)
            }}
            aria-label="Battle map name"
          />
          {onNewScene && (
            <button className="btn small" onClick={onNewScene} title="New battle map">
              <Icon name="plus" size={14} /> {tight ? null : 'New'}
            </button>
          )}
          {onPublishToLibrary && (
            <button className="btn small" onClick={onPublishToLibrary} title="Publish this map to the battle map library">
              <Icon name="upload" size={14} /> {tight ? null : 'Publish to library'}
            </button>
          )}
          {onBrowseLibrary && (
            <button className="btn small" onClick={onBrowseLibrary} title="Browse the battle map library">
              <Icon name="map" size={14} /> {tight ? null : 'Library'}
            </button>
          )}
        </div>
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
              setMeasuring(false)
              setTemplatesOpen(false)
              setTemplateShape(null)
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
          <button
            className={`btn small${measuring ? ' primary' : ''}`}
            onClick={toggleMeasure}
            title="Ruler: drag on the map to measure distance in feet"
          >
            📏 {tight ? null : measuring ? 'Done' : 'Measure'}
          </button>
          <button
            className={`btn small${templatesOpen ? ' primary' : ''}`}
            onClick={toggleTemplates}
            title="Area templates: place a spell circle, cone, or line that players can see"
          >
            <Icon name="sparkles" size={14} color={templatesOpen ? 'inherit' : undefined} /> {tight ? null : templatesOpen ? 'Done' : 'Templates'}
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
      {scene.source?.credit && (
        <p className="faint" style={{ fontSize: 12, margin: '4px 0' }}>
          Map art:{' '}
          {scene.source.creditUrl ? (
            <a href={scene.source.creditUrl} target="_blank" rel="noopener noreferrer">{scene.source.credit}</a>
          ) : (
            scene.source.credit
          )}
        </p>
      )}
      {!mapImage && (
        <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>
          Tip: a landscape image around 16:10 (for example 2400×1500 px) fills the default view with no
          empty bands or cut-off edges. Other shapes still work — they just leave margins until you zoom.
          Images over {MAP_MAX_DIM}px on a side are shrunk to fit.
        </p>
      )}
      {live.error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{live.error}</p>}
      {preview && (
        <div className="battlemap-preview-banner">
          <Icon name="eye" size={14} /> Player preview: this is what players see
          {tokens.some((t) => t.hidden) ? ` (${tokens.filter((t) => t.hidden).length} hidden token${tokens.filter((t) => t.hidden).length === 1 ? '' : 's'} not shown)` : ''}.
          {!live.isShowing && live.available && ' This map isn’t shown to players yet.'}
        </div>
      )}
      {fogTool && fogBar}
      {measuring && measureBar}
      {templatesOpen && templateBar}
      {mapImage && (
        <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>
          {mapImage.width}×{mapImage.height}px · {formatBytes(mapImage.bytes)} · {cols}×{rows} squares
        </p>
      )}

      <div className={`battlemap-body${expanded && notesOpen ? ' with-notes' : ''}`}>
        {expanded && notesOpen && (
          <SessionNotesPanel campaignId={campaign.id} initialSessionId={notesSessionId} onWikiLink={peekByName} />
        )}
        {board}

        <aside className="battlemap-side" hidden={!panelOpen || preview}>
          {gridSection}

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
            <button
              className="btn small"
              style={{ width: '100%', marginTop: 6 }}
              onClick={() => setAddTokenOpen((o) => !o)}
              aria-expanded={addTokenOpen}
            >
              <Icon name="plus" size={14} /> Add object token
            </button>
            {addTokenOpen && (
              <div className="battlemap-token-palette">
                {TOKEN_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="battlemap-token-preset"
                    title={p.label}
                    onClick={() => {
                      addToken({ label: p.label, tokenIcon: EMOJI_TOKEN_ICONS[p.icon] ?? null, icon: EMOJI_TOKEN_ICONS[p.icon] ? null : p.icon, shape: p.shape })
                      setAddTokenOpen(false)
                    }}
                  >
                    <span className="battlemap-token-preset-emoji" aria-hidden>{p.icon}</span>
                    <span className="battlemap-token-preset-label">{p.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="battlemap-token-preset battlemap-token-preset-custom"
                  title="Drop a token from your own image (a photo or token art)"
                  onClick={() => tokenImageRef.current?.click()}
                >
                  <span className="battlemap-token-preset-emoji" aria-hidden><Icon name="upload" size={18} /></span>
                  <span className="battlemap-token-preset-label">Upload</span>
                </button>
                <button
                  type="button"
                  className="battlemap-token-preset battlemap-token-preset-custom"
                  title="A blank token you can rename, recolor, shape and give an image or emoji"
                  onClick={() => {
                    addToken({ label: `Token ${tokens.length + 1}` })
                    setAddTokenOpen(false)
                  }}
                >
                  <span className="battlemap-token-preset-emoji" aria-hidden>＋</span>
                  <span className="battlemap-token-preset-label">Custom</span>
                </button>
                <input
                  ref={tokenImageRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => addTokenFromImage(e.target.files)}
                />
              </div>
            )}

              {tokenEditor ?? (
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

/** Confirmation strip after a publish; links to the Manage list. */
function publishNote(note: string | null, dismiss: () => void, toast = false) {
  if (!note) return null
  return (
    <p className={toast ? 'bm-toast' : 'faint'} role="status" style={{ fontSize: 13, margin: '8px 0' }} data-testid="publish-note">
      {note} <Link to="/tools/battlemaps/manage">Open Manage</Link> to preview and publish it.{' '}
      <button className="btn ghost small" onClick={dismiss}>Dismiss</button>
    </p>
  )
}

/** True on a phone-width viewport, where the inspector becomes a drawer. */
function useIsPhone(): boolean {
  const q = '(max-width: 820px)'
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}
