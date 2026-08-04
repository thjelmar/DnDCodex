import { useRef, useState } from 'react'
import { createImage } from '../db/repo'
import { processImageFile } from '../lib/image'
import { CampaignMarkdown } from './CampaignMarkdown'
import type { Id } from '../db/types'

// A markdown text area with an Edit/Preview toggle and an "Insert image"
// button. Uploaded images are downscaled, stored, and referenced inline as
// ![name](img:<id>) at the cursor position. Used anywhere campaign prose is
// edited so images work consistently.
export function MarkdownEditor({
  campaignId,
  value,
  onChange,
  label,
  placeholder,
  tall,
}: {
  campaignId: Id
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  tall?: boolean
}) {
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Inserts text at the caret (or appends if the textarea isn't focused). */
  function insertAtCursor(snippet: string) {
    const ta = textareaRef.current
    if (!ta) {
      onChange(value ? `${value}\n${snippet}` : snippet)
      return
    }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const next = value.slice(0, start) + snippet + value.slice(end)
    onChange(next)
    // Restore focus and place the caret after the inserted snippet.
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + snippet.length
      ta.setSelectionRange(pos, pos)
    })
  }

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const processed = await processImageFile(file)
      const image = await createImage(campaignId, {
        name: file.name,
        mime: processed.mime,
        dataUrl: processed.dataUrl,
        width: processed.width,
        height: processed.height,
        bytes: processed.bytes,
      })
      const alt = file.name.replace(/\.[^.]+$/, '')
      insertAtCursor(`\n![${alt}](img:${image.id})\n`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that image.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="field">
      <div className="row between">
        <label>{label ?? 'Body'}</label>
        <div className="row" style={{ gap: 4 }}>
          <button
            type="button"
            className="btn ghost small"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? '… Uploading' : '🖼 Image'}
          </button>
          <button type="button" className="btn ghost small" onClick={() => setPreview((p) => !p)}>
            {preview ? '✎ Edit' : '👁 Preview'}
          </button>
        </div>
      </div>

      {error && (
        <div className="danger-text" style={{ fontSize: 12, marginBottom: 6 }}>
          {error}
        </div>
      )}

      {preview ? (
        <div className="card" style={{ cursor: 'default' }}>
          <CampaignMarkdown campaignId={campaignId} text={value} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          className={`textarea${tall ? ' tall' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
