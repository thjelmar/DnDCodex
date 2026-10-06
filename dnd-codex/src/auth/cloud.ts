import { supabase } from '../lib/supabase'
import type { RevealedEntity } from '../lib/reveal'
import type { WorldPin } from '../db/types'

// Cloud-side helpers for Phase 2: registering a DM's campaign for sharing,
// generating/reading its join code, and letting a player join by code. These
// are thin wrappers over Supabase; all access rules live in the DB (RLS).

// Ambiguous characters (I/O/0/1/L) removed so codes are easy to read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateJoinCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return code
}

/**
 * Registers a DM's campaign in the cloud (idempotent) and ensures the DM is a
 * member, returning the join code players use to link their accounts.
 */
export async function enableCampaignSharing(
  campaign: { id: string; name: string },
  ownerId: string,
): Promise<string> {
  if (!supabase) throw new Error('Not signed in')

  const existing = await supabase.from('campaigns').select('join_code').eq('id', campaign.id).maybeSingle()
  let joinCode = existing.data?.join_code as string | undefined

  if (!joinCode) {
    joinCode = generateJoinCode()
    if (existing.data) {
      // Phase 3 sync already created the campaign row, so INSERT would 409 on the
      // existing primary key. Just set the join code on the existing row.
      const { error } = await supabase
        .from('campaigns')
        .update({ join_code: joinCode })
        .eq('id', campaign.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('campaigns')
        .insert({ id: campaign.id, owner_id: ownerId, name: campaign.name, join_code: joinCode })
      if (error) throw error
    }
  }
  // Make sure the DM is recorded as a member. ignoreDuplicates avoids an RLS
  // UPDATE (which members have no policy for) if the row already exists.
  await supabase
    .from('campaign_members')
    .upsert(
      { campaign_id: campaign.id, user_id: ownerId, role: 'dm' },
      { onConflict: 'campaign_id,user_id', ignoreDuplicates: true },
    )

  return joinCode
}

/** The join code for a campaign, or null if it hasn't been registered yet. */
export async function getCampaignJoinCode(campaignId: string): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.from('campaigns').select('join_code').eq('id', campaignId).maybeSingle()
  return (data?.join_code as string) ?? null
}

/** Joins a campaign by its code. Returns the campaign id + name on success. */
export async function joinCampaignByCode(code: string): Promise<{ campaignId: string; name: string }> {
  if (!supabase) throw new Error('Not signed in')
  const { data: campaignId, error } = await supabase.rpc('join_campaign', { code })
  if (error) throw new Error(error.message || 'Could not join — check the code.')
  const info = await supabase.from('campaigns').select('name').eq('id', campaignId).maybeSingle()
  return { campaignId: campaignId as string, name: (info.data?.name as string) ?? 'the campaign' }
}

export interface Member {
  userId: string
  role: string
  displayName: string
  avatarUrl: string | null
  /** The member's chosen battle-map color (#rrggbb), or null if unset. */
  color: string | null
}

/** The members of a campaign (with profile display names), for the DM to pick
 *  share recipients. */
export async function getCampaignMembers(campaignId: string): Promise<Member[]> {
  if (!supabase) return []
  const query = (cols: string) =>
    supabase!.from('campaign_members').select(cols).eq('campaign_id', campaignId)
  let { data, error } = await query('user_id, role, color, profiles ( display_name, avatar_url )')
  // Before migration 0016 there's no `color` column; fall back without it.
  if (error) ({ data, error } = await query('user_id, role, profiles ( display_name, avatar_url )'))
  if (error || !data) return []
  return (data as unknown as Record<string, unknown>[]).map((r) => {
    const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as
      | { display_name: string | null; avatar_url: string | null }
      | undefined
    return {
      userId: r.user_id as string,
      role: r.role as string,
      displayName: p?.display_name || 'Player',
      avatarUrl: p?.avatar_url ?? null,
      color: (r.color as string) ?? null,
    }
  })
}

/** The current user's own battle-map color in a campaign (null if unset). */
export async function getMyColor(campaignId: string, userId: string): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('campaign_members')
    .select('color')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data?.color as string) ?? null
}

/** Set the current user's battle-map color (only their own; see 0016). */
export async function setMyColor(campaignId: string, color: string | null): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.rpc('set_my_color', { cid: campaignId, new_color: color })
  if (error) throw new Error(error.message)
}

// --- Shared gallery (Phase 3b) ---------------------------------------------
// A live album: the DM upserts images the whole campaign can read; un-sharing
// deletes the cloud row so it disappears from every player instantly. Unlike
// the inbox, nothing is imported — players read `shared_images` directly (RLS
// restricts it to campaign members).

/** How a shared image is surfaced to players: the passive gallery album (also
 *  covers entity portraits), a deliberate handout the DM hands over, or the
 *  backdrop of a shared world map (kept out of the gallery/handout surfaces). */
export type SharedImageKind = 'gallery' | 'handout' | 'worldmap'

export interface SharedImage {
  id: string
  dataUrl: string
  caption: string | null
  width: number | null
  height: number | null
  kind: SharedImageKind
  /** The session a handout was given in (set when shown during a live session). */
  sessionId: string | null
  sessionTitle: string | null
  sessionDate: string | null
  createdAt: string
}

/** Share (or update) an image so every campaign member sees it live. `kind`
 *  distinguishes gallery/portrait images from handouts (defaults to gallery so
 *  existing callers — the gallery and entity portraits — are unchanged).
 *  `session` tags a handout with the session it was given in (else null). */
export async function shareImageToCampaign(
  campaignId: string,
  img: { id: string; dataUrl: string; caption?: string; width?: number; height?: number },
  kind: SharedImageKind = 'gallery',
  session?: { id?: string | null; title?: string | null; date?: string | null } | null,
): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.from('shared_images').upsert(
    {
      id: img.id,
      campaign_id: campaignId,
      data_url: img.dataUrl,
      caption: img.caption ?? null,
      width: img.width ?? null,
      height: img.height ?? null,
      kind,
      session_id: session?.id ?? null,
      session_title: session?.title ?? null,
      session_date: session?.date ?? null,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(error.message)
}

/** Stop sharing an image — removes it from every player's view immediately. */
export async function unshareImageFromCampaign(imageId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('shared_images').delete().eq('id', imageId)
  if (error) throw new Error(error.message)
}

/** The live shared gallery for a campaign the current user belongs to. */
export async function getSharedImages(cloudCampaignId: string): Promise<SharedImage[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('shared_images')
    .select('id, data_url, caption, width, height, kind, session_id, session_title, session_date, created_at')
    .eq('campaign_id', cloudCampaignId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    dataUrl: r.data_url as string,
    caption: (r.caption as string) ?? null,
    width: (r.width as number) ?? null,
    height: (r.height as number) ?? null,
    kind: (((r.kind as string) === 'handout' || (r.kind as string) === 'worldmap') ? (r.kind as string) : 'gallery') as SharedImageKind,
    sessionId: (r.session_id as string) ?? null,
    sessionTitle: (r.session_title as string) ?? null,
    sessionDate: (r.session_date as string) ?? null,
    createdAt: r.created_at as string,
  }))
}

// --- Shared world map (T-6) ------------------------------------------------
// One read-only world map per campaign. Pins + meta live in `shared_world_maps`;
// the map picture rides `shared_images` with kind 'worldmap'. Un-sharing deletes
// both so it vanishes from every player instantly.

export interface SharedWorldMap {
  name: string | null
  imageId: string | null
  width: number | null
  height: number | null
  pins: WorldPin[]
}

/** Share (or re-push) the campaign's world map so members read it live. */
export async function shareWorldMap(
  campaignId: string,
  map: { name: string; imageId: string | null; width: number; height: number; pins: WorldPin[] },
): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.from('shared_world_maps').upsert(
    {
      campaign_id: campaignId,
      name: map.name,
      image_id: map.imageId,
      width: map.width,
      height: map.height,
      pins: map.pins,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'campaign_id' },
  )
  if (error) throw new Error(error.message)
}

/** Stop sharing the world map — removes it from every player's view at once. */
export async function unshareWorldMap(campaignId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('shared_world_maps').delete().eq('campaign_id', campaignId)
  if (error) throw new Error(error.message)
}

/** The shared world map for a campaign the current user belongs to, or null. */
export async function getSharedWorldMap(cloudCampaignId: string): Promise<SharedWorldMap | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('shared_world_maps')
    .select('name, image_id, width, height, pins')
    .eq('campaign_id', cloudCampaignId)
    .maybeSingle()
  if (error || !data) return null
  return {
    name: (data.name as string) ?? null,
    imageId: (data.image_id as string) ?? null,
    width: (data.width as number) ?? null,
    height: (data.height as number) ?? null,
    pins: (Array.isArray(data.pins) ? data.pins : []) as WorldPin[],
  }
}

// --- Live session ----------------------------------------------------------
// A single row per campaign, present only while the DM has an active live
// session (from Run mode's "Start live session"). Players read it to show a
// "Join session" prompt; ending the session deletes the row.

export interface LiveSession {
  campaignId: string
  sessionId: string | null
  title: string
  sessionDate: string
  startedAt: string
}

/** Start (or refresh) the live session for a campaign — DM only. */
export async function startLiveSession(
  campaignId: string,
  s: { sessionId?: string | null; title?: string; sessionDate?: string },
): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.from('live_sessions').upsert(
    {
      campaign_id: campaignId,
      session_id: s.sessionId ?? null,
      title: s.title ?? '',
      session_date: s.sessionDate ?? '',
      started_at: new Date().toISOString(),
    },
    { onConflict: 'campaign_id' },
  )
  if (error) throw new Error(error.message)
}

/** End the live session — removes the row so players can no longer join. */
export async function endLiveSession(campaignId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('live_sessions').delete().eq('campaign_id', campaignId)
  if (error) throw new Error(error.message)
}

/** The current live session for a campaign the user belongs to, or null. */
export async function getLiveSession(cloudCampaignId: string): Promise<LiveSession | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('live_sessions')
    .select('campaign_id, session_id, title, session_date, started_at')
    .eq('campaign_id', cloudCampaignId)
    .maybeSingle()
  if (error || !data) return null
  return {
    campaignId: data.campaign_id as string,
    sessionId: (data.session_id as string) ?? null,
    title: (data.title as string) ?? '',
    sessionDate: (data.session_date as string) ?? '',
    startedAt: data.started_at as string,
  }
}

// --- Session schedule (next-session indicator) -----------------------------
// The DM publishes when the next session is; players read it live. Mirrors the
// live_sessions pattern: one row per campaign, owner-write / member-read.

export interface CloudSessionSchedule {
  nextSessionDate: string | null
  nextSessionTime: string | null
  rescheduledFrom: string | null
}

/** Publish (or update) the campaign's next-session schedule — DM only. */
export async function setSessionSchedule(
  campaignId: string,
  s: CloudSessionSchedule,
): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.from('session_schedule').upsert(
    {
      campaign_id: campaignId,
      next_date: s.nextSessionDate || null,
      next_time: s.nextSessionTime || null,
      rescheduled_from: s.rescheduledFrom || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'campaign_id' },
  )
  if (error) throw new Error(error.message)
}

/** Clear the schedule — removes the row so players see nothing scheduled. */
export async function clearSessionSchedule(campaignId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('session_schedule').delete().eq('campaign_id', campaignId)
  if (error) throw new Error(error.message)
}

/** The campaign's calendar-subscription token (members read it to build their
 *  subscribe link), or null when the DM hasn't created one yet. */
export async function getCalendarToken(campaignId: string): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('campaign_calendar_tokens')
    .select('token')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  return (data?.token as string) ?? null
}

/** Ensure the campaign has a calendar token (DM only) and return it. */
export async function ensureCalendarToken(campaignId: string): Promise<string | null> {
  if (!supabase) return null
  // Insert if missing; the token defaults server-side. Ignore the conflict when
  // it already exists, then read it back.
  await supabase
    .from('campaign_calendar_tokens')
    .upsert({ campaign_id: campaignId }, { onConflict: 'campaign_id', ignoreDuplicates: true })
  return getCalendarToken(campaignId)
}

/** The schedule for a campaign the user belongs to, or null when none is set. */
export async function getSessionSchedule(
  cloudCampaignId: string,
): Promise<CloudSessionSchedule | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('session_schedule')
    .select('next_date, next_time, rescheduled_from')
    .eq('campaign_id', cloudCampaignId)
    .maybeSingle()
  if (error || !data) return null
  return {
    nextSessionDate: (data.next_date as string) ?? null,
    nextSessionTime: (data.next_time as string) ?? null,
    rescheduledFrom: (data.rescheduled_from as string) ?? null,
  }
}

// --- Shared entities (Phase 3c) --------------------------------------------
// Live published entity copies. `pushEntity` uploads the reveal-safe, spoiler-
// redacted snapshot (see lib/reveal.ts); it is the DM's explicit "publish" step,
// so players never see unpushed edits. Un-sharing deletes the row (retracts it
// live). Players read `shared_entities` directly (RLS restricts to members).

export interface SharedEntityRow {
  id: string
  kind: string
  data: RevealedEntity
  pushedAt: string
}

/** Publish (upsert) a reveal-safe snapshot of an entity for players. */
export async function pushEntity(
  campaignId: string,
  id: string,
  kind: string,
  data: RevealedEntity,
): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.from('shared_entities').upsert(
    { id, campaign_id: campaignId, kind, data, pushed_at: new Date().toISOString() },
    { onConflict: 'id' },
  )
  if (error) throw new Error(error.message)
}

/** Stop sharing an entity — removes it from players immediately. */
export async function unshareEntity(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('shared_entities').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** The live set of entities shared with the current player for a campaign. */
export async function getSharedEntities(cloudCampaignId: string): Promise<SharedEntityRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('shared_entities')
    .select('id, kind, data, pushed_at')
    .eq('campaign_id', cloudCampaignId)
    .order('pushed_at', { ascending: false })
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    data: r.data as RevealedEntity,
    pushedAt: r.pushed_at as string,
  }))
}

// ── Party loot & gold tracker (shared, member-writable, live) ──────────────
// Both the DM and players read + write these. See migration 0011.

export type CoinKey = 'pp' | 'gp' | 'ep' | 'sp' | 'cp'
export type Treasury = Record<CoinKey, number>
export const EMPTY_TREASURY: Treasury = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }

export interface LootItem {
  id: string
  name: string
  qty: number
  value: string
  claimedBy: string
  notes: string
  createdAt: string
}

/** The campaign's shared coin purse (zeros if no row exists yet). */
export async function getTreasury(cloudCampaignId: string): Promise<Treasury> {
  if (!supabase) return { ...EMPTY_TREASURY }
  const { data } = await supabase
    .from('party_treasury')
    .select('pp, gp, ep, sp, cp')
    .eq('campaign_id', cloudCampaignId)
    .maybeSingle()
  if (!data) return { ...EMPTY_TREASURY }
  return { pp: data.pp ?? 0, gp: data.gp ?? 0, ep: data.ep ?? 0, sp: data.sp ?? 0, cp: data.cp ?? 0 }
}

/** Replace the shared coin purse (last write wins). */
export async function setTreasury(cloudCampaignId: string, coins: Treasury, userId: string): Promise<void> {
  if (!supabase) throw new Error('Not signed in')
  const { error } = await supabase.from('party_treasury').upsert(
    { campaign_id: cloudCampaignId, ...coins, updated_at: new Date().toISOString(), updated_by: userId },
    { onConflict: 'campaign_id' },
  )
  if (error) throw new Error(error.message)
}

/** The campaign's shared loot list, oldest first. */
export async function getLoot(cloudCampaignId: string): Promise<LootItem[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('party_loot')
    .select('id, name, qty, value, claimed_by, notes, created_at')
    .eq('campaign_id', cloudCampaignId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? '',
    qty: (r.qty as number) ?? 1,
    value: (r.value as string) ?? '',
    claimedBy: (r.claimed_by as string) ?? '',
    notes: (r.notes as string) ?? '',
    createdAt: r.created_at as string,
  }))
}

export async function addLootItem(
  cloudCampaignId: string,
  id: string,
  item: { name: string; qty: number; value: string; claimedBy: string; notes: string },
  userId: string,
): Promise<void> {
  if (!supabase) throw new Error('Not signed in')
  const { error } = await supabase.from('party_loot').insert({
    id,
    campaign_id: cloudCampaignId,
    name: item.name,
    qty: item.qty,
    value: item.value,
    claimed_by: item.claimedBy,
    notes: item.notes,
    created_by: userId,
  })
  if (error) throw new Error(error.message)
}

export async function updateLootItem(
  id: string,
  patch: Partial<{ name: string; qty: number; value: string; claimedBy: string; notes: string }>,
): Promise<void> {
  if (!supabase) throw new Error('Not signed in')
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) row.name = patch.name
  if (patch.qty !== undefined) row.qty = patch.qty
  if (patch.value !== undefined) row.value = patch.value
  if (patch.claimedBy !== undefined) row.claimed_by = patch.claimedBy
  if (patch.notes !== undefined) row.notes = patch.notes
  const { error } = await supabase.from('party_loot').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteLootItem(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('party_loot').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
