import { Icon } from '../components/Icon'
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createImage, updateImage, deleteImage } from '../db/repo'
import { processImageFile } from '../lib/image'
import { useCampaign } from './CampaignLayout'
import { useAuth } from '../auth/AuthProvider'
import { useConfirm } from '../components/ConfirmDialog'
import { shareImageToCampaign, unshareImageFromCampaign } from '../auth/cloud'
import type { StoredImage } from '../db/types'

/**
 * The campaign image gallery: a library of uploaded images (maps, handouts,
 * character art). Each can be shared to the campaign's players as a live album
 * (see `shared_images` + cloud.ts). Sharing needs the campaign to be a cloud
 * campaign (sync enabled or players invited); otherwise the share is refused
 * by RLS and we surface a hint.
 */
export function GalleryPage() {
  const campaign = useCampaign()
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const images = useLiveQuery(
    async () => {
      const arr = await db.images
        .where('campaignId')
        .equals(campaign.id)
        .filter((i) => i.inGallery === true)
        .sortBy('createdAt')
      return arr.reverse() // newest first
    },
    [campaign.id],
  )

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        try {
          const processed = await processImageFile(file)
          const img = await createImage(campaign.id, {
            name: file.name,
            mime: processed.mime,
            dataUrl: processed.dataUrl,
            width: processed.width,
            height: processed.height,
            bytes: processed.bytes,
          })
          await updateImage(img.id, { inGallery: true })
        } catch {
          /* skip a non-image / decode failure, keep going */
        }
      }
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="row between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p className="faint" style={{ margin: 0, maxWidth: 520, fontSize: 13 }}>
          Upload maps, handouts, and art. Share any image and every player in this campaign
          sees it in a live album — toggle it off any time to pull it back.
        </p>
        <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Uploading…' : <><Icon name="upload" size={15} color="inherit" /> Upload images</>}
        </button>
      </div>

      {!user && (
        <p className="faint" style={{ fontSize: 13, marginBottom: 12 }}>
          Sign in to share images with your players. You can still keep a local gallery without it.
        </p>
      )}

      {images?.length === 0 ? (
        <div className="empty">
          <div className="big"><Icon name="image" size={40} strokeWidth={1.4} /></div>
          <p>No images yet. Upload maps, handouts, or character art to build your gallery.</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {images?.map((img) => (
            <GalleryCard key={img.id} image={img} campaignId={campaign.id} canShare={!!user} />
          ))}
        </div>
      )}
    </div>
  )
}

function GalleryCard({
  image,
  campaignId,
  canShare,
}: {
  image: StoredImage
  campaignId: string
  canShare: boolean
}) {
  const confirm = useConfirm()
  const [caption, setCaption] = useState(image.caption ?? '')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shared = image.sharedWithPlayers === true

  async function commitCaption() {
    if (caption === (image.caption ?? '')) return
    await updateImage(image.id, { caption })
    // Keep the shared copy's caption in sync.
    if (shared) {
      try {
        await shareImageToCampaign(campaignId, {
          id: image.id,
          dataUrl: image.dataUrl,
          caption,
          width: image.width,
          height: image.height,
        })
      } catch {
        /* caption stays local if the re-share fails */
      }
    }
  }

  async function toggleShare() {
    setWorking(true)
    setError(null)
    try {
      if (shared) {
        await unshareImageFromCampaign(image.id)
        await updateImage(image.id, { sharedWithPlayers: false })
      } else {
        await shareImageToCampaign(campaignId, {
          id: image.id,
          dataUrl: image.dataUrl,
          caption,
          width: image.width,
          height: image.height,
        })
        await updateImage(image.id, { sharedWithPlayers: true })
      }
    } catch (e) {
      setError(
        'Couldn’t share — enable sync or invite players for this campaign first.',
      )
      void e
    } finally {
      setWorking(false)
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete image?',
      message: 'Remove this image from the gallery? This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    if (shared) await unshareImageFromCampaign(image.id).catch(() => {})
    await deleteImage(image.id)
  }

  return (
    <div className="gallery-card">
      <img src={image.dataUrl} alt={caption || image.name} className="gallery-thumb" />
      <div className="gallery-card-body">
        <input
          className="input"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onBlur={commitCaption}
          placeholder="Caption (optional)…"
          style={{ fontSize: 13 }}
        />
        <div className="row between" style={{ marginTop: 8, alignItems: 'center' }}>
          {canShare ? (
            <button
              className={`btn small${shared ? ' primary' : ''}`}
              disabled={working}
              onClick={toggleShare}
              title={shared ? 'Shared with players — click to stop' : 'Share with players'}
            >
              {working ? '…' : shared ? '✓ Shared' : 'Share'}
            </button>
          ) : (
            <span />
          )}
          <button className="btn ghost small danger" onClick={remove}>
            Delete
          </button>
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
      </div>
    </div>
  )
}
