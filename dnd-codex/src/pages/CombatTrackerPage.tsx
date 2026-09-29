import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Icon } from '../components/Icon'
import { useConfirm } from '../components/ConfirmDialog'
import { useCombat, CombatantRow, AddCustom, combatantFromNpc } from '../components/CombatRoster'
import { abilityMod } from '../lib/statblock'
import { emptyCombat, makeCombatant, parseLeadingInt, type Combatant } from '../lib/combat'
import type { Encounter, Id, NPC } from '../db/types'

/**
 * At-the-table combat/initiative tracker (Tools menu). Combatants come from a
 * saved encounter (its "Run" button), the current campaign's NPCs, or a custom
 * quick-add. Tracks initiative order, round/turn, HP, and conditions. The active
 * combat lives in localStorage so a refresh mid-fight doesn't lose it.
 */
export function CombatTrackerPage() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    state, setState, activeId, patch, adjustHp, addCombatants, removeCombatant, rollAll, sortNow, start, step, end,
  } = useCombat()

  const dmCampaigns = useLiveQuery(
    () => db.campaigns.orderBy('updatedAt').reverse().filter((c) => !c.archived && c.role !== 'player').toArray(),
    [],
  )
  // Default the NPC-picker campaign to the most recent DM campaign.
  useEffect(() => {
    if (!state.campaignId && dmCampaigns && dmCampaigns.length > 0) {
      setState((s) => (s.campaignId ? s : { ...s, campaignId: dmCampaigns[0].id }))
    }
  }, [dmCampaigns, state.campaignId, setState])

  // "Run" an encounter: EncountersPage navigates here with its id in router
  // state. Consume it once, then clear it so a refresh doesn't re-import.
  const consumedRun = useRef(false)
  useEffect(() => {
    const runId = (location.state as { runEncounterId?: string } | null)?.runEncounterId
    if (!runId || consumedRun.current) return
    consumedRun.current = true
    ;(async () => {
      const enc = await db.encounters.get(runId)
      navigate(location.pathname, { replace: true, state: null })
      if (!enc) return
      const rows = combatantsFromEncounter(enc)
      if (state.combatants.length > 0) {
        const ok = await confirm({
          title: 'Replace current combat?',
          message: `Running “${enc.name}” will clear the ${state.combatants.length} combatant(s) currently tracked.`,
          confirmLabel: 'Replace',
          danger: true,
        })
        if (!ok) return
      }
      setState({ ...emptyCombat(), name: enc.name, campaignId: enc.campaignId, combatants: rows })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const { combatants } = state

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">
            <Icon name="swords" size={22} /> Combat Tracker
          </h1>
          <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>
            Run initiative at the table — track turns, HP, and conditions. Stored on this device.
          </div>
        </div>
        <Link to="/tools/encounters" className="btn ghost small">← Encounter Builder</Link>
      </div>

      {/* Control bar */}
      <div className="combat-bar">
        <input
          className="input"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          style={{ fontWeight: 600, maxWidth: 220 }}
          aria-label="Combat name"
        />
        {state.active ? (
          <>
            <div className="combat-round">
              <span className="faint" style={{ fontSize: 11 }}>Round</span>
              <strong style={{ fontSize: 20 }}>{state.round}</strong>
            </div>
            <button className="btn ghost small" onClick={() => step(-1)} title="Previous turn">
              <Icon name="chevron-left" size={16} />
            </button>
            <button className="btn primary" onClick={() => step(1)} title="Next turn">
              Next <Icon name="chevron-right" size={16} color="inherit" />
            </button>
          </>
        ) : (
          <button className="btn primary" onClick={start} disabled={combatants.length === 0}>
            Start combat
          </button>
        )}
        <div className="combat-bar-spacer" />
        <button className="btn ghost small" onClick={rollAll} disabled={combatants.length === 0} title="Roll initiative for everyone">
          <Icon name="dice" size={15} /> Roll initiative
        </button>
        <button className="btn ghost small" onClick={sortNow} disabled={combatants.length === 0} title="Re-sort by initiative">
          Sort
        </button>
        {(combatants.length > 0 || state.active) && (
          <button className="btn ghost small danger" onClick={end}>End combat</button>
        )}
      </div>

      {/* Roster */}
      {combatants.length === 0 ? (
        <p className="faint" style={{ marginTop: 24 }}>
          No combatants yet. Add them below, or open the Encounter Builder and press <strong>Run</strong> on a saved encounter.
        </p>
      ) : (
        <div className="combat-list">
          {combatants.map((c, i) => (
            <CombatantRow
              key={c.id}
              c={c}
              index={i}
              active={c.id === activeId}
              onPatch={(p) => patch(c.id, p)}
              onDamage={(n) => adjustHp(c.id, -n)}
              onHeal={(n) => adjustHp(c.id, n)}
              onRemove={() => removeCombatant(c.id)}
            />
          ))}
        </div>
      )}

      {/* Add combatants */}
      <div className="combat-add">
        <AddCustom onAdd={(row) => addCombatants([row])} />
        <NpcPicker
          campaignId={state.campaignId}
          campaigns={dmCampaigns ?? []}
          onCampaign={(id) => setState((s) => ({ ...s, campaignId: id }))}
          onAdd={(row) => addCombatants([row])}
        />
      </div>
    </div>
  )
}

/** Expand a saved encounter's lines into individual tracker rows (Goblin 1/2/3),
 *  sharing a group key per line so a group rolls one initiative. */
function combatantsFromEncounter(enc: Encounter): Combatant[] {
  const out: Combatant[] = []
  for (const line of enc.combatants) {
    const dexMod = line.dex != null ? abilityMod(line.dex) : 0
    for (let i = 0; i < line.count; i++) {
      out.push(
        makeCombatant({
          name: line.count > 1 ? `${line.name} ${i + 1}` : line.name,
          dexMod,
          hp: line.hp,
          ac: line.ac,
          groupKey: line.id,
        }),
      )
    }
  }
  return out
}

function NpcPicker({
  campaignId,
  campaigns,
  onCampaign,
  onAdd,
}: {
  campaignId: Id | null
  campaigns: { id: string; name: string }[]
  onCampaign: (id: string) => void
  onAdd: (row: Combatant) => void
}) {
  const npcs = useLiveQuery(
    () => (campaignId ? db.npcs.where('campaignId').equals(campaignId).sortBy('name') : Promise.resolve([] as NPC[])),
    [campaignId],
  )

  return (
    <div className="card" style={{ cursor: 'default' }}>
      <div className="row between" style={{ marginBottom: 10, gap: 8, alignItems: 'center' }}>
        <div className="sidebar-heading" style={{ margin: 0 }}>Add from NPCs</div>
        {campaigns.length > 0 && (
          <select className="select" value={campaignId ?? ''} onChange={(e) => onCampaign(e.target.value)} style={{ width: 160, padding: '4px 8px' }}>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      {(npcs?.length ?? 0) === 0 ? (
        <p className="faint" style={{ margin: '2px 0', fontSize: 13 }}>No NPCs in this campaign.</p>
      ) : (
        <div className="combat-npc-list">
          {npcs!.map((npc) => (
            <div key={npc.id} className="row between" style={{ gap: 8, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{npc.name}</div>
                <div className="faint" style={{ fontSize: 11 }}>
                  {npc.statBlockData ? `HP ${parseLeadingInt(npc.statBlockData.hp) ?? '—'} · AC ${parseLeadingInt(npc.statBlockData.ac) ?? '—'}` : 'No stat block'}
                </div>
              </div>
              <button className="btn small" onClick={() => onAdd(combatantFromNpc(npc))}>Add</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
