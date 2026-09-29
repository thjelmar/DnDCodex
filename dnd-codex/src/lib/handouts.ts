import { updateImage } from '../db/repo'
import { shareImageToCampaign, unshareImageFromCampaign } from '../auth/cloud'
import type { StoredImage } from '../db/types'

// Show / hide a handout to players. Shared by the Handouts tab and the Run-mode
// panel so both surfaces drive the same live publish. Publishing goes to
// shared_images with kind='handout'; the local flag mirrors the shared state.

export async function showHandout(img: StoredImage, campaignId: string): Promise<void> {
  await shareImageToCampaign(
    campaignId,
    { id: img.id, dataUrl: img.dataUrl, caption: img.caption, width: img.width, height: img.height },
    'handout',
  )
  await updateImage(img.id, { sharedWithPlayers: true })
}

export async function hideHandout(img: StoredImage): Promise<void> {
  await unshareImageFromCampaign(img.id)
  await updateImage(img.id, { sharedWithPlayers: false })
}
