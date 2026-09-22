import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createImage, deleteImage } from '../db/repo'
import { processImageFile } from '../lib/image'
import type { Id } from '../db/types'

/**
 * A single portrait/image for an entity (NPC, location, item). Mirrors the
 * campaign cover pattern: the image is a StoredImage referenced by an id the
 * parent stores. Upload downscales + re-encodes; replacing or removing cleans up
 * the previous StoredImage so we don't orphan blobs. StoredImages sync + back up.
 */
export function EntityImage({
  campaignId,
  imageId,
  onChange,
  width = 132,
  height = 156,
  label = 'portrait',
}: {
  campaignId: Id
  imageId: Id | null | undefined
  onChange: (imageId: Id | null) => void
  width?: number
  height?: number
  label?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const image = useLiveQuery(
    () => (imageId ? db.images.get(imageId) : undefined),
    [imageId],
  )

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const processed = await processImageFile(file)
      const created = await createImage(campaignId, {
        name: file.name,
        mime: processed.mime,
        dataUrl: processed.dataUrl,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
      })
      const previous = imageId
      onChange(created.id)
      if (previous) await deleteImage(previous)
    } catch {
      /* not an image / decode failure — ignore */
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function remove() {
    const previous = imageId
    onChange(null)
    if (previous) await deleteImage(previous)
  }

  return (
    <div className="entity-image" style={{ width }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      {image ? (
        <>
          <img
            src={image.dataUrl}
            alt={label}
            style={{ width, height, objectFit: 'cover' }}
            className="entity-image-img"
          />
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <button className="btn ghost small" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? '…' : 'Change'}
            </button>
            <button className="btn ghost small danger" onClick={remove}>
              Remove
            </button>
          </div>
        </>
      ) : (
        <button
          className="entity-image-empty"
          style={{ width, height }}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          title={`Add a ${label}`}
        >
          {busy ? '…' : <><span style={{ fontSize: 24 }}>🖼</span><span style={{ fontSize: 12 }}>Add {label}</span></>}
        </button>
      )}
    </div>
  )
}
