import { supabase } from '../lib/supabase'

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
    const { error } = await supabase
      .from('campaigns')
      .insert({ id: campaign.id, owner_id: ownerId, name: campaign.name, join_code: joinCode })
    if (error) throw error
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
}

/** The members of a campaign (with profile display names), for the DM to pick
 *  share recipients. */
export async function getCampaignMembers(campaignId: string): Promise<Member[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('campaign_members')
    .select('user_id, role, profiles ( display_name, avatar_url )')
    .eq('campaign_id', campaignId)
  if (error || !data) return []
  return data.map((r) => {
    const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as
      | { display_name: string | null; avatar_url: string | null }
      | undefined
    return {
      userId: r.user_id as string,
      role: r.role as string,
      displayName: p?.display_name || 'Player',
      avatarUrl: p?.avatar_url ?? null,
    }
  })
}

/** Sends a share (a built SharePacket) to each recipient's inbox. */
export async function sendShareToMembers(
  campaignId: string,
  fromUserId: string,
  toUserIds: string[],
  title: string,
  payload: unknown,
): Promise<number> {
  if (!supabase || toUserIds.length === 0) return 0
  const rows = toUserIds.map((to) => ({
    campaign_id: campaignId,
    from_user: fromUserId,
    to_user: to,
    title,
    payload,
  }))
  const { error } = await supabase.from('shares').insert(rows)
  if (error) throw new Error(error.message)
  return rows.length
}

export interface InboxShare {
  id: string
  title: string | null
  payload: unknown
  createdAt: string
  fromName: string
}

/** Pending (not-yet-imported) shares addressed to me for a given cloud campaign. */
export async function getInbox(cloudCampaignId: string): Promise<InboxShare[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('shares')
    .select('id, title, payload, created_at, sender:profiles!shares_from_user_fkey ( display_name )')
    .eq('campaign_id', cloudCampaignId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map((r) => {
    const s = (Array.isArray(r.sender) ? r.sender[0] : r.sender) as { display_name: string | null } | undefined
    return {
      id: r.id as string,
      title: (r.title as string) ?? null,
      payload: r.payload,
      createdAt: r.created_at as string,
      fromName: s?.display_name || 'Your DM',
    }
  })
}

export interface InboxCounts {
  /** Total pending (unconsumed) shares addressed to me, across all campaigns. */
  total: number
  /** Pending count keyed by cloud campaign id (== a player campaign's linkedCampaignId). */
  byCampaign: Record<string, number>
}

/**
 * A single roll-up of every pending share addressed to me, for the global
 * sidebar badge. RLS already restricts `shares` to my own rows; we filter to
 * received-and-unconsumed and tally per campaign client-side.
 */
export async function getInboxCounts(userId: string): Promise<InboxCounts> {
  if (!supabase) return { total: 0, byCampaign: {} }
  const { data, error } = await supabase
    .from('shares')
    .select('campaign_id')
    .eq('to_user', userId)
    .is('consumed_at', null)
  if (error || !data) return { total: 0, byCampaign: {} }
  const byCampaign: Record<string, number> = {}
  for (const r of data) {
    const cid = r.campaign_id as string
    byCampaign[cid] = (byCampaign[cid] ?? 0) + 1
  }
  return { total: data.length, byCampaign }
}

/** Marks a share as imported so it drops out of the inbox. */
export async function markShareConsumed(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('shares').update({ consumed_at: new Date().toISOString() }).eq('id', id)
}
