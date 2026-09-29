import { Icon } from './Icon'
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createImage, updateImage } from '../db/repo'
import { processImageFile } from '../lib/image'
import { showHandout, hideHandout } from '../lib/handouts'
import type { StoredImage } from '../db/types'

/**
 * Compact handouts panel for Run mode's tools column: reveal a prepped handout,
 * or upload a new one and show it — all without leaving the session. Same data
 * and the same live publish as the Handouts tab (shared_images, kind='handout').
 */
export function RunHandouts({ campaignId }: { campaignId: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handouts = useLiveQuery(
    async () => {
      const arr = await db.images
        .where('campaignId')
        .equals(campaignId)
        .filter((i) => i.isHandout === true)
        .sortBy('createdAt')
      return arr.reverse()
    },
    [campaignId],
  )

  async function uploadAndShow(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const processed = await processImageFile(file)
      const img = await createImage(campaignId, {
        name: file.name,
        mime: processed.mime,
        dataUrl: processed.dataUrl,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
      })
      await updateImage(img.id, { isHandout: true, caption: file.name.replace(/\.[^.]+$/, '') })
      try {
        await showHandout({ ...img, isHandout: true, caption: file.name.replace(/\.[^.]+$/, '') }, campaignId)
      } catch {
        setError('Added, but couldn’t show — sign in / invite players to share.')
      }
    } catch {
      /* non-image / decode failure */
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="card run-card">
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadAndShow(e.target.files)} />
      <div className="run-ho-head">
        <div className="run-col-heading" style={{ margin: 0 }}><Icon name="image" size={15} /> Handouts</div>
        <button className="btn small primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? 'Uploading…' : <><Icon name="upload" size={13} color="inherit" /> Upload &amp; show</>}
        </button>
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '2px 0 8px' }}>{error}</p>}
      {handouts && handouts.length === 0 ? (
        <p className="faint" style={{ fontSize: 12, margin: '4px 0 0' }}>
          No handouts yet. Upload one here, or prep them in the Handouts tab.
        </p>
      ) : (
        <div className="run-ho-list">
          {handouts?.map((img) => <RunHandoutRow key={img.id} image={img} campaignId={campaignId} />)}
        </div>
      )}
    </div>
  )
}

function RunHandoutRow({ image, campaignId }: { image: StoredImage; campaignId: string }) {
  const [working, setWorking] = useState(false)
  const shown = image.sharedWithPlayers === true

  async function toggle() {
    setWorking(true)
    try {
      if (shown) await hideHandout(image)
      else await showHandout(image, campaignId)
    } catch {
      /* surfaced by the shared state not changing; keep the panel quiet */
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className={`run-ho-row${shown ? ' on' : ''}`}>
      <img src={image.dataUrl} alt={image.caption || ''} className="run-ho-thumb" />
      <div className="run-ho-meta">
        <div className="run-ho-name">{image.caption || image.name || 'Handout'}</div>
        <div className={`run-ho-state${shown ? ' vis' : ''}`}>{shown ? '● Players can see this' : 'Hidden'}</div>
      </div>
      <button
        className={`btn small${shown ? ' handout-toggle-on' : ''}`}
        disabled={working}
        onClick={toggle}
        title={shown ? 'Hide from players' : 'Show players'}
      >
        {working ? '…' : shown ? '✓ Shown' : 'Show'}
      </button>
    </div>
  )
}
