import { createImage, updateImage } from '../db/repo'
import type { StoredImage } from '../db/types'
import { uploadMapImage } from './mapStorage'

/**
 * Stores a map image for a campaign: creates the local image record, then makes a
 * best-effort upload to the campaign's private `battlemaps` bucket and records its
 * `storagePath`, so the base64 never rides the records sync and live sharing works.
 * If the upload fails (offline, signed out), the local map still works and falls
 * back to the legacy base64 sync. Shared by "Upload map" and the map library.
 */
export async function importMapImage(
  campaignId: string,
  input: Pick<StoredImage, 'name' | 'mime' | 'dataUrl' | 'width' | 'height' | 'bytes'>,
): Promise<StoredImage> {
  const img = await createImage(campaignId, input)
  try {
    const path = await uploadMapImage(campaignId, img.id, img.dataUrl)
    await updateImage(img.id, { storagePath: path })
    return { ...img, storagePath: path }
  } catch {
    return img
  }
}
