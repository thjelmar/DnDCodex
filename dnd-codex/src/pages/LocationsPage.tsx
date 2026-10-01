import { Icon } from '../components/Icon'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createLocation, updateLocation, deleteLocation, createNPC } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { EntityLinks } from '../components/EntityLinks'
import { RichTextEditor } from '../components/RichTextEditor'
import { TagInput } from '../components/TagInput'
import { useConfirm } from '../components/ConfirmDialog'
import { AddLinkButton } from '../components/AddLinkButton'
import { EntityImage } from '../components/EntityImage'
import { ShareControl } from '../components/ShareControl'
import {
  SETTLEMENT_TIERS, generateSettlement, poisToHtml, tierForType,
  rollPopulation, rollProsperity, rollGovernment, rollReligion, rollTradeList, rollLeaderName, rollPoi, rollHook, reconcileToTier,
  type GeneratedSettlement, type SettlementTier,
} from '../lib/settlementGen'
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
          <Icon name="plus" size={15} color="inherit" /> New {selected ? `child of ${TYPE_ICON[selected.type]}` : 'Location'}
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

function RerollBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="loc-gen-reroll" onClick={onClick} title={`Re-roll ${label}`} aria-label={`Re-roll ${label}`}>
      <Icon name="dice" size={13} />
    </button>
  )
}
function RemoveBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="loc-gen-remove" onClick={onClick} title={`Remove ${label}`} aria-label={`Remove ${label}`}>
      <Icon name="x" size={13} />
    </button>
  )
}
/** A labeled, inline-editable generated value with a per-line re-roll. */
function GenField({ label, value, onChange, onReroll }: { label: string; value: string; onChange: (v: string) => void; onReroll: () => void }) {
  return (
    <div className="loc-gen-field">
      <label className="faint">{label}</label>
      <div className="loc-gen-input">
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        <RerollBtn label={label.toLowerCase()} onClick={onReroll} />
      </div>
    </div>
  )
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
  const [imageId, setImageId] = useState<string | null>(location.imageId ?? null)
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
        name, type, imageId, parentLocationId: parentLocationId || null, description, tags,
        governmentType, rulerNpcId: rulerNpcId || null, currency, religion, departments,
        population, prosperity, imports, exports, pointsOfInterest, allyIds, enemyIds,
      })
    }, 500)
    return () => clearTimeout(t)
  }, [name, type, imageId, parentLocationId, description, tags, governmentType, rulerNpcId, currency,
      religion, departments, population, prosperity, imports, exports, pointsOfInterest,
      allyIds, enemyIds, location.id])

  const byId = useMemo(() => new Map(allLocations.map((l) => [l.id, l])), [allLocations])
  const groups = FIELDS_BY_TYPE[type]

  // One-click settlement generator (towns/villages/cities): rolls a coherent,
  // tier-constrained set and fills only the blank fields, so a draft never
  // clobbers anything already written.
  const isSettlement = type === 'city' || type === 'town' || type === 'village'
  const [genOpen, setGenOpen] = useState(false)
  const [genTier, setGenTier] = useState<SettlementTier>(() => tierForType(type))
  const [gen, setGen] = useState<GeneratedSettlement | null>(null)
  const [genTag, setGenTag] = useState('generated')
  const [genNote, setGenNote] = useState<string | null>(null)
  function rollSettlement(tier: SettlementTier) {
    setGenTier(tier)
    setGen(generateSettlement(tier))
    setGenNote(null)
  }
  // Changing the size only re-fits the pieces the new tier makes incorrect
  // (population, out-of-tier leadership / points of interest) and keeps the rest.
  function changeTier(tier: SettlementTier) {
    setGenTier(tier)
    setGen((g) => (g ? reconcileToTier(g, tier) : generateSettlement(tier)))
    setGenNote(null)
  }
  // Edit any generated value in place before applying.
  const patchGen = (p: Partial<GeneratedSettlement>) => setGen((g) => (g ? { ...g, ...p } : g))
  const patchPoi = (i: number, name: string) =>
    setGen((g) => (g ? { ...g, pois: g.pois.map((p, j) => (j === i ? { ...p, name } : p)) } : g))
  const rerollPoi = (i: number) =>
    setGen((g) => (g ? { ...g, pois: g.pois.map((p, j) => (j === i ? rollPoi(g.tier, g.pois.filter((_, k) => k !== i)) : p)) } : g))
  const removePoi = (i: number) => setGen((g) => (g ? { ...g, pois: g.pois.filter((_, j) => j !== i) } : g))
  const addPoi = () => setGen((g) => (g ? { ...g, pois: [...g.pois, rollPoi(g.tier, g.pois)] } : g))
  const patchHook = (i: number, text: string) => setGen((g) => (g ? { ...g, hooks: g.hooks.map((h, j) => (j === i ? text : h)) } : g))
  const rerollHook = (i: number) => setGen((g) => (g ? { ...g, hooks: g.hooks.map((h, j) => (j === i ? rollHook(g.hooks.filter((_, k) => k !== i)) : h)) } : g))
  const removeHook = (i: number) => setGen((g) => (g ? { ...g, hooks: g.hooks.filter((_, j) => j !== i) } : g))
  const addHook = () => setGen((g) => (g ? { ...g, hooks: [...g.hooks, rollHook(g.hooks)] } : g))

  async function applyGen() {
    if (!gen) return
    const blank = (s: string) => !s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
    const tag = genTag.trim()
    if (blank(population)) setPopulation(gen.population)
    if (blank(prosperity)) setProsperity(gen.prosperity)
    if (blank(religion)) setReligion(gen.religion)
    if (blank(imports)) setImports(gen.imports)
    if (blank(exports)) setExports(gen.exports)
    if (blank(pointsOfInterest) && gen.pois.length) setPointsOfInterest(poisToHtml(gen.pois))
    // Start the leader's character sheet as a real NPC (only if none is linked,
    // so an existing leader is never lost), carrying the identifier tag.
    let leaderMsg = ''
    if (!rulerNpcId && gen.leaderName.trim()) {
      const npc = await createNPC(campaignId, {
        name: gen.leaderName.trim(),
        role: gen.government,
        locationId: location.id,
        tags: tag ? [tag] : [],
      })
      setRulerNpcId(npc.id)
      await updateLocation(location.id, { rulerNpcId: npc.id })
      leaderMsg = ` Created leader NPC “${npc.name}” — open it from the Leader field to finish the sheet.`
    }
    // Identifier tag on the location, so generated places are easy to find.
    if (tag && !tags.includes(tag)) setTags([...tags, tag])
    setGenNote(`Filled the blank fields${tag ? ` and tagged this location “${tag}”` : ''}.${leaderMsg}`)
  }

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
      <div className="share-bar">
        {isSettlement && (
          <button
            className={`btn small gen-trigger${genOpen ? '' : ' primary'}`}
            onClick={() => {
              setGenOpen((o) => !o)
              if (!gen) rollSettlement(genTier)
            }}
            aria-expanded={genOpen}
          >
            <Icon name="dice" size={14} color="inherit" /> {genOpen ? 'Close generator' : 'Generate this settlement'}
          </button>
        )}
        <ShareControl campaignId={campaignId} kind="location" entity={location} />
      </div>

      {isSettlement && genOpen && (
        <div className="loc-gen">
          <div className="loc-gen-head">
            <select
              className="select"
              style={{ width: 'auto' }}
              value={genTier}
              onChange={(e) => changeTier(e.target.value as SettlementTier)}
              aria-label="Settlement size"
            >
              {SETTLEMENT_TIERS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label} ({t.popMin.toLocaleString()}–{t.popMax.toLocaleString()})
                </option>
              ))}
            </select>
            <button className="btn small" onClick={() => rollSettlement(genTier)} title="Roll a new one">
              <Icon name="dice" size={13} /> Re-roll
            </button>
          </div>
          {gen && (
            <div className="loc-gen-body">
              <div className="loc-gen-grid">
                <GenField label="Population" value={gen.population} onChange={(v) => patchGen({ population: v })} onReroll={() => patchGen({ population: rollPopulation(gen.tier) })} />
                <div className="loc-gen-field">
                  <label className="faint">Prosperity</label>
                  <div className="loc-gen-input">
                    <select className="select" value={gen.prosperity} onChange={(e) => patchGen({ prosperity: e.target.value })} aria-label="Prosperity">
                      {PROSPERITY_LEVELS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <RerollBtn label="prosperity" onClick={() => patchGen({ prosperity: rollProsperity() })} />
                  </div>
                </div>
                <GenField label="Leadership" value={gen.government} onChange={(v) => patchGen({ government: v })} onReroll={() => patchGen({ government: rollGovernment(gen.tier) })} />
                <GenField label="Religion" value={gen.religion} onChange={(v) => patchGen({ religion: v })} onReroll={() => patchGen({ religion: rollReligion() })} />
                <GenField label="Imports" value={gen.imports} onChange={(v) => patchGen({ imports: v })} onReroll={() => patchGen({ imports: rollTradeList() })} />
                <GenField label="Exports" value={gen.exports} onChange={(v) => patchGen({ exports: v })} onReroll={() => patchGen({ exports: rollTradeList() })} />
                <GenField label="Leader" value={gen.leaderName} onChange={(v) => patchGen({ leaderName: v })} onReroll={() => patchGen({ leaderName: rollLeaderName() })} />
              </div>

              <div className="loc-gen-list">
                <label className="faint">Points of interest</label>
                {gen.pois.map((p, i) => (
                  <div className="loc-gen-line" key={i}>
                    <input className="input" value={p.name} onChange={(e) => patchPoi(i, e.target.value)} aria-label={`Point of interest ${i + 1}`} />
                    <span className="loc-gen-kind">{p.kind.toLowerCase()}</span>
                    <RerollBtn label="this place" onClick={() => rerollPoi(i)} />
                    <RemoveBtn label="point of interest" onClick={() => removePoi(i)} />
                  </div>
                ))}
                <button className="btn ghost small" onClick={addPoi}><Icon name="plus" size={13} /> Add point of interest</button>
              </div>

              <div className="loc-gen-list">
                <label className="faint">Hooks (suggestions)</label>
                {gen.hooks.map((h, i) => (
                  <div className="loc-gen-line" key={i}>
                    <input className="input" value={h} onChange={(e) => patchHook(i, e.target.value)} aria-label={`Hook ${i + 1}`} />
                    <RerollBtn label="this hook" onClick={() => rerollHook(i)} />
                    <RemoveBtn label="hook" onClick={() => removeHook(i)} />
                  </div>
                ))}
                <button className="btn ghost small" onClick={addHook}><Icon name="plus" size={13} /> Add hook</button>
              </div>

              <div className="loc-gen-field" style={{ maxWidth: 320 }}>
                <label className="faint">Identifier tag (added to this location + the leader)</label>
                <input className="input" value={genTag} onChange={(e) => setGenTag(e.target.value)} placeholder="generated" aria-label="Identifier tag" />
              </div>

              <div className="row" style={{ gap: 10, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                <button className="btn primary small" onClick={applyGen}>
                  <Icon name="check" size={13} color="inherit" /> Fill empty fields
                </button>
                <span className="faint" style={{ fontSize: 12 }}>
                  {genNote ?? (
                    <>Edit anything above, re-roll a single line with <Icon name="dice" size={12} />, then fill. Only blank fields are filled — your text is safe.</>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

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

      <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <EntityImage campaignId={campaignId} imageId={imageId} onChange={setImageId} label="image" />
        <div style={{ flex: 1, minWidth: 0 }}>
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
          {npcs.length === 0 ? (
            <AddLinkButton
              label="NPC"
              onAdd={async () => {
                const created = await createNPC(campaignId)
                setRulerNpcId(created.id)
                await updateLocation(location.id, { rulerNpcId: created.id })
                navigate(`/campaign/${campaignId}/npcs?sel=${created.id}`)
              }}
            />
          ) : (
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
                  <Icon name="external" size={14} />
                </button>
              )}
            </div>
          )}
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
            <LocationMultiPicker
              allLocations={allLocations}
              selfId={location.id}
              value={allyIds}
              onChange={setAllyIds}
              onOpen={onSelect}
              onAddNew={async () => {
                const created = await createLocation(campaignId)
                const next = [...allyIds, created.id]
                setAllyIds(next)
                await updateLocation(location.id, { allyIds: next })
                navigate(`/campaign/${campaignId}/locations?sel=${created.id}`)
              }}
            />
          </div>
          <div className="field">
            <label>Enemies</label>
            <LocationMultiPicker
              allLocations={allLocations}
              selfId={location.id}
              value={enemyIds}
              onChange={setEnemyIds}
              onOpen={onSelect}
              onAddNew={async () => {
                const created = await createLocation(campaignId)
                const next = [...enemyIds, created.id]
                setEnemyIds(next)
                await updateLocation(location.id, { enemyIds: next })
                navigate(`/campaign/${campaignId}/locations?sel=${created.id}`)
              }}
            />
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
        revealNeedsConfirm={location.sharedWithPlayers === true}
        shareable
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
          revealNeedsConfirm={location.sharedWithPlayers === true}
          shareable
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
  onAddNew,
}: {
  allLocations: Location[]
  selfId: string
  value: string[]
  onChange: (ids: string[]) => void
  onOpen: (id: string) => void
  onAddNew: () => Promise<void>
}) {
  const options = allLocations.filter((l) => l.id !== selfId && !value.includes(l.id))
  const noOtherLocations = allLocations.filter((l) => l.id !== selfId).length === 0
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
                <Icon name="x" size={12} />
              </button>
            </span>
          )
        })}
      </div>
      {noOtherLocations ? (
        <AddLinkButton label="location" onAdd={onAddNew} />
      ) : (
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
      )}
    </div>
  )
}
