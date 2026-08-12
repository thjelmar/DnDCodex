import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createLocation, updateLocation, deleteLocation } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { EntityLinks } from '../components/EntityLinks'
import { RichTextEditor } from '../components/RichTextEditor'
import { TagInput } from '../components/TagInput'
import { useConfirm } from '../components/ConfirmDialog'
import type { Location, LocationType, Id } from '../db/types'

// Types run largest → smallest; the tree nests them via parentLocationId.
const TYPES: LocationType[] = ['world', 'region', 'kingdom', 'city', 'town', 'village', 'dungeon', 'landmark', 'other']
const TYPE_ORDER = new Map(TYPES.map((t, i) => [t, i]))
const TYPE_ICON: Record<LocationType, string> = {
  world: '🌍',
  region: '🗺️',
  kingdom: '👑',
  city: '🏙️',
  town: '🏘️',
  village: '🛖',
  dungeon: '🏰',
  landmark: '🗿',
  other: '📍',
}

const PROSPERITY_LEVELS = ['Thriving', 'Prosperous', 'Stable', 'Struggling', 'Impoverished', 'Ruined']

// Which structured field groups each type surfaces in the editor.
type FieldGroup = 'government' | 'ruler' | 'currency' | 'religion' | 'departments' | 'population' | 'prosperity' | 'trade' | 'poi' | 'relations'
const SETTLEMENT: FieldGroup[] = ['ruler', 'population', 'religion', 'prosperity', 'trade', 'poi', 'relations']
const FIELDS_BY_TYPE: Record<LocationType, FieldGroup[]> = {
  world: [],
  region: ['relations'],
  kingdom: ['government', 'ruler', 'currency', 'religion', 'departments', 'relations'],
  city: SETTLEMENT,
  town: SETTLEMENT,
  village: SETTLEMENT,
  dungeon: [],
  landmark: [],
  other: [],
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
    const l = await createLocation(campaign.id, selected ? { parentLocationId: selected.id } : {})
    setSelectedId(l.id)
  }

  // Group children by parent for the tree (orphans whose parent is missing
  // render at the root).
  const childrenByParent = useMemo(() => {
    const all = locations ?? []
    const ids = new Set(all.map((l) => l.id))
    const map = new Map<string, Location[]>()
    for (const l of all) {
      const key = l.parentLocationId && ids.has(l.parentLocationId) ? l.parentLocationId : '__root__'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(l)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (TYPE_ORDER.get(a.type)! - TYPE_ORDER.get(b.type)!) || a.name.localeCompare(b.name))
    }
    return map
  }, [locations])

  const roots = childrenByParent.get('__root__') ?? []

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <button className="btn primary" style={{ width: '100%', marginBottom: 12 }} onClick={add}>
          ＋ New {selected ? `child of ${TYPE_ICON[selected.type]}` : 'Location'}
        </button>
        {locations?.length === 0 && <p className="faint">No locations yet. Start with a World or Region.</p>}
        {roots.map((l) => (
          <TreeNode
            key={l.id}
            location={l}
            depth={0}
            childrenByParent={childrenByParent}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ))}
      </div>

      <div>
        {selected ? (
          <LocationEditor
            key={selected.id}
            location={selected}
            campaignId={campaign.id}
            allLocations={locations ?? []}
            onSelect={setSelectedId}
            onDelete={() => setSelectedId(null)}
          />
        ) : (
          <div className="empty">
            <div className="big">🗺️</div>
            <p>Select a location, or create one to start mapping your world.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function TreeNode({
  location,
  depth,
  childrenByParent,
  selectedId,
  onSelect,
}: {
  location: Location
  depth: number
  childrenByParent: Map<string, Location[]>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const kids = childrenByParent.get(location.id) ?? []

  return (
    <div>
      <div
        className="list-row"
        style={{
          cursor: 'pointer',
          padding: '8px 10px',
          marginBottom: 4,
          paddingLeft: 10 + depth * 16,
          borderColor: location.id === selectedId ? 'var(--accent)' : undefined,
        }}
        onClick={() => onSelect(location.id)}
      >
        <div className="row" style={{ gap: 6, minWidth: 0 }}>
          {kids.length > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setOpen((o) => !o)
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', width: 14, padding: 0 }}
            >
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span style={{ width: 14 }} />
          )}
          <span>{TYPE_ICON[location.type]}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{location.name}</span>
        </div>
      </div>
      {open &&
        kids.map((k) => (
          <TreeNode
            key={k.id}
            location={k}
            depth={depth + 1}
            childrenByParent={childrenByParent}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </div>
  )
}

/** Collects a location and all of its descendants (to prevent parent cycles). */
function descendantIds(rootId: Id, all: Location[]): Set<Id> {
  const out = new Set<Id>([rootId])
  let added = true
  while (added) {
    added = false
    for (const l of all) {
      if (l.parentLocationId && out.has(l.parentLocationId) && !out.has(l.id)) {
        out.add(l.id)
        added = true
      }
    }
  }
  return out
}

function LocationEditor({
  location,
  campaignId,
  allLocations,
  onSelect,
  onDelete,
}: {
  location: Location
  campaignId: string
  allLocations: Location[]
  onSelect: (id: string) => void
  onDelete: () => void
}) {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const npcs = useLiveQuery(
    () => db.npcs.where('campaignId').equals(campaignId).sortBy('name'),
    [campaignId],
  ) ?? []

  const [name, setName] = useState(location.name)
  const [type, setType] = useState<LocationType>(location.type)
  const [parentLocationId, setParent] = useState(location.parentLocationId ?? '')
  const [description, setDescription] = useState(location.description)
  const [tags, setTags] = useState(location.tags)
  const [governmentType, setGovernmentType] = useState(location.governmentType)
  const [rulerNpcId, setRulerNpcId] = useState(location.rulerNpcId ?? '')
  const [currency, setCurrency] = useState(location.currency)
  const [religion, setReligion] = useState(location.religion)
  const [departments, setDepartments] = useState(location.departments)
  const [population, setPopulation] = useState(location.population)
  const [prosperity, setProsperity] = useState(location.prosperity)
  const [imports, setImports] = useState(location.imports)
  const [exports, setExports] = useState(location.exports)
  const [pointsOfInterest, setPointsOfInterest] = useState(location.pointsOfInterest)
  const [allyIds, setAllyIds] = useState(location.allyIds)
  const [enemyIds, setEnemyIds] = useState(location.enemyIds)

  useEffect(() => {
    const t = setTimeout(() => {
      updateLocation(location.id, {
        name, type, parentLocationId: parentLocationId || null, description, tags,
        governmentType, rulerNpcId: rulerNpcId || null, currency, religion, departments,
        population, prosperity, imports, exports, pointsOfInterest, allyIds, enemyIds,
      })
    }, 500)
    return () => clearTimeout(t)
  }, [name, type, parentLocationId, description, tags, governmentType, rulerNpcId, currency,
      religion, departments, population, prosperity, imports, exports, pointsOfInterest,
      allyIds, enemyIds, location.id])

  const byId = useMemo(() => new Map(allLocations.map((l) => [l.id, l])), [allLocations])
  const groups = FIELDS_BY_TYPE[type]

  // Breadcrumb: the chain of ancestors up to the world (the "auto-link").
  const ancestors: Location[] = []
  {
    let cur = parentLocationId ? byId.get(parentLocationId) : undefined
    const guard = new Set<string>()
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id)
      ancestors.unshift(cur)
      cur = cur.parentLocationId ? byId.get(cur.parentLocationId) : undefined
    }
  }

  const blocked = descendantIds(location.id, allLocations)
  const parentOptions = allLocations.filter((l) => !blocked.has(l.id))
  const ruler = rulerNpcId ? npcs.find((n) => n.id === rulerNpcId) : null

  return (
    <div>
      {ancestors.length > 0 && (
        <div className="row wrap faint" style={{ gap: 6, marginBottom: 10, fontSize: 13 }}>
          {ancestors.map((a) => (
            <span key={a.id}>
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); onSelect(a.id) }}
                style={{ color: 'var(--text-dim)' }}
              >
                {TYPE_ICON[a.type]} {a.name}
              </a>
              <span style={{ margin: '0 4px' }}>›</span>
            </span>
          ))}
          <span>{TYPE_ICON[type]} {name || 'Untitled'}</span>
        </div>
      )}

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
                {TYPE_ICON[t]} {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label>Part of (auto-links up the hierarchy)</label>
        <select className="select" value={parentLocationId} onChange={(e) => setParent(e.target.value)}>
          <option value="">— none (top level) —</option>
          {parentOptions.map((l) => (
            <option key={l.id} value={l.id}>
              {TYPE_ICON[l.type]} {l.name}
            </option>
          ))}
        </select>
      </div>

      {/* Structured, type-specific fields */}
      {groups.includes('government') && (
        <div className="field">
          <label>Government type</label>
          <input className="input" value={governmentType} onChange={(e) => setGovernmentType(e.target.value)} placeholder="Feudal monarchy, republic, theocracy…" />
        </div>
      )}
      {groups.includes('ruler') && (
        <div className="field">
          <label>{type === 'kingdom' ? 'Ruler' : 'Leader'} (links to an NPC)</label>
          <div className="row" style={{ gap: 8 }}>
            <select className="select" value={rulerNpcId} onChange={(e) => setRulerNpcId(e.target.value)}>
              <option value="">— none —</option>
              {npcs.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
            {ruler && (
              <button
                className="btn small"
                onClick={() => navigate(`/campaign/${campaignId}/npcs?sel=${ruler.id}`)}
                title="Open NPC"
              >
                ↗
              </button>
            )}
          </div>
        </div>
      )}
      <div className="form-row">
        {groups.includes('currency') && (
          <div className="field">
            <label>Currency</label>
            <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="Gold crowns…" />
          </div>
        )}
        {groups.includes('population') && (
          <div className="field">
            <label>Population</label>
            <input className="input" value={population} onChange={(e) => setPopulation(e.target.value)} placeholder="~5,000" />
          </div>
        )}
        {groups.includes('religion') && (
          <div className="field">
            <label>{type === 'kingdom' ? 'Religion' : 'Religions'}</label>
            <input className="input" value={religion} onChange={(e) => setReligion(e.target.value)} placeholder="Dominant faith(s)…" />
          </div>
        )}
        {groups.includes('prosperity') && (
          <div className="field">
            <label>Prosperity</label>
            <select className="select" value={prosperity} onChange={(e) => setProsperity(e.target.value)}>
              <option value="">—</option>
              {PROSPERITY_LEVELS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      {groups.includes('trade') && (
        <div className="form-row">
          <div className="field">
            <label>Imports</label>
            <input className="input" value={imports} onChange={(e) => setImports(e.target.value)} placeholder="Grain, iron…" />
          </div>
          <div className="field">
            <label>Exports</label>
            <input className="input" value={exports} onChange={(e) => setExports(e.target.value)} placeholder="Textiles, wine…" />
          </div>
        </div>
      )}

      {groups.includes('relations') && (
        <div className="form-row">
          <div className="field">
            <label>Allies</label>
            <LocationMultiPicker allLocations={allLocations} selfId={location.id} value={allyIds} onChange={setAllyIds} onOpen={onSelect} />
          </div>
          <div className="field">
            <label>Enemies</label>
            <LocationMultiPicker allLocations={allLocations} selfId={location.id} value={enemyIds} onChange={setEnemyIds} onOpen={onSelect} />
          </div>
        </div>
      )}

      <div className="field">
        <label>Tags</label>
        <TagInput campaignId={campaignId} tags={tags} onChange={setTags} />
      </div>

      <RichTextEditor
        campaignId={campaignId}
        value={description}
        onChange={setDescription}
        label="Description"
        placeholder="What's here, its history, notable features, [[wiki links]]…"
        minHeight={160}
      />

      {groups.includes('departments') && (
        <RichTextEditor
          campaignId={campaignId}
          value={departments}
          onChange={setDepartments}
          label="Governing departments (optional)"
          placeholder="Ministries, councils, guilds that run the kingdom…"
        />
      )}
      {groups.includes('poi') && (
        <RichTextEditor
          campaignId={campaignId}
          value={pointsOfInterest}
          onChange={setPointsOfInterest}
          label="Points of interest"
          placeholder="Landmarks, taverns, temples, shops worth visiting…"
        />
      )}

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
            if (
              await confirm({
                title: 'Delete location?',
                message: (
                  <>
                    Delete <strong>{location.name}</strong>? Its child locations will move up to
                    the top level. This can't be undone.
                  </>
                ),
                confirmLabel: 'Delete',
                danger: true,
              })
            ) {
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

function LocationMultiPicker({
  allLocations,
  selfId,
  value,
  onChange,
  onOpen,
}: {
  allLocations: Location[]
  selfId: string
  value: string[]
  onChange: (ids: string[]) => void
  onOpen: (id: string) => void
}) {
  const options = allLocations.filter((l) => l.id !== selfId && !value.includes(l.id))
  return (
    <div>
      <div className="row wrap" style={{ gap: 6, marginBottom: value.length ? 6 : 0 }}>
        {value.map((id) => {
          const loc = allLocations.find((l) => l.id === id)
          return (
            <span key={id} className="tag" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <a href="#" onClick={(e) => { e.preventDefault(); onOpen(id) }} style={{ color: 'inherit', textDecoration: 'none' }}>
                {loc ? `${TYPE_ICON[loc.type]} ${loc.name}` : '(deleted)'}
              </a>
              <button
                onClick={() => onChange(value.filter((v) => v !== id))}
                style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 0 }}
                aria-label="Remove"
              >
                ✕
              </button>
            </span>
          )
        })}
      </div>
      <select
        className="select"
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value])
        }}
      >
        <option value="">+ add…</option>
        {options.map((l) => (
          <option key={l.id} value={l.id}>
            {TYPE_ICON[l.type]} {l.name}
          </option>
        ))}
      </select>
    </div>
  )
}
