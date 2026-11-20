import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createImage, deleteImage, updateCampaign } from '../db/repo'
import { processImageFile } from '../lib/image'
import { Icon } from './Icon'
import type { Campaign } from '../db/types'

// The Overview banner: campaign name (inline rename), one-line summary, and the
// optional cover image behind them. With no cover it falls back to a soft
// gradient from the campaign's own color, so the page never opens on an
// "add an image" prompt. The cover is a StoredImage via campaign.coverImageId.

export function CampaignHero({ campaign }: { campaign: Campaign }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const cover = useLiveQuery(
    () => (campaign.coverImageId ? db.images.get(campaign.coverImageId) : undefined),
    [campaign.coverImageId],
  )

  const startRename = () => {
    setNameDraft(campaign.name)
    setRenaming(true)
  }
  const commitRename = async () => {
    const next = nameDraft.trim()
    setRenaming(false)
    if (next && next !== campaign.name) await updateCampaign(campaign.id, { name: next })
  }

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const processed = await processImageFile(file)
      const image = await createImage(campaign.id, {
        name: file.name,
        mime: processed.mime,
        dataUrl: processed.dataUrl,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
      })
      // Replace any previous cover, cleaning up the old image.
      const previous = campaign.coverImageId
      await updateCampaign(campaign.id, { coverImageId: image.id })
      if (previous) await deleteImage(previous)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeCover() {
    const previous = campaign.coverImageId
    await updateCampaign(campaign.id, { coverImageId: null })
    if (previous) await deleteImage(previous)
  }

  const style = {
    '--hero-color': campaign.color,
    backgroundImage: cover ? `url("${cover.dataUrl}")` : undefined,
  } as CSSProperties

  return (
    <div className={`ov-hero${cover ? ' has-cover' : ''}`} style={style}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="ov-hero-body">
        <div className="ov-hero-title">
          {renaming ? (
            <input
              className="input ov-hero-input"
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                else if (e.key === 'Escape') setRenaming(false)
              }}
            />
          ) : (
            <>
              <h1 className="mb-0">{campaign.name}</h1>
              <button
                className="btn ghost small"
                title="Rename campaign"
                aria-label="Rename campaign"
                onClick={startRename}
              >
                <Icon name="pencil" size={14} />
              </button>
            </>
          )}
        </div>
        {campaign.summary && <p className="ov-hero-summary">{campaign.summary}</p>}
      </div>
      <div className="ov-hero-actions">
        <button className="btn small" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Icon name="image" size={13} /> {busy ? '…' : cover ? 'Change cover' : 'Add cover'}
        </button>
        {cover && (
          <button className="btn small danger" onClick={removeCover}>
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
