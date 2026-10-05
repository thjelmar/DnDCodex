import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import { useCampaign } from './CampaignLayout'
import { getOrCreateWorldMap, updateWorldMap, createImage, deleteImage } from '../db/repo'
import { processImageFile } from '../lib/image'
import { WorldMapCanvas } from '../components/WorldMapCanvas'
import { Icon } from '../components/Icon'
import { useConfirm } from '../components/ConfirmDialog'
import { useAuth } from '../auth/AuthProvider'
import { shareImageToCampaign, unshareImageFromCampaign, shareWorldMap, unshareWorldMap } from '../auth/cloud'
import type { WorldPin } from '../db/types'

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

  const map = useLiveQuery(() => db.worldMaps.where('campaignId').equals(campaign.id).first(), [campaign.id])
  useEffect(() => { getOrCreateWorldMap(campaign.id) }, [campaign.id])

  const image = useLiveQuery(() => (map?.imageId ? db.images.get(map.imageId) : undefined), [map?.imageId])
  const locations = useLiveQuery(() => db.locations.where('campaignId').equals(campaign.id).sortBy('name'), [campaign.id]) ?? []
  const npcs = useLiveQuery(() => db.npcs.where('campaignId').equals(campaign.id).sortBy('name'), [campaign.id]) ?? []

  // Pins live in local state, mirrored from the record, and saved debounced so a
  // drag or a burst of label edits doesn't thrash the DB.
  const [pins, setPins] = useState<WorldPin[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (map && loadedFor.current !== map.id) {
      setPins(map.pins)
      loadedFor.current = map.id
    }
  }, [map])
  useEffect(() => {
    if (!map) return
    const t = setTimeout(() => updateWorldMap(map.id, { pins }), 400)
    return () => clearTimeout(t)
  }, [pins, map])

  const selected = pins.find((p) => p.id === selectedId) ?? null
  const nameFor = (ref: WorldPin['ref']) => {
    if (!ref) return null
    const list = ref.kind === 'location' ? locations : npcs
    return list.find((e) => e.id === ref.id)?.name ?? null
  }

  const patchPin = (id: string, patch: Partial<WorldPin>) =>
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  const addPin = (x: number, y: number) => {
    const p: WorldPin = { id: newId(), x, y, label: '', color: PIN_COLORS[0], ref: null }
    setPins((prev) => [...prev, p])
    setSelectedId(p.id)
  }
  const removePin = (id: string) => {
    setPins((prev) => prev.filter((p) => p.id !== id))
    setSelectedId(null)
  }

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
    if (!map || !map.imageId || !image) return
    setSharing(true)
    setShareError(null)
    try {
      await shareImageToCampaign(campaign.id, { id: map.imageId, dataUrl: image.dataUrl, caption: map.name, width: map.width, height: map.height }, 'worldmap')
      await shareWorldMap(campaign.id, { name: map.name, imageId: map.imageId, width: map.width, height: map.height, pins })
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
    navigate(`/campaign/${campaign.id}/${ref.kind === 'location' ? 'locations' : 'npcs'}?sel=${ref.id}`)
  }

  const linkValue = useMemo(() => (selected?.ref ? `${selected.ref.kind}:${selected.ref.id}` : ''), [selected])

  if (!map) return null

  return (
    <div className="worldmap-page">
      <div className="row between" style={{ alignItems: 'center', marginBottom: 10 }}>
        <div>
          <h2 className="mb-0" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="map" size={18} /> World Map
          </h2>
          <p className="muted" style={{ margin: '2px 0 0' }}>
            A prep/reference map. Click the map to drop a pin, then link it to a location or NPC.
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
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={14} /> {map.imageId ? 'Replace image' : 'Upload map image'}
          </button>
          {map.imageId && (
            <button className="btn ghost small" onClick={removeImage}><Icon name="trash" size={13} /> Remove</button>
          )}
        </div>
      </div>
      {shareError && <p className="muted" style={{ color: 'var(--bad)', marginTop: 0 }}>{shareError}</p>}

      <div className="worldmap-layout">
        <WorldMapCanvas
          imageUrl={image?.dataUrl ?? null}
          width={map.width}
          height={map.height}
          pins={pins}
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
                <button className="btn ghost small" onClick={() => removePin(selected.id)}><Icon name="trash" size={13} /> Delete</button>
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
                    const [kind, id] = v.split(':') as ['location' | 'npc', string]
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
