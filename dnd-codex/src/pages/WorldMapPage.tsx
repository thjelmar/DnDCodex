import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import { useCampaign } from './CampaignLayout'
import { getOrCreateWorldMap, updateWorldMap, createImage, deleteImage, createDetailMap, deleteWorldMap, descendantMaps } from '../db/repo'
import { processImageFile } from '../lib/image'
import { WorldMapStage, useDetailMapRoute, type StageMap } from '../components/WorldMapStage'
import { Icon } from '../components/Icon'
import { useConfirm } from '../components/ConfirmDialog'
import { useAuth } from '../auth/AuthProvider'
import { shareImageToCampaign, unshareImageFromCampaign, shareWorldMap, unshareWorldMap } from '../auth/cloud'
import type { WorldPin, WorldMap } from '../db/types'

const PIN_COLORS = ['#e2504a', '#d4537e', '#7f77dd', '#378add', '#1d9e75', '#ba7517', '#888780']

/** DM world-map editor: upload a map image and drop pins linked to Locations/NPCs.
 *  Prep/reference, distinct from the live VTT Battle Map. One map per campaign. */
export function WorldMapPage() {
  const campaign = useCampaign()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const allMaps = useLiveQuery(() => db.worldMaps.where('campaignId').equals(campaign.id).toArray(), [campaign.id])
  useEffect(() => { getOrCreateWorldMap(campaign.id) }, [campaign.id])
  const { openId, open: openDetail, close: closeDetail } = useDetailMapRoute()

  // `map` is the campaign's root map; `active` is the map on top (a detail map when one is open).
  const map = allMaps?.find((m) => !m.parentMapId)
  const detailMaps = useMemo(() => (allMaps ?? []).filter((m) => m.parentMapId), [allMaps])
  const active: WorldMap | undefined = (openId ? detailMaps.find((m) => m.id === openId) : undefined) ?? map
  const inDetail = !!active && !!map && active.id !== map.id

  const images = useLiveQuery(
    async () => {
      const ids = (allMaps ?? []).map((m) => m.imageId).filter((x): x is string => !!x)
      const rows = await db.images.bulkGet(ids)
      return new Map(rows.filter((r): r is NonNullable<typeof r> => !!r).map((r) => [r.id, r.dataUrl]))
    },
    [allMaps?.map((m) => m.imageId).join('|')],
  )
  const image = map?.imageId ? { dataUrl: images?.get(map.imageId) ?? '' } : undefined
  const locations = useLiveQuery(() => db.locations.where('campaignId').equals(campaign.id).sortBy('name'), [campaign.id]) ?? []
  const npcs = useLiveQuery(() => db.npcs.where('campaignId').equals(campaign.id).sortBy('name'), [campaign.id]) ?? []
  const raceGroups = useLiveQuery(() => db.raceGroups.where('campaignId').equals(campaign.id).sortBy('name'), [campaign.id]) ?? []

  // The pins of the map on top live in local state, mirrored from the record, and
  // saved debounced so a drag or a burst of label edits doesn't thrash the DB. The
  // draft remembers which map it belongs to; switching maps saves the old draft first.
  const [draft, setDraft] = useState<{ mapId: string | null; pins: WorldPin[] }>({ mapId: null, pins: [] })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const loadedFor = useRef<string | null>(null)
  const dirty = useRef(false)
  const latest = useRef(draft)
  latest.current = draft
  const pins = draft.pins
  useEffect(() => {
    if (!active || loadedFor.current === active.id) return
    if (dirty.current && loadedFor.current) {
      void updateWorldMap(loadedFor.current, { pins: latest.current.pins })
    }
    dirty.current = false
    loadedFor.current = active.id
    setDraft({ mapId: active.id, pins: active.pins })
    setSelectedId(null)
  }, [active])
  useEffect(() => {
    if (!draft.mapId || !dirty.current) return
    const t = setTimeout(() => { updateWorldMap(draft.mapId!, { pins: draft.pins }); dirty.current = false }, 400)
    return () => clearTimeout(t)
  }, [draft])
  // Save a pending edit when the page closes.
  useEffect(() => () => {
    if (dirty.current && latest.current.mapId) void updateWorldMap(latest.current.mapId, { pins: latest.current.pins })
  }, [])
  const setPins = (fn: (prev: WorldPin[]) => WorldPin[]) => {
    dirty.current = true
    setDraft((d) => ({ ...d, pins: fn(d.pins) }))
  }
  /** The pins of any map: the draft for the map being edited, the saved record otherwise. */
  const pinsOf = (m: WorldMap) => (draft.mapId === m.id ? draft.pins : m.pins)

  const selected = pins.find((p) => p.id === selectedId) ?? null
  const nameFor = (ref: WorldPin['ref']) => {
    if (!ref) return null
    const list = ref.kind === 'location' ? locations : ref.kind === 'raceGroup' ? raceGroups : npcs
    return list.find((e) => e.id === ref.id)?.name ?? null
  }

  const patchPin = (id: string, patch: Partial<WorldPin>) =>
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const addPin = (x: number, y: number) => {
    const p: WorldPin = { id: newId(), x, y, label: '', color: PIN_COLORS[0], ref: null }
    setPins((prev) => [...prev, p])
    setSelectedId(p.id)
  }
  /** True when a pin on some other map (or another pin here) still opens the detail map. */
  const stillReferenced = (detailId: string, exceptPinId: string) =>
    (allMaps ?? []).some((m) => pinsOf(m).some((p) => p.detailMapId === detailId && p.id !== exceptPinId))
  const detailNameOf = (id?: string) => detailMaps.find((m) => m.id === id)?.name ?? 'the detail map'
  /** Delete a detail map and clear the link from the pin being edited. */
  async function dropDetailMap(detailId: string) {
    await deleteWorldMap(detailId)
    setPins((prev) => prev.map((p) => (p.detailMapId === detailId ? { ...p, detailMapId: undefined } : p)))
  }
  const removePin = async (id: string) => {
    const pin = pins.find((p) => p.id === id)
    if (pin?.detailMapId && detailMaps.some((m) => m.id === pin.detailMapId) && !stillReferenced(pin.detailMapId, id)) {
      const ok = await confirm({
        title: 'Delete this pin and its detail map?',
        message: `The detail map "${detailNameOf(pin.detailMapId)}" and its pins are deleted too. This can't be undone.`,
        confirmLabel: 'Delete both',
        danger: true,
      })
      if (!ok) return
      await deleteWorldMap(pin.detailMapId)
    }
    setPins((prev) => prev.filter((p) => p.id !== id))
    setSelectedId(null)
  }

  // Detail maps (T-94): each is its own WorldMap record under the root map.
  const detailFileRef = useRef<HTMLInputElement>(null)
  const replaceFileRef = useRef<HTMLInputElement>(null)
  async function onPickDetailFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !map || !selected) return
    try {
      const processed = await processImageFile(file, 2000)
      const img = await createImage(campaign.id, { name: file.name, ...processed })
      const created = await createDetailMap(campaign.id, map.id, {
        name: selected.label.trim() || 'Detail map',
        imageId: img.id,
        width: processed.width,
        height: processed.height,
      })
      patchPin(selected.id, { detailMapId: created.id })
    } catch {
      /* not an image / decode failed — ignore */
    }
  }
  async function onReplaceDetailFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const target = detailMaps.find((m) => m.id === selected?.detailMapId)
    if (!file || !target) return
    try {
      const processed = await processImageFile(file, 2000)
      const img = await createImage(campaign.id, { name: file.name, ...processed })
      const oldId = target.imageId
      await updateWorldMap(target.id, { imageId: img.id, width: processed.width, height: processed.height })
      if (oldId) await deleteImage(oldId)
    } catch {
      /* ignore */
    }
  }
  async function removeDetailLink() {
    if (!selected?.detailMapId) return
    const detailId = selected.detailMapId
    if (stillReferenced(detailId, selected.id)) return patchPin(selected.id, { detailMapId: undefined })
    const ok = await confirm({
      title: 'Remove the detail map?',
      message: `The detail map "${detailNameOf(detailId)}" and its pins are deleted. This can't be undone.`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (ok) await dropDetailMap(detailId)
  }

  const stageMaps: StageMap[] = useMemo(
    () =>
      (allMaps ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        imageUrl: (m.imageId && images?.get(m.imageId)) || null,
        width: m.width,
        height: m.height,
        pins: draft.mapId === m.id ? draft.pins : m.pins,
        parentMapId: m.parentMapId ?? null,
      })),
    [allMaps, images, draft],
  )
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !map) return
    try {
      const processed = await processImageFile(file, 2400)
      const img = await createImage(campaign.id, { name: file.name, ...processed })
      const oldId = map.imageId
      await updateWorldMap(map.id, { imageId: img.id, width: processed.width, height: processed.height })
      if (oldId) await deleteImage(oldId)
    } catch {
      /* not an image / decode failed — ignore */
    }
  }

  async function removeImage() {
    if (!map?.imageId) return
    if (!(await confirm({ title: 'Remove map image?', message: 'The pins stay, but the map picture is removed.', confirmLabel: 'Remove', danger: true }))) return
    const oldId = map.imageId
    await updateWorldMap(map.id, { imageId: null, width: 0, height: 0 })
    await deleteImage(oldId)
  }

  // Read-only player sharing: the image rides shared_images (kind 'worldmap'),
  // the pins + meta ride shared_world_maps. "Update" re-pushes the current state.
  async function pushShare() {
    if (!map || !map.imageId || !image?.dataUrl) return
    setSharing(true)
    setShareError(null)
    try {
      await shareImageToCampaign(campaign.id, { id: map.imageId, dataUrl: image.dataUrl, caption: map.name, width: map.width, height: map.height }, 'worldmap')
      // Detail maps: each picture rides shared_images, the pins ride shared_world_maps.detail_maps.
      const below = descendantMaps(allMaps ?? [], map.id)
      for (const d of below) {
        const url = d.imageId ? images?.get(d.imageId) : undefined
        if (d.imageId && url) await shareImageToCampaign(campaign.id, { id: d.imageId, dataUrl: url, caption: d.name, width: d.width, height: d.height }, 'worldmap')
      }
      await shareWorldMap(campaign.id, {
        name: map.name,
        imageId: map.imageId,
        width: map.width,
        height: map.height,
        pins: pinsOf(map),
        detailMaps: below.map((d) => ({ id: d.id, parentMapId: d.parentMapId ?? null, name: d.name, imageId: d.imageId, width: d.width, height: d.height, pins: pinsOf(d) })),
      })
      await updateWorldMap(map.id, { sharedWithPlayers: true })
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Could not share. Are you signed in?')
    } finally {
      setSharing(false)
    }
  }
  async function stopShare() {
    if (!map) return
    setSharing(true)
    setShareError(null)
    try {
      if (map.imageId) await unshareImageFromCampaign(map.imageId)
      for (const d of descendantMaps(allMaps ?? [], map.id)) if (d.imageId) await unshareImageFromCampaign(d.imageId)
      await unshareWorldMap(campaign.id)
      await updateWorldMap(map.id, { sharedWithPlayers: false })
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Could not stop sharing.')
    } finally {
      setSharing(false)
    }
  }

  const openRef = (ref: WorldPin['ref']) => {
    if (!ref) return
    // The Races tab has no per-item selection, so a race-group pin just opens it.
    if (ref.kind === 'raceGroup') return navigate(`/campaign/${campaign.id}/races`)
    navigate(`/campaign/${campaign.id}/${ref.kind === 'location' ? 'locations' : 'npcs'}?sel=${ref.id}`)
  }

  const linkValue = useMemo(() => (selected?.ref ? `${selected.ref.kind}:${selected.ref.id}` : ''), [selected])

  if (!map) return null

  return (
    <div className="worldmap-page">
      <div className="row between" style={{ alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h2 className="mb-0" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="map" size={18} /> World Map
          </h2>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            A prep and reference map. Click the map to drop a pin, then link it to a location, NPC, or race group.
            To zoom into a town or other area, select a pin and add a detail map; double-click the pin to open it.
            For the best fit, use a landscape image around 16:10 (for example 2400×1500 px); other shapes
            leave margins in the default view.
          </p>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          {user && map.imageId && (
            map.sharedWithPlayers ? (
              <>
                <span className="tag" style={{ color: 'var(--good)' }}><Icon name="eye" size={13} color="inherit" /> Shared</span>
                <button className="btn small" onClick={pushShare} disabled={sharing}>{sharing ? '…' : 'Update'}</button>
                <button className="btn ghost small" onClick={stopShare} disabled={sharing}>Stop sharing</button>
              </>
            ) : (
              <button className="btn primary small" onClick={pushShare} disabled={sharing}>
                <Icon name="eye" size={14} color="inherit" /> {sharing ? 'Sharing…' : 'Share with players'}
              </button>
            )
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
          {!inDetail && (
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={14} /> {map.imageId ? 'Replace image' : 'Upload map image'}
            </button>
          )}
          {!inDetail && map.imageId && (
            <button className="btn ghost small" onClick={removeImage}><Icon name="trash" size={13} /> Remove</button>
          )}
        </div>
      </div>
      {shareError && <p className="muted" style={{ color: 'var(--bad)', marginTop: 0 }}>{shareError}</p>}

      <div className="worldmap-layout">
        <WorldMapStage
          maps={stageMaps}
          rootId={map.id}
          openId={openId}
          onOpen={openDetail}
          onClose={closeDetail}
          editable
          selectedPinId={selectedId}
          onSelectPin={setSelectedId}
          onAddPin={addPin}
          onMovePin={(id, x, y) => patchPin(id, { x, y })}
        />

        <aside className="worldmap-inspector">
          {!map.imageId ? (
            <p className="faint">Upload a world or region map to start dropping pins.</p>
          ) : selected ? (
            <>
              <div className="row between" style={{ alignItems: 'center', marginBottom: 10 }}>
                <strong>Pin</strong>
                <button className="btn ghost small" onClick={() => void removePin(selected.id)}><Icon name="trash" size={13} /> Delete</button>
              </div>
              <div className="field">
                <label>Label</label>
                <input className="input" value={selected.label} placeholder="e.g. Harrowmere" onChange={(e) => patchPin(selected.id, { label: e.target.value })} />
              </div>
              <div className="field">
                <label>Links to</label>
                <select
                  className="input"
                  value={linkValue}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return patchPin(selected.id, { ref: null })
                    const [kind, id] = v.split(':') as ['location' | 'npc' | 'raceGroup', string]
                    patchPin(selected.id, { ref: { kind, id } })
                  }}
                >
                  <option value="">— nothing —</option>
                  <optgroup label="Locations">
                    {locations.map((l) => <option key={l.id} value={`location:${l.id}`}>{l.name}</option>)}
                  </optgroup>
                  <optgroup label="NPCs">
                    {npcs.map((n) => <option key={n.id} value={`npc:${n.id}`}>{n.name}</option>)}
                  </optgroup>
                  {raceGroups.length > 0 && (
                    <optgroup label="Race groups">
                      {raceGroups.map((r) => <option key={r.id} value={`raceGroup:${r.id}`}>{r.name}</option>)}
                    </optgroup>
                  )}
                </select>
                {selected.ref && (
                  <button className="btn small" style={{ marginTop: 8 }} onClick={() => openRef(selected.ref)}>
                    <Icon name="external" size={13} /> Open {nameFor(selected.ref) ?? 'sheet'}
                  </button>
                )}
              </div>
              <div className="field">
                <label>Color</label>
                <div className="worldmap-swatches">
                  {PIN_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`worldmap-swatch${selected.color === c ? ' on' : ''}`}
                      style={{ background: c }}
                      aria-label={`Color ${c}`}
                      onClick={() => patchPin(selected.id, { color: c })}
                    />
                  ))}
                </div>
              </div>
              {!inDetail && (
                <div className="field wm-detail-field">
                  <label>Detail map</label>
                  <input ref={detailFileRef} type="file" accept="image/*" hidden onChange={onPickDetailFile} />
                  <input ref={replaceFileRef} type="file" accept="image/*" hidden onChange={onReplaceDetailFile} />
                  {selected.detailMapId && detailMaps.some((m) => m.id === selected.detailMapId) ? (
                    <>
                      <input
                        className="input"
                        aria-label="Detail map name"
                        key={selected.detailMapId}
                        defaultValue={detailNameOf(selected.detailMapId)}
                        onChange={(e) => void updateWorldMap(selected.detailMapId!, { name: e.target.value })}
                      />
                      <div className="row">
                        <button className="btn small" onClick={() => openDetail(selected.detailMapId!)}>
                          <Icon name="map" size={13} /> Open
                        </button>
                        <button className="btn ghost small" onClick={() => replaceFileRef.current?.click()}>Replace image</button>
                        <button className="btn ghost small" onClick={() => void removeDetailLink()}>Remove detail map</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="faint" style={{ margin: '0 0 6px', fontSize: 12.5 }}>A more detailed map, such as a town, that opens when you open this pin.</p>
                      <div className="row">
                        <button className="btn small" onClick={() => detailFileRef.current?.click()}>
                          <Icon name="upload" size={13} /> Add detail map
                        </button>
                        {detailMaps.length > 0 && (
                          <select
                            className="input"
                            aria-label="Use an existing detail map"
                            style={{ width: 'auto', flex: '1 1 120px' }}
                            value=""
                            onChange={(e) => { if (e.target.value) patchPin(selected.id, { detailMapId: e.target.value }) }}
                          >
                            <option value="">Use existing…</option>
                            {detailMaps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="faint" style={{ marginTop: 0 }}>Click the map to drop a pin. Select a pin to edit it.</p>
              {pins.length > 0 && (
                <div className="worldmap-pinlist">
                  <div className="sidebar-heading" style={{ margin: '4px 0' }}>Pins ({pins.length})</div>
                  {pins.map((p) => (
                    <button key={p.id} className="worldmap-pinrow" onClick={() => setSelectedId(p.id)}>
                      <span className="worldmap-pin-dot" style={{ background: p.color }} />
                      <span style={{ flex: 1, textAlign: 'left' }}>{p.label || <span className="faint">Unlabeled pin</span>}</span>
                      {p.ref && <span className="faint" style={{ fontSize: 12 }}>{nameFor(p.ref) ?? p.ref.kind}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
