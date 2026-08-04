import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createLocation, updateLocation, deleteLocation } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { EntityLinks } from '../components/EntityLinks'
import { CampaignMarkdown } from '../components/CampaignMarkdown'
import { TagInput } from '../components/TagInput'
import type { Location, LocationType } from '../db/types'

const TYPES: LocationType[] = ['region', 'city', 'town', 'village', 'dungeon', 'landmark', 'other']
const TYPE_ICON: Record<LocationType, string> = {
  region: '🗺️',
  city: '🏙️',
  town: '🏘️',
  village: '🛖',
  dungeon: '🏰',
  landmark: '🗿',
  other: '📍',
}

export function LocationsPage() {
  const campaign = useCampaign()
  const locations = useLiveQuery(
    () => db.locations.where('campaignId').equals(campaign.id).sortBy('name'),
    [campaign.id],
  )

  const [searchParams] = useSearchParams()
  const sel = searchParams.get('sel')
  const [selectedId, setSelectedId] = useState<string | null>(() => sel)
  useEffect(() => {
    if (sel) setSelectedId(sel)
  }, [sel])
  const selected = locations?.find((l) => l.id === selectedId) ?? null

  async function add() {
    const l = await createLocation(campaign.id)
    setSelectedId(l.id)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <button className="btn primary" style={{ width: '100%', marginBottom: 12 }} onClick={add}>
          ＋ New Location
        </button>
        {locations?.length === 0 && <p className="faint">No locations yet.</p>}
        {locations?.map((l) => (
          <div
            key={l.id}
            className="list-row"
            style={{ cursor: 'pointer', borderColor: l.id === selectedId ? 'var(--accent)' : undefined }}
            onClick={() => setSelectedId(l.id)}
          >
            <div>
              <div className="title">
                {TYPE_ICON[l.type]} {l.name}
              </div>
              <div className="sub" style={{ textTransform: 'capitalize' }}>{l.type}</div>
            </div>
          </div>
        ))}
      </div>

      <div>
        {selected ? (
          <LocationEditor
            key={selected.id}
            location={selected}
            campaignId={campaign.id}
            allLocations={locations ?? []}
            onDelete={() => setSelectedId(null)}
          />
        ) : (
          <div className="empty">
            <div className="big">📍</div>
            <p>Select a location or create one.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function LocationEditor({
  location,
  campaignId,
  allLocations,
  onDelete,
}: {
  location: Location
  campaignId: string
  allLocations: Location[]
  onDelete: () => void
}) {
  const [name, setName] = useState(location.name)
  const [type, setType] = useState<LocationType>(location.type)
  const [parentLocationId, setParent] = useState(location.parentLocationId ?? '')
  const [description, setDescription] = useState(location.description)
  const [tags, setTags] = useState(location.tags)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      updateLocation(location.id, {
        name,
        type,
        parentLocationId: parentLocationId || null,
        description,
        tags,
      })
    }, 500)
    return () => clearTimeout(t)
  }, [name, type, parentLocationId, description, tags, location.id])

  return (
    <div>
      <div className="form-row">
        <div className="field">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Type</label>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as LocationType)}>
            {TYPES.map((t) => (
              <option key={t} value={t} style={{ textTransform: 'capitalize' }}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Part of (parent location)</label>
        <select className="select" value={parentLocationId} onChange={(e) => setParent(e.target.value)}>
          <option value="">— none —</option>
          {allLocations
            .filter((l) => l.id !== location.id)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
      </div>
      <div className="field">
        <label>Tags</label>
        <TagInput campaignId={campaignId} tags={tags} onChange={setTags} />
      </div>
      <div className="field">
        <div className="row between">
          <label>Description (markdown, supports [[wiki links]])</label>
          <button className="btn ghost small" onClick={() => setPreview((p) => !p)}>
            {preview ? '✎ Edit' : '👁 Preview'}
          </button>
        </div>
        {preview ? (
          <div className="card" style={{ cursor: 'default' }}>
            <CampaignMarkdown campaignId={campaignId} text={description} />
          </div>
        ) : (
          <textarea className="textarea tall" value={description} onChange={(e) => setDescription(e.target.value)} />
        )}
      </div>

      <label className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
        Connections
      </label>
      <div style={{ marginTop: 8, marginBottom: 18 }}>
        <EntityLinks campaignId={campaignId} kind="location" id={location.id} />
      </div>

      <div className="row between">
        <span className="faint" style={{ fontSize: 12 }}>Autosaves as you type.</span>
        <button
          className="btn danger small"
          onClick={async () => {
            if (confirm(`Delete "${location.name}"?`)) {
              await deleteLocation(location.id)
              onDelete()
            }
          }}
        >
          Delete location
        </button>
      </div>
    </div>
  )
}
