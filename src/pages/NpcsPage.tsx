import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createNPC, updateNPC, deleteNPC, createLocation } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { EntityLinks } from '../components/EntityLinks'
import { RichTextEditor } from '../components/RichTextEditor'
import { TagInput } from '../components/TagInput'
import { useConfirm } from '../components/ConfirmDialog'
import { AddLinkButton } from '../components/AddLinkButton'
import { StatBlockEditor } from '../components/StatBlockEditor'
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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <button className="btn primary" style={{ width: '100%', marginBottom: 12 }} onClick={add}>
          ＋ New NPC
        </button>
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
      </div>

      <div>
        {selected ? (
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
        )}
      </div>
    </div>
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
  const [name, setName] = useState(npc.name)
  const [role, setRole] = useState(npc.role)
  const [race, setRace] = useState(npc.race ?? '')
  const [disposition, setDisposition] = useState(npc.disposition)
  const [locationId, setLocationId] = useState(npc.locationId ?? '')
  const [description, setDescription] = useState(npc.description)
  const [statBlockData, setStatBlockData] = useState<StatBlock | null>(npc.statBlockData ?? null)
  const [statBlock, setStatBlock] = useState(npc.statBlock)
  const [tags, setTags] = useState(npc.tags)

  useEffect(() => {
    const t = setTimeout(() => {
      updateNPC(npc.id, {
        name,
        role,
        race,
        disposition,
        locationId: locationId || null,
        description,
        statBlockData,
        statBlock,
        tags,
      })
    }, 500)
    return () => clearTimeout(t)
  }, [name, role, race, disposition, locationId, description, statBlockData, statBlock, tags, npc.id])

  return (
    <div>
      <div className="form-row">
        <div className="field">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Role</label>
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Innkeeper, Villain…" />
        </div>
        <div className="field">
          <label>Race</label>
          <input className="input" value={race} onChange={(e) => setRace(e.target.value)} placeholder="Human, Elf, Dragon…" />
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
      />
      <div className="field">
        <label>Stat block</label>
        <StatBlockEditor name={name} value={statBlockData} onChange={setStatBlockData} />
      </div>
      <div className="field">
        <label>Additional notes</label>
        <textarea className="textarea" value={statBlock} onChange={(e) => setStatBlock(e.target.value)} placeholder="Tactics, secrets, lair actions, mechanical reminders…" />
      </div>

      <label className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
        Connections
      </label>
      <div style={{ marginTop: 8, marginBottom: 18 }}>
        <EntityLinks campaignId={campaignId} kind="npc" id={npc.id} />
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
