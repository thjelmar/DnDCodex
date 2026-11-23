import { useState } from 'react'
import { NumberField } from '../NumberField'
import type { SceneGroup } from '../../db/types'

/**
 * The panel for one monster group in the inspector's Foes list. Grouping is prep
 * only, so the panel says whether the group is in the turn order and has the one
 * button that changes that. The group rolls initiative once, and HP is one value
 * for every member unless the DM edits monsters one by one.
 */
export function GroupBox({
  group,
  members,
  inInitiative,
  onUngroup,
  onInit,
  onRoll,
  onToggleInitiative,
  onHp,
  onMemberHp,
}: {
  group: SceneGroup
  members: { id: string; label: string; hp: number | null }[]
  inInitiative: boolean
  onUngroup: () => void
  onInit: (v: number | null) => void
  onRoll: () => void
  onToggleInitiative: () => void
  onHp: (v: number | null) => void
  onMemberHp: (tokenId: string, v: number | null) => void
}) {
  const [perMonster, setPerMonster] = useState(false)
  return (
    <div className="bm-gbox" data-testid="bm-group" aria-label={`${group.name} group`}>
      <div className="bm-gbox-l1">
        <strong>
          {group.name} ×{members.length}
        </strong>
        <span className={`bm-tag${inInitiative ? ' on' : ''}`}>{inInitiative ? 'In initiative' : 'Prep only'}</span>
        <button type="button" className="bm-btn bm-mini" onClick={onUngroup}>
          Ungroup
        </button>
      </div>
      <div className="bm-gbox-l2">
        <span>Initiative</span>
        <NumberField value={group.init} onChange={onInit} min={-10} max={60} ariaLabel={`${group.name} initiative`} steppers={false} className="bm-gnum" />
        <button type="button" className="bm-btn bm-mini" onClick={onRoll} title="Roll d20 once for the whole group">
          Roll
        </button>
      </div>
      <div className="bm-gbox-l2">
        <button type="button" className={`bm-btn bm-mini${inInitiative ? '' : ' primary'}`} onClick={onToggleInitiative}>
          {inInitiative ? 'Remove from initiative' : 'Add to initiative'}
        </button>
      </div>
      <div className="bm-gbox-l2">
        <span>HP each</span>
        {perMonster ? (
          <span className="faint">varies</span>
        ) : (
          <NumberField value={group.hp} onChange={onHp} min={0} ariaLabel={`${group.name} HP each`} steppers={false} className="bm-gnum" placeholder="–" />
        )}
        <button type="button" className="bm-link bm-gbox-edit" onClick={() => setPerMonster((p) => !p)}>
          {perMonster ? 'Use one value' : 'Edit per monster'}
        </button>
      </div>
      {perMonster && (
        <div className="bm-gbox-each">
          {members.map((m) => (
            <div key={m.id}>
              <span>{m.label}</span>
              <NumberField value={m.hp} onChange={(v) => onMemberHp(m.id, v)} min={0} ariaLabel={`${m.label} HP`} steppers={false} className="bm-gnum" placeholder="–" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
