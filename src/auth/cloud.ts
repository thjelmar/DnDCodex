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
