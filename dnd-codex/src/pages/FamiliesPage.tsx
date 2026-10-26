import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createFamily, updateFamily, deleteFamily } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { useConfirm } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import type { Family } from '../db/types'

/**
 * DM tool: name the families / houses / clans in the campaign. NPCs are assigned
 * to a family on their sheet, and the thought map clusters and colors a family's
 * members together.
 */
export function FamiliesPage() {
  const campaign = useCampaign()
  const families = useLiveQuery(
    () => db.families.where('campaignId').equals(campaign.id).sortBy('name'),
    [campaign.id],
  )

  return (
    <div>
      <div className="row between" style={{ alignItems: 'center', marginBottom: 6 }}>
        <h2 className="mb-0">Families</h2>
        <button className="btn small primary" onClick={() => createFamily(campaign.id)}>
          <Icon name="plus" size={13} color="inherit" /> New family
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Group NPCs into houses, clans, or crews. Assign an NPC to a family on its sheet; the Map tab
        then clusters and colors each family’s members together.
      </p>

      {families == null ? (
        <p className="faint">Loading…</p>
      ) : families.length === 0 ? (
        <div className="empty" style={{ marginTop: 20 }}>
          <div className="big">👪</div>
          <p className="faint">No families yet. Add one, then assign NPCs to it from their sheet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {families.map((f) => (
            <FamilyRow key={f.id} family={f} campaignId={campaign.id} />
          ))}
        </div>
      )}
    </div>
  )
}

function FamilyRow({ family, campaignId }: { family: Family; campaignId: string }) {
  const confirm = useConfirm()
  const [name, setName] = useState(family.name)
  const memberCount = useLiveQuery(
    () => db.npcs.where('campaignId').equals(campaignId).filter((n) => n.familyId === family.id).count(),
    [campaignId, family.id],
  )

  function commitName() {
    const next = name.trim()
    if (next && next !== family.name) updateFamily(family.id, { name: next })
    else setName(family.name)
  }
  async function remove() {
    const ok = await confirm({
      title: 'Delete this family?',
      message: `"${family.name}" will be removed. Its NPCs stay, but lose their family tag.`,
      confirmLabel: 'Delete',
    })
    if (ok) deleteFamily(family.id)
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <input
          type="color"
          value={family.color}
          onChange={(e) => updateFamily(family.id, { color: e.target.value })}
          title="Family color (used on the map)"
          aria-label="Family color"
          style={{ width: 28, height: 28, padding: 0, border: 'none', background: 'none', flexShrink: 0, cursor: 'pointer' }}
        />
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Family name"
          style={{ fontWeight: 600, flex: 1, minWidth: 0 }}
        />
        <span className="faint" style={{ fontSize: 12, flexShrink: 0 }}>
          {memberCount ?? 0} {memberCount === 1 ? 'member' : 'members'}
        </span>
        <button className="btn ghost small danger" onClick={remove} title="Delete family" aria-label="Delete family">
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  )
}
