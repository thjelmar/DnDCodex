import { supabase } from '../lib/supabase'
import type { RevealedEntity } from '../lib/reveal'

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

// --- Shared gallery (Phase 3b) ---------------------------------------------
// A live album: the DM upserts images the whole campaign can read; un-sharing
// deletes the cloud row so it disappears from every player instantly. Unlike
// the inbox, nothing is imported — players read `shared_images` directly (RLS
// restricts it to campaign members).

export interface SharedImage {
  id: string
  dataUrl: string
  caption: string | null
  width: number | null
  height: number | null
  createdAt: string
}

/** Share (or update) a gallery image so every campaign member sees it live. */
export async function shareImageToCampaign(
  campaignId: string,
  img: { id: string; dataUrl: string; caption?: string; width?: number; height?: number },
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
    .select('id, data_url, caption, width, height, created_at')
    .eq('campaign_id', cloudCampaignId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map((r) => ({
    id: r.id as string,
    dataUrl: r.data_url as string,
    caption: (r.caption as string) ?? null,
    width: (r.width as number) ?? null,
    height: (r.height as number) ?? null,
    createdAt: r.created_at as string,
  }))
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
