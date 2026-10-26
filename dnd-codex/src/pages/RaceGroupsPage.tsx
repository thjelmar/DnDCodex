import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createRaceGroup, updateRaceGroup, deleteRaceGroup } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { useConfirm } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import type { RaceGroup } from '../db/types'

/**
 * DM tool: define the ancestries/species that populate this campaign, grouped
 * (e.g. "Elves" → High Elf, Wood Elf, Drow). The races feed the NPC race picker,
 * and a group can be pinned to the world map to mark where its people live.
 */
export function RaceGroupsPage() {
  const campaign = useCampaign()
  const groups = useLiveQuery(
    () => db.raceGroups.where('campaignId').equals(campaign.id).sortBy('name'),
    [campaign.id],
  )

  return (
    <div>
      <div className="row between" style={{ alignItems: 'center', marginBottom: 6 }}>
        <h2 className="mb-0">Race Groups</h2>
        <button className="btn small primary" onClick={() => createRaceGroup(campaign.id)}>
          <Icon name="plus" size={13} color="inherit" /> New group
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Group the ancestries in your world. These races become suggestions on every NPC’s Race
        field, and you can pin a group to the World Map to show where its people live.
      </p>

      {groups == null ? (
        <p className="faint">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="empty" style={{ marginTop: 20 }}>
          <div className="big">🧬</div>
          <p className="faint">No race groups yet. Add one to start building your world’s peoples.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          {groups.map((g) => (
            <RaceGroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  )
}

function RaceGroupCard({ group }: { group: RaceGroup }) {
  const confirm = useConfirm()
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description)
  const [raceDraft, setRaceDraft] = useState('')

  function commitName() {
    const next = name.trim()
    if (next && next !== group.name) updateRaceGroup(group.id, { name: next })
    else setName(group.name)
  }
  function commitDescription() {
    if (description !== group.description) updateRaceGroup(group.id, { description })
  }
  function addRaces(raw: string) {
    // Allow comma- or Enter-separated entry; de-dupe case-insensitively.
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return
    const have = new Set(group.races.map((r) => r.toLowerCase()))
    const next = [...group.races]
    for (const p of parts) if (!have.has(p.toLowerCase())) { next.push(p); have.add(p.toLowerCase()) }
    if (next.length !== group.races.length) updateRaceGroup(group.id, { races: next })
    setRaceDraft('')
  }
  function removeRace(race: string) {
    updateRaceGroup(group.id, { races: group.races.filter((r) => r !== race) })
  }
  async function remove() {
    const ok = await confirm({
      title: 'Delete this race group?',
      message: `"${group.name}" and its race list will be removed. NPCs keep whatever race they were given.`,
      confirmLabel: 'Delete',
    })
    if (ok) deleteRaceGroup(group.id)
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <input
          type="color"
          value={group.color}
          onChange={(e) => updateRaceGroup(group.id, { color: e.target.value })}
          title="Group color (used on the map)"
          aria-label="Group color"
          style={{ width: 28, height: 28, padding: 0, border: 'none', background: 'none', flexShrink: 0, cursor: 'pointer' }}
        />
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Group name"
          style={{ fontWeight: 600, flex: 1, minWidth: 0 }}
        />
        <button className="btn ghost small danger" onClick={remove} title="Delete group" aria-label="Delete group">
          <Icon name="trash" size={14} />
        </button>
      </div>

      <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
        <label style={{ fontSize: 12 }}>Races in this group</label>
        <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
          {group.races.map((race) => (
            <span key={race} className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {race}
              <button
                className="linklike"
                onClick={() => removeRace(race)}
                aria-label={`Remove ${race}`}
                style={{ display: 'inline-flex', color: 'var(--text-faint)' }}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          ))}
          <input
            className="input"
            value={raceDraft}
            onChange={(e) => setRaceDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addRaces(raceDraft)
              }
            }}
            onBlur={() => addRaces(raceDraft)}
            placeholder={group.races.length ? 'Add a race…' : 'e.g. High Elf, Wood Elf, Drow'}
            style={{ flex: '1 1 140px', minWidth: 120 }}
          />
        </div>
      </div>

      <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
        <label style={{ fontSize: 12 }}>Notes (optional)</label>
        <input
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
          placeholder="How this people fits your world…"
        />
      </div>
    </div>
  )
}
