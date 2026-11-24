import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isDemo } from '../lib/demo'
import { demoPlayer, isDemoCloud, useDemoLive } from '../lib/demoLive'
import { useAuth } from './AuthProvider'
import type { CombatKind, HealthMarker, PublicCombat, PublicCombatRow } from '../lib/liveCombat'

// The players' copy of the combat (migration 0045). The DM mirrors a privacy-filtered
// order to `shared_combat` + `shared_combatants`; members read it over Realtime. A
// player writes only their own characters, through join_combat, set_combat_initiative
// and leave_combat. The demo never reaches Supabase.

type Row = Record<string, unknown>

/** A row as a player's strip shows it. */
export interface LiveCombatRow extends PublicCombatRow {
  /** 'player' when a player created it (the DM adopts these into the local combat). */
  source: 'dm' | 'player'
  /** Set when the controlling player pressed End turn (migration 0048); the DM's client clears it. */
  endTurnRequestedAt: string | null
}

export interface LiveCombat {
  campaignId: string
  phase: 'gathering' | 'active'
  round: number
  activeIds: string[]
  rows: LiveCombatRow[]
}

function rowFrom(r: Row): LiveCombatRow {
  return {
    id: r.id as string,
    controlledBy: (r.controlled_by as string) ?? null,
    source: (r.source as string) === 'player' ? 'player' : 'dm',
    endTurnRequestedAt: (r.end_turn_requested_at as string) ?? null,
    name: (r.name as string) ?? '',
    kind: ((r.kind as string) ?? 'enemy') as CombatKind,
    initiative: r.initiative == null ? null : Number(r.initiative),
    sortOrder: Number(r.sort_order) || 0,
    hp: r.hp == null ? null : Number(r.hp),
    maxHp: r.max_hp == null ? null : Number(r.max_hp),
    healthMarker: ((r.health_marker as string) ?? null) as HealthMarker | null,
    conditions: Array.isArray(r.conditions) ? (r.conditions as string[]) : [],
    groupCount: r.group_count == null ? null : Number(r.group_count),
  }
}

/** Initiative order: the DM's order when it is sent, else highest initiative first. */
export function orderRows(rows: LiveCombatRow[]): LiveCombatRow[] {
  return [...rows].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      (b.initiative ?? Number.NEGATIVE_INFINITY) - (a.initiative ?? Number.NEGATIVE_INFINITY) ||
      a.name.localeCompare(b.name),
  )
}

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getLiveCombat(campaignId: string): Promise<LiveCombat | null> {
  if (!supabase || isDemo()) return null
  const head = await supabase.from('shared_combat').select('*').eq('campaign_id', campaignId).maybeSingle()
  if (head.error || !head.data) return null
  const rows = await supabase.from('shared_combatants').select('*').eq('campaign_id', campaignId)
  if (rows.error) return null
  return {
    campaignId,
    phase: head.data.phase === 'active' ? 'active' : 'gathering',
    round: Number(head.data.round) || 1,
    activeIds: Array.isArray(head.data.active_ids) ? (head.data.active_ids as string[]) : [],
    rows: ((rows.data ?? []) as Row[]).map(rowFrom),
  }
}

// ── DM writes ──────────────────────────────────────────────────────────────

/** Upsert the header, the changed rows, and delete the rows that are gone. */
export async function pushLiveCombat(
  campaignId: string,
  pc: PublicCombat,
  changed: PublicCombatRow[],
  goneIds: string[],
): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const head = await supabase.from('shared_combat').upsert(
    {
      campaign_id: campaignId,
      phase: pc.phase,
      round: pc.round,
      active_ids: pc.activeIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'campaign_id' },
  )
  check(head.error)
  if (changed.length) {
    const res = await supabase.from('shared_combatants').upsert(
      changed.map((r) => ({
        id: r.id,
        campaign_id: campaignId,
        controlled_by: r.controlledBy,
        // Rows the DM uploads are the DM's; a player's own rows keep their source (see below).
        name: r.name,
        kind: r.kind,
        initiative: r.initiative,
        sort_order: r.sortOrder,
        hp: r.hp,
        max_hp: r.maxHp,
        health_marker: r.healthMarker,
        conditions: r.conditions,
        group_count: r.groupCount,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'id' },
    )
    check(res.error)
  }
  if (goneIds.length) {
    const res = await supabase.from('shared_combatants').delete().in('id', goneIds)
    check(res.error)
  }
}

/** Stop sharing combat: deleting the header cascades every row. */
export async function stopLiveCombat(campaignId: string): Promise<void> {
  if (!supabase) return
  const res = await supabase.from('shared_combat').delete().eq('campaign_id', campaignId)
  check(res.error)
}

// ── Player writes ──────────────────────────────────────────────────────────

export async function joinCombat(
  campaignId: string,
  name: string,
  initiative: number,
  hp: number | null,
  maxHp: number | null,
  charKey: string,
): Promise<string> {
  if (isDemoCloud(campaignId)) return demoPlayer.join(name, initiative, hp, maxHp, charKey)
  if (!supabase) throw new Error('Not signed in.')
  const { data, error } = await supabase.rpc('join_combat', {
    cid: campaignId,
    pname: name,
    init: initiative,
    hp_now: hp,
    hp_max: maxHp,
    ckey: charKey,
  })
  check(error)
  return data as string
}

export async function setMyInitiative(campaignId: string, rowId: string, initiative: number): Promise<void> {
  if (isDemoCloud(campaignId)) return demoPlayer.setInitiative(rowId, initiative)
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.rpc('set_combat_initiative', { cid: campaignId, rid: rowId, init: initiative })
  check(error)
}

/** Ask the DM's client to end this character's turn (it must be that character's turn). */
export async function endMyTurn(campaignId: string, rowId: string): Promise<void> {
  if (isDemoCloud(campaignId)) return demoPlayer.endTurn(rowId)
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.rpc('end_my_turn', { cid: campaignId, rid: rowId })
  check(error)
}

export async function leaveCombat(campaignId: string, rowId: string): Promise<void> {
  if (isDemoCloud(campaignId)) return demoPlayer.leave(rowId)
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.rpc('leave_combat', { cid: campaignId, rid: rowId })
  check(error)
}

// ── Live hook ──────────────────────────────────────────────────────────────

/**
 * The campaign's shared combat, live (players and the DM). Waits for the auth
 * token before joining the channel, uses a unique channel name, and refetches on
 * SUBSCRIBED, like `useLiveScene`.
 */
export function useLiveCombat(cloudCampaignId: string | null | undefined) {
  const { session } = useAuth()
  const token = session?.access_token ?? null
  const [combat, setCombat] = useState<LiveCombat | null>(null)
  // True once the first read for this campaign has finished (so the DM waits to seed its diff).
  const [loaded, setLoaded] = useState(false)
  // The demo's faux session (lib/demoLive.ts) stands in for the channel below.
  const demo = useDemoLive()
  const refresh = useRef(async () => {})
  refresh.current = async () => {
    if (!cloudCampaignId) return
    setCombat(await getLiveCombat(cloudCampaignId))
    setLoaded(true)
  }

  useEffect(() => {
    if (!cloudCampaignId || !supabase || !token || isDemo()) {
      setCombat(null)
      setLoaded(false)
      return
    }
    setLoaded(false)
    refresh.current()
    const channel = supabase
      .channel(`live-combat-${cloudCampaignId}-${crypto.randomUUID().slice(0, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_combat', filter: `campaign_id=eq.${cloudCampaignId}` },
        (p) => {
          if (p.eventType === 'DELETE') setCombat(null)
          else refresh.current()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_combatants', filter: `campaign_id=eq.${cloudCampaignId}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            const id = (p.old as Row).id as string
            setCombat((c) => (c ? { ...c, rows: c.rows.filter((r) => r.id !== id) } : c))
          } else {
            const r = rowFrom(p.new as Row)
            setCombat((c) =>
              c ? { ...c, rows: c.rows.some((x) => x.id === r.id) ? c.rows.map((x) => (x.id === r.id ? r : x)) : [...c.rows, r] } : c,
            )
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh.current()
      })
    return () => {
      supabase!.removeChannel(channel)
    }
  }, [cloudCampaignId, token])

  if (isDemoCloud(cloudCampaignId)) return { combat: demo.combat, loaded: true, setCombat, refresh: () => refresh.current() }
  return { combat, loaded, setCombat, refresh: () => refresh.current() }
}
