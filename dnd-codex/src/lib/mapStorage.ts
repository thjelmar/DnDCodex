import { supabase } from './supabase'

// Battle-map images in Supabase Storage (migration 0021, private bucket
// `battlemaps`). Only the SHARING path uses this: the DM uploads the binary and
// players download it via the bucket's member-read RLS. The DM's own board still
// renders from the local Dexie data URL, and the records sync is unchanged — so
// this is isolated to live sharing (the v1a split).
//
// Path convention `<campaignId>/<imageId>.webp` matters: the bucket policies read
// campaign membership from the first path segment.

const BUCKET = 'battlemaps'

export function mapObjectPath(campaignId: string, imageId: string): string {
  return `${campaignId}/${imageId}.webp`
}

/** Upload a map's binary (from its data URL) to the bucket. Idempotent per path. */
export async function uploadMapImage(campaignId: string, imageId: string, dataUrl: string): Promise<string> {
  if (!supabase) throw new Error('Not signed in.')
  const blob = await (await fetch(dataUrl)).blob()
  const path = mapObjectPath(campaignId, imageId)
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || 'image/webp',
  })
  if (error) throw new Error(error.message)
  return path
}

/** Download a shared map and return an object URL (caller revokes it). */
export async function downloadMapObjectUrl(path: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) return null
  return URL.createObjectURL(data)
}

/** Download a map as a base64 data URL, for caching back into local Dexie (so a
 *  device that pulled the record without base64 has the map offline thereafter). */
export async function downloadMapDataUrl(path: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) return null
  return await new Promise<string | null>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(data)
  })
}

/** Remove a map object (e.g. one the DM replaced). Best-effort. */
export async function deleteMapImage(path: string): Promise<void> {
  if (!supabase) return
  await supabase.storage.from(BUCKET).remove([path])
}
