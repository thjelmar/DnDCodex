import { Icon } from '../components/Icon'
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createImage, updateImage, deleteImage } from '../db/repo'
import { processImageFile } from '../lib/image'
import { useCampaign } from './CampaignLayout'
import { useAuth } from '../auth/AuthProvider'
import { useConfirm } from '../components/ConfirmDialog'
import { unshareImageFromCampaign } from '../auth/cloud'
import { showHandout, hideHandout } from '../lib/handouts'
import type { StoredImage } from '../db/types'

/**
 * Handouts: images (maps, letters, art) the DM hands to players deliberately —
 * distinct from the passive Gallery album. Showing one publishes it to
 * `shared_images` with kind='handout'; players see it in their own Handouts
 * section, live. Prep them here; reveal them here or from Run mode mid-session.
 */
export function HandoutsPage() {
  const campaign = useCampaign()
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handouts = useLiveQuery(
    async () => {
      const arr = await db.images
        .where('campaignId')
        .equals(campaign.id)
        .filter((i) => i.isHandout === true)
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
          await updateImage(img.id, { isHandout: true })
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
          Hand a map, letter, or piece of art to your players. Show one and everyone in the
          campaign sees it live in their Handouts — hide it any time to pull it back. You can
          also reveal and add these from Run mode without leaving the session.
        </p>
        <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Uploading…' : <><Icon name="upload" size={15} color="inherit" /> Upload handout</>}
        </button>
      </div>

      {!user && (
        <p className="faint" style={{ fontSize: 13, marginBottom: 12 }}>
          Sign in to show handouts to your players. You can still prepare them locally without it.
        </p>
      )}

      {handouts?.length === 0 ? (
        <div className="empty">
          <div className="big"><Icon name="image" size={40} strokeWidth={1.4} /></div>
          <p>No handouts yet. Upload a map, letter, or piece of art to hand your players.</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {handouts?.map((img) => (
            <HandoutCard key={img.id} image={img} campaignId={campaign.id} canShare={!!user} />
          ))}
        </div>
      )}
    </div>
  )
}

function HandoutCard({
  image,
  campaignId,
  canShare,
}: {
  image: StoredImage
  campaignId: string
  canShare: boolean
}) {
  const confirm = useConfirm()
  const [title, setTitle] = useState(image.caption ?? '')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shown = image.sharedWithPlayers === true

  async function commitTitle() {
    if (title === (image.caption ?? '')) return
    await updateImage(image.id, { caption: title })
    if (shown) {
      // Re-publish so players see the new title (keeps the session tag).
      try {
        await showHandout({ ...image, caption: title }, campaignId)
      } catch {
        /* title stays local if the re-share fails */
      }
    }
  }

  async function toggleShow() {
    setWorking(true)
    setError(null)
    try {
      if (shown) await hideHandout(image)
      else await showHandout({ ...image, caption: title }, campaignId)
    } catch {
      setError('Couldn’t show — enable sync or invite players for this campaign first.')
    } finally {
      setWorking(false)
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete handout?',
      message: 'Remove this handout? This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    if (shown) await unshareImageFromCampaign(image.id).catch(() => {})
    await deleteImage(image.id)
  }

  return (
    <div className={`gallery-card${shown ? ' handout-shown' : ''}`}>
      <div className="handout-thumb-wrap">
        <img src={image.dataUrl} alt={title || image.name} className="gallery-thumb" />
        <span className={`handout-badge${shown ? '' : ' off'}`}>
          <span className="handout-dot" /> {shown ? 'Visible' : 'Hidden'}
        </span>
      </div>
      <div className="gallery-card-body">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          placeholder="Title (optional)…"
          style={{ fontSize: 13 }}
        />
        <div className="row between" style={{ marginTop: 8, alignItems: 'center' }}>
          {canShare ? (
            <button
              className={`btn small${shown ? ' handout-toggle-on' : ''}`}
              disabled={working}
              onClick={toggleShow}
              title={shown ? 'Players can see this — click to hide' : 'Show this to players'}
            >
              {working ? '…' : shown ? '✓ Shown to players' : 'Show players'}
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
