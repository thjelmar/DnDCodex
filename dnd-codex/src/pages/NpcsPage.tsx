import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createNPC, updateNPC, deleteNPC, createLocation, createNpcFromTemplate, saveNpcAsTemplate } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { EntityLinks } from '../components/EntityLinks'
import { Backlinks } from '../components/Backlinks'
import { RichTextEditor } from '../components/RichTextEditor'
import { TagInput } from '../components/TagInput'
import { useConfirm } from '../components/ConfirmDialog'
import { AddLinkButton } from '../components/AddLinkButton'
import { StatBlockEditor } from '../components/StatBlockEditor'
import { EntityImage } from '../components/EntityImage'
import { ShareControl } from '../components/ShareControl'
import { MasterDetail } from '../components/MasterDetail'
import { Icon } from '../components/Icon'
import { NewFromTemplateControl } from '../components/NewFromTemplateControl'
import { SaveAsTemplateModal } from '../components/SaveAsTemplateModal'
import { BUILTIN_NPC_TEMPLATES } from '../data/builtinTemplates'
import { randomPersonName } from '../lib/nameGen'
import { useGenOverrides } from '../lib/useGenOverrides'
import type { NPC, StatBlock } from '../db/types'

const DISPOSITIONS: NPC['disposition'][] = ['friendly', 'neutral', 'hostile', 'unknown']
const DISPOSITION_COLOR: Record<NPC['disposition'], string> = {
  friendly: 'var(--good)',
  neutral: 'var(--text-dim)',
  hostile: 'var(--danger)',
  unknown: 'var(--text-faint)',
}

export function NpcsPage() {
  const campaign = useCampaign()
  const npcs = useLiveQuery(
    () => db.npcs.where('campaignId').equals(campaign.id).sortBy('name'),
    [campaign.id],
  )
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
  const selected = npcs?.find((n) => n.id === selectedId) ?? null

  async function add() {
    const n = await createNPC(campaign.id)
    setSelectedId(n.id)
  }

  async function fromTemplate(data: Record<string, unknown>) {
    const n = await createNpcFromTemplate(campaign.id, data)
    setSelectedId(n.id)
  }

  return (
    <MasterDetail
      selected={!!selected}
      onBack={() => setSelectedId(null)}
      backLabel="All NPCs"
      list={
        <>
          <NewFromTemplateControl
            kind="npc"
            builtins={BUILTIN_NPC_TEMPLATES}
            blankLabel="New NPC"
            onBlank={add}
            onFromTemplate={fromTemplate}
            emptyHint="None yet — open an NPC and “Save as template”."
          />
          {npcs?.length === 0 && <p className="faint">No NPCs yet.</p>}
          {npcs?.map((n) => (
            <div
              key={n.id}
              className="list-row"
              style={{ cursor: 'pointer', borderColor: n.id === selectedId ? 'var(--accent)' : undefined }}
              onClick={() => setSelectedId(n.id)}
            >
              <div>
                <div className="title">{n.name}</div>
                <div className="sub">{n.role || '—'}</div>
              </div>
              <span style={{ color: DISPOSITION_COLOR[n.disposition] }} title={n.disposition}>
                ●
              </span>
            </div>
          ))}
        </>
      }
      detail={
        selected ? (
          <NpcEditor
            key={selected.id}
            npc={selected}
            campaignId={campaign.id}
            locations={locations ?? []}
            onDelete={() => setSelectedId(null)}
          />
        ) : (
          <div className="empty">
            <div className="big">🧑</div>
            <p>Select an NPC or create one.</p>
          </div>
        )
      }
    />
  )
}

function NpcEditor({
  npc,
  campaignId,
  locations,
  onDelete,
}: {
  npc: NPC
  campaignId: string
  locations: { id: string; name: string }[]
  onDelete: () => void
}) {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [name, setName] = useState(npc.name)
  const [role, setRole] = useState(npc.role)
  const [race, setRace] = useState(npc.race ?? '')
  const [imageId, setImageId] = useState<string | null>(npc.imageId ?? null)
  const [disposition, setDisposition] = useState(npc.disposition)
  const [locationId, setLocationId] = useState(npc.locationId ?? '')
  const [description, setDescription] = useState(npc.description)
  const [statBlockData, setStatBlockData] = useState<StatBlock | null>(npc.statBlockData ?? null)
  const [statBlock, setStatBlock] = useState(npc.statBlock)
  const [tags, setTags] = useState(npc.tags)
  // Global name tables override the built-in default pool (ancestry-specific
  // races keep their built-in flavor).
  const ov = useGenOverrides()
  // Race suggestions: every race across this campaign's race groups (T-38). The
  // field stays free-text (a datalist offers the groups' races but any value is
  // allowed), so existing free-text races keep working with no migration.
  const raceOptions =
    useLiveQuery(async () => {
      const groups = await db.raceGroups.where('campaignId').equals(campaignId).toArray()
      const set = new Set<string>()
      for (const g of groups) for (const r of g.races) set.add(r)
      return [...set].sort((a, b) => a.localeCompare(b))
    }, [campaignId]) ?? []

  useEffect(() => {
    const t = setTimeout(() => {
      updateNPC(npc.id, {
        name,
        role,
        race,
        imageId,
        disposition,
        locationId: locationId || null,
        description,
        statBlockData,
        statBlock,
        tags,
      })
    }, 500)
    return () => clearTimeout(t)
  }, [name, role, race, imageId, disposition, locationId, description, statBlockData, statBlock, tags, npc.id])

  return (
    <div>
      <div className="share-bar" style={{ gap: 8 }}>
        <button
          className="btn ghost small"
          onClick={() => setSavingTemplate(true)}
          title="Save this NPC's fields as a reusable template"
        >
          <Icon name="plus" size={12} /> Save as template
        </button>
        <ShareControl campaignId={campaignId} kind="npc" entity={npc} />
      </div>
      {savingTemplate && (
        <SaveAsTemplateModal
          defaultLabel={npc.name}
          placeholder="e.g. Town guard"
          description="Saves this NPC's role, race, description, disposition, stat block, and tags (not its name, portrait, or home location) as a reusable starting point. It syncs to your account and shows up under “New NPC → template”."
          onSave={(label) => saveNpcAsTemplate(npc, label).then(() => {})}
          onClose={() => setSavingTemplate(false)}
        />
      )}
      <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <EntityImage campaignId={campaignId} imageId={imageId} onChange={setImageId} label="portrait" />
        <div style={{ flex: 1, minWidth: 0 }}>
      <div className="form-row">
        <div className="field">
          <label>Name</label>
          <div className="row" style={{ gap: 6 }}>
            <input className="input" style={{ flex: 1, minWidth: 0 }} value={name} onChange={(e) => setName(e.target.value)} />
            <button
              type="button"
              className="btn small"
              onClick={() => setName(randomPersonName(race, ov))}
              title={race.trim() ? `Roll a random ${race.trim()} name` : 'Roll a random name'}
              aria-label="Generate a random name"
            >
              <Icon name="dice" size={14} />
            </button>
          </div>
        </div>
        <div className="field">
          <label>Role</label>
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Innkeeper, Villain…" />
        </div>
        <div className="field">
          <label>Race</label>
          <input
            className="input"
            value={race}
            onChange={(e) => setRace(e.target.value)}
            placeholder="Human, Elf, Dragon…"
            list="npc-race-options"
          />
          {raceOptions.length > 0 && (
            <datalist id="npc-race-options">
              {raceOptions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          )}
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label>Disposition</label>
          <select className="select" value={disposition} onChange={(e) => setDisposition(e.target.value as NPC['disposition'])}>
            {DISPOSITIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Usually found at</label>
          {locations.length === 0 ? (
            <AddLinkButton
              label="location"
              onAdd={async () => {
                const loc = await createLocation(campaignId)
                setLocationId(loc.id)
                await updateNPC(npc.id, { locationId: loc.id })
                navigate(`/campaign/${campaignId}/locations?sel=${loc.id}`)
              }}
            />
          ) : (
            <select className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">—</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
        </div>
      </div>
      <div className="field">
        <label>Tags</label>
        <TagInput campaignId={campaignId} tags={tags} onChange={setTags} />
      </div>
      <RichTextEditor
        campaignId={campaignId}
        value={description}
        onChange={setDescription}
        label="Description"
        placeholder="Appearance, personality, secrets, [[wiki links]]…"
        revealNeedsConfirm={npc.sharedWithPlayers === true}
        shareable
      />
      <div className="field">
        <label>Stat block</label>
        <StatBlockEditor name={name} value={statBlockData} onChange={setStatBlockData} revealNeedsConfirm={npc.sharedWithPlayers === true} />
      </div>
      <RichTextEditor
        campaignId={campaignId}
        value={statBlock}
        onChange={setStatBlock}
        label="Additional notes"
        placeholder="Tactics, secrets, lair actions, mechanical reminders… (use the lock button to mark spoilers)"
        revealNeedsConfirm={npc.sharedWithPlayers === true}
        shareable
      />

      <label className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
        Connections
      </label>
      <div style={{ marginTop: 8, marginBottom: 18 }}>
        <EntityLinks campaignId={campaignId} kind="npc" id={npc.id} />
      </div>

      <label className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
        Linked from
      </label>
      <div style={{ marginTop: 8, marginBottom: 18 }}>
        <Backlinks campaignId={campaignId} kind="npc" id={npc.id} name={name} />
      </div>

      <div className="row between">
        <span className="faint" style={{ fontSize: 12 }}>Autosaves as you type.</span>
        <button
          className="btn danger small"
          onClick={async () => {
            if (
              await confirm({
                title: 'Delete NPC?',
                message: (
                  <>
                    Delete <strong>{npc.name}</strong>? This can't be undone.
                  </>
                ),
                confirmLabel: 'Delete',
                danger: true,
              })
            ) {
              await deleteNPC(npc.id)
              onDelete()
            }
          }}
        >
          Delete NPC
        </button>
      </div>
    </div>
  )
}
