import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { supabase } from '../lib/supabase'
import { isDemo } from '../lib/demo'
import { useAuth } from '../auth/AuthProvider'
import { getCampaignMembers } from '../auth/cloud'
import { pushLiveCombat, stopLiveCombat, useLiveCombat } from '../auth/liveCombat'
import { useLiveSession } from '../lib/useLiveSession'
import { useCombatState } from '../components/CombatRoster'
import { setCombatMembers, setRevealContext } from '../lib/revealContext'
import { makeCombatant, removeCombatants, resortKeepTurn, setCombat, getCombat, type Combatant } from '../lib/combat'
import { publicCombat, type PublicCombatRow, type TokenFacts } from '../lib/liveCombat'
import { useIsKeeperLeader } from './LiveSceneKeeper'
import type { Campaign } from '../db/types'

// The DM half of the players' initiative order (T-100). Mount once in a DM campaign
// (campaign layout). It always sets the reveal-warning context (DM only), and while
// the DM has a live session it mirrors a privacy-filtered copy of the combat to
// `shared_combat` / `shared_combatants` and adopts what players do there: a player
// who joins, edits their initiative, or leaves. The demo never reaches Supabase.

interface Notice {
  id: number
  text: string
  undo?: () => void
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function LiveCombatKeeper({ campaign }: { campaign: Campaign }) {
  const { user, session } = useAuth()
  const token = session?.access_token ?? null
  const isDm = campaign.role === 'dm'
  const available = isDm && !!supabase && !!user && !isDemo()
  const real = !!useLiveSession(available ? campaign.id : null)
  // The demo counts as live so the DM can try the warning dialog; it uploads nothing.
  const sessionLive = isDemo() ? true : real
  const scenes = useLiveQuery(() => db.scenes.where('campaignId').equals(campaign.id).toArray(), [campaign.id])

  const { facts, groupNames } = useMemo(() => {
    const facts = new Map<string, TokenFacts>()
    const groupNames = new Map<string, string>()
    for (const sc of scenes ?? []) {
      for (const t of sc.tokens) {
        if (t.combatantId)
          facts.set(t.combatantId, { hidden: !!t.hidden, controlledBy: t.controlledBy ?? null, friendly: !!t.friendly })
      }
      for (const g of sc.groups ?? []) groupNames.set(g.id, g.name)
    }
    return { facts, groupNames }
  }, [scenes])

  useEffect(() => {
    if (!isDm) return
    setRevealContext({ campaignId: campaign.id, isDm: true, sessionLive, facts })
    return () => setRevealContext(null)
  }, [isDm, campaign.id, sessionLive, facts])

  // The campaign's members, for "Controlled by" and the add form's Player picker.
  useEffect(() => {
    if (!available || !token) return
    let cancelled = false
    getCampaignMembers(campaign.id).then((m) => {
      if (!cancelled) setCombatMembers(m.filter((x) => x.userId !== user?.id).map((x) => ({ userId: x.userId, name: x.displayName })))
    })
    return () => {
      cancelled = true
      setCombatMembers([])
    }
  }, [available, campaign.id, user?.id, token])

  const leader = useIsKeeperLeader(available ? campaign.id : null, 'codex.combatPush.')
  return available && leader ? (
    <CombatPusher campaign={campaign} sessionLive={sessionLive} facts={facts} groupNames={groupNames} />
  ) : null
}

function CombatPusher({
  campaign,
  sessionLive,
  facts,
  groupNames,
}: {
  campaign: Campaign
  sessionLive: boolean
  facts: Map<string, TokenFacts>
  groupNames: Map<string, string>
}) {
  const state = useCombatState()
  const live = useLiveCombat(campaign.id)
  const pushedRows = useRef(new Map<string, PublicCombatRow>())
  const pushedHead = useRef<string | null>(null)
  const selfDeleted = useRef(new Set<string>())
  const seen = useRef(new Set<string>())
  const queue = useRef<Promise<void>>(Promise.resolve())
  const [notices, setNotices] = useState<Notice[]>([])
  const nextId = useRef(1)

  const notify = (text: string, undo?: () => void) => {
    const id = nextId.current++
    setNotices((n) => [...n, { id, text, undo }])
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 12000)
  }
  const enqueue = (fn: () => Promise<void>) => {
    queue.current = queue.current.then(fn).catch((e) => notify(e instanceof Error ? e.message : 'Could not update the players’ initiative.'))
  }
  const dropRow = (id: string) => {
    selfDeleted.current.add(id)
    pushedRows.current.delete(id)
    enqueue(async () => {
      if (!supabase) return
      await supabase.from('shared_combatants').delete().eq('id', id)
    })
  }

  // Mirror the combat (debounced), once the first read of the cloud copy is in.
  const markers = campaign.combatMarkers ?? {}
  const markerKey = JSON.stringify(markers)
  useEffect(() => {
    if (!live.loaded) return
    const t = setTimeout(() => {
      const pc = sessionLive ? publicCombat(state, facts, JSON.parse(markerKey), groupNames) : null
      if (!pc) {
        if (pushedHead.current !== null || live.combat) {
          pushedHead.current = null
          pushedRows.current.clear()
          enqueue(() => stopLiveCombat(campaign.id))
        }
        return
      }
      const head = JSON.stringify({ phase: pc.phase, round: pc.round, activeIds: pc.activeIds })
      const changed = pc.rows.filter((r) => !same(pushedRows.current.get(r.id), r))
      const gone = [...pushedRows.current.keys()].filter((id) => !pc.rows.some((r) => r.id === id))
      if (head === pushedHead.current && changed.length === 0 && gone.length === 0) return
      pushedHead.current = head
      for (const r of changed) pushedRows.current.set(r.id, r)
      for (const id of gone) {
        pushedRows.current.delete(id)
        selfDeleted.current.add(id)
      }
      enqueue(async () => {
        try {
          await pushLiveCombat(campaign.id, pc, changed, gone)
        } catch (e) {
          pushedHead.current = null
          for (const r of changed) pushedRows.current.delete(r.id)
          throw e
        }
      })
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.loaded, state, facts, groupNames, markerKey, sessionLive, campaign.id])

  // Adopt what players do: joins, initiative edits, and leaves.
  const rows = live.combat?.rows
  useEffect(() => {
    if (!live.loaded) return
    const list = rows ?? []
    const local = getCombat().combatants
    for (const r of list) {
      const lc = local.find((c) => c.id === r.id)
      if (!lc && r.source === 'player') {
        const twin = local.find((c) => c.isPC && !c.controlledBy && c.name.trim().toLowerCase() === r.name.trim().toLowerCase())
        if (twin) {
          // The DM added this PC first: link it to the player and drop the player's duplicate row.
          setCombat((s) => ({
            ...s,
            combatants: s.combatants.map((c) =>
              c.id === twin.id ? { ...c, controlledBy: r.controlledBy, initiative: r.initiative ?? c.initiative } : c,
            ),
          }))
          dropRow(r.id)
          continue
        }
        const c: Combatant = { ...makeCombatant({ name: r.name, isPC: true, initiative: r.initiative, hp: r.hp, controlledBy: r.controlledBy }), id: r.id }
        if (r.maxHp != null) c.maxHp = r.maxHp
        setCombat((s) => resortKeepTurn({ ...s, combatants: [...s.combatants, c] }))
        pushedRows.current.set(r.id, r)
        notify(`${r.name} joined initiative (${r.initiative ?? '–'}).`, () => {
          setCombat((s) => removeCombatants(s, new Set([r.id])))
          dropRow(r.id)
        })
      } else if (lc) {
        const prev = pushedRows.current.get(r.id)
        if (!prev) pushedRows.current.set(r.id, r)
        else if (r.controlledBy && prev.initiative !== r.initiative && lc.initiative === prev.initiative) {
          pushedRows.current.set(r.id, { ...prev, initiative: r.initiative })
          setCombat((s) =>
            resortKeepTurn({ ...s, combatants: s.combatants.map((c) => (c.id === r.id ? { ...c, initiative: r.initiative } : c)) }),
          )
          notify(`${r.name}: initiative ${prev.initiative ?? '–'} → ${r.initiative ?? '–'}.`)
        }
      }
    }
    if (live.combat) {
      for (const id of seen.current) {
        if (list.some((r) => r.id === id) || selfDeleted.current.has(id)) continue
        const lc = local.find((c) => c.id === id)
        if (lc?.controlledBy) {
          // The player removed a character they control.
          setCombat((s) => removeCombatants(s, new Set([id])))
          pushedRows.current.delete(id)
          notify(`${lc.name} left initiative.`, () => setCombat((s) => resortKeepTurn({ ...s, combatants: [...s.combatants, lc] })))
        }
      }
    }
    seen.current = new Set(list.map((r) => r.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.loaded, rows])

  if (notices.length === 0) return null
  return (
    <div className="combat-notices" role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className="combat-notice">
          <span>{n.text}</span>
          {n.undo && (
            <button className="btn small" onClick={() => { n.undo?.(); setNotices((l) => l.filter((x) => x.id !== n.id)) }}>
              {n.text.includes('joined') ? 'Remove' : 'Undo'}
            </button>
          )}
          <button className="btn ghost small" aria-label="Dismiss" onClick={() => setNotices((l) => l.filter((x) => x.id !== n.id))}>×</button>
        </div>
      ))}
    </div>
  )
}
