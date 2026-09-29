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
import {
  MAP_MAX_DIM,
  TOKEN_COLORS,
  TOKEN_SIZES,
  defaultGrid,
  normalizeOffset,
  snapCenterToCell,
} from '../lib/tabletop'
import type { Id, Scene, SceneGrid, SceneToken } from '../db/types'

// Battle Map tab: the built-in VTT (v1 = map + grid + tokens, DM-side). A scene
// list on the left; the selected scene's board, grid calibration, and tokens on
// the right. Scenes sync and back up like any other campaign record.

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
          <SceneEditor key={selected.id} scene={selected} onDeleted={() => setSelectedId(null)} />
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

function SceneEditor({ scene, onDeleted }: { scene: Scene; onDeleted: () => void }) {
  const confirm = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)
  const centerRef = useRef({ x: scene.width / 2, y: scene.height / 2 })

  // Local draft, saved on a short debounce (same model as the other editors).
  const [name, setName] = useState(scene.name)
  const [grid, setGrid] = useState<SceneGrid>(scene.grid)
  const [tokens, setTokens] = useState<SceneToken[]>(scene.tokens)
  const [size, setSize] = useState({ width: scene.width, height: scene.height })
  const [imageId, setImageId] = useState<Id | null>(scene.imageId)
  const dirty = useRef(false)
  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(() => {
      updateScene(scene.id, { name, grid, tokens, imageId, width: size.width, height: size.height })
    }, 400)
    return () => clearTimeout(t)
  }, [name, grid, tokens, imageId, size, scene.id])
  const touch = () => {
    dirty.current = true
  }

  const [selectedToken, setSelectedToken] = useState<string | null>(null)
  const [aligning, setAligning] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [peek, setPeek] = useState<{ kind: PeekKind; id: Id } | null>(null)

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
    next.offsetX = normalizeOffset(next.offsetX, next.cellPx)
    next.offsetY = normalizeOffset(next.offsetY, next.cellPx)
    // A blank board is sized in squares, so it grows/shrinks with the square size.
    if (!imageId && next.cellPx !== grid.cellPx) {
      setSize({
        width: Math.round(size.width / grid.cellPx) * next.cellPx,
        height: Math.round(size.height / grid.cellPx) * next.cellPx,
      })
    }
    setGrid(next)
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

  return (
    <div>
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
          style={{ maxWidth: 320, fontWeight: 600 }}
          value={name}
          onChange={(e) => {
            touch()
            setName(e.target.value)
          }}
          aria-label="Battle map name"
        />
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
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
                await deleteScene(scene.id)
                onDeleted()
              }
            }}
          >
            <Icon name="trash" size={14} color="inherit" /> Delete
          </button>
        </div>
      </div>
      {uploadError && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{uploadError}</p>}
      {mapImage && (
        <p className="faint" style={{ fontSize: 12, margin: '0 0 8px' }}>
          {mapImage.width}×{mapImage.height}px · {formatBytes(mapImage.bytes)} · {cols}×{rows} squares
        </p>
      )}

      <div className="battlemap-body">
        <Tabletop
          width={size.width}
          height={size.height}
          grid={grid}
          tokens={tokens}
          mapUrl={mapImage?.dataUrl ?? null}
          portraits={portraits ?? {}}
          selectedId={selectedToken}
          onSelect={setSelectedToken}
          onMoveToken={(id, col, row) => patchToken(id, { col, row })}
          onDeleteToken={removeToken}
          onOpenToken={openToken}
          aligning={aligning}
          onAlign={(g) => {
            touch()
            setGrid(g)
            setAligning(false)
          }}
          centerRef={centerRef}
        />

        <aside className="battlemap-side">
          <section>
            <h4>Grid</h4>
            <label className="battlemap-check">
              <input type="checkbox" checked={grid.show} onChange={(e) => setGridField({ show: e.target.checked })} />
              Show grid
            </label>
            <div className="battlemap-fields">
              <label>
                Square size (px)
                <NumberField value={grid.cellPx} min={8} max={1000} onChange={(v) => v != null && setGridField({ cellPx: v })} ariaLabel="Square size in pixels" />
              </label>
              <label>
                Offset X
                <NumberField value={Math.round(grid.offsetX)} min={-1000} max={1000} onChange={(v) => v != null && setGridField({ offsetX: v })} ariaLabel="Grid offset X" />
              </label>
              <label>
                Offset Y
                <NumberField value={Math.round(grid.offsetY)} min={-1000} max={1000} onChange={(v) => v != null && setGridField({ offsetY: v })} ariaLabel="Grid offset Y" />
              </label>
              <label>
                Line color
                <input type="color" value={grid.color} onChange={(e) => setGridField({ color: e.target.value })} />
              </label>
            </div>
            {imageId ? (
              <button
                className={`btn small${aligning ? ' primary' : ''}`}
                style={{ width: '100%' }}
                onClick={() => setAligning((a) => !a)}
                title="Draw a box around one square of the map to match the grid to it"
              >
                {aligning ? 'Cancel align' : 'Align grid to map'}
              </button>
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
                <label className="battlemap-check" title="Stored now; respected once players can see battle maps">
                  <input type="checkbox" checked={current.hidden === true} onChange={(e) => patchToken(current.id, { hidden: e.target.checked })} />
                  Hidden from players
                </label>
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
                Drag tokens to move them; they snap to the grid. Click a token to edit it, arrow keys nudge it, Delete removes it, and double-click an NPC token to see its stat block.
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
                      <span className="battlemap-dot" style={{ background: t.color }} />
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
