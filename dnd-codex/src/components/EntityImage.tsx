import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createImage, deleteImage } from '../db/repo'
import { processImageFile, type ProcessedImage } from '../lib/image'
import { Icon } from './Icon'
import { ImageCropDialog } from './ImageCropDialog'
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
  round,
}: {
  campaignId: Id
  imageId: Id | null | undefined
  onChange: (imageId: Id | null) => void
  width?: number
  height?: number
  label?: string
  /** Crop to a circle-friendly square. Defaults to true for token images. */
  round?: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<File | null>(null)
  const isRound = round ?? /token/i.test(label)

  const image = useLiveQuery(
    () => (imageId ? db.images.get(imageId) : undefined),
    [imageId],
  )

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file || !file.type.startsWith('image/')) return
    // Animated GIFs can't be cropped on a canvas without losing the animation.
    if (file.type === 'image/gif') void store(file, null)
    else setPending(file)
  }

  async function store(file: File, cropped: ProcessedImage | null) {
    setBusy(true)
    try {
      const processed = cropped ?? (await processImageFile(file))
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
      /* decode failure — ignore */
    } finally {
      setBusy(false)
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
          {busy ? '…' : <><Icon name="image" size={26} strokeWidth={1.5} /><span style={{ fontSize: 12 }}>Add {label}</span></>}
        </button>
      )}
      {pending && (
        <ImageCropDialog
          file={pending}
          aspect={isRound ? 1 : width / height}
          round={isRound}
          title={`Adjust ${label}`}
          onCancel={() => setPending(null)}
          onSave={async (processed) => {
            const file = pending
            setPending(null)
            await store(file, processed)
          }}
        />
      )}
    </div>
  )
}
