import { useState } from 'react'
import { updateCampaign } from '../db/repo'
import { newId } from '../db/db'
import { Modal } from './Modal'
import { normalizeUrl, displayHost } from '../lib/url'
import type { ExternalLink } from '../db/types'

// Quick links to external tools for a campaign (D&D Beyond, character sheets,
// a VTT…). Each renders as a button that opens the URL in a new tab; links can
// be added, edited, and removed inline.
export function CampaignLinks({ campaignId, links }: { campaignId: string; links: ExternalLink[] }) {
  const [modal, setModal] = useState<{ link: ExternalLink | null } | null>(null)

  async function save(label: string, rawUrl: string, id: string | null) {
    const url = normalizeUrl(rawUrl)
    if (!url) return
    const entry: ExternalLink = { id: id ?? newId(), label: label.trim() || displayHost(url), url }
    const next = id ? links.map((l) => (l.id === id ? entry : l)) : [...links, entry]
    await updateCampaign(campaignId, { externalLinks: next })
    setModal(null)
  }

  async function remove(id: string) {
    await updateCampaign(campaignId, { externalLinks: links.filter((l) => l.id !== id) })
  }

  return (
    <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
      {links.map((l) => (
        <span key={l.id} className="link-chip">
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer noopener"
            className="link-chip-open"
            title={l.url}
          >
            🔗 {l.label} <span className="faint">↗</span>
          </a>
          <button className="link-chip-btn" title="Edit link" onClick={() => setModal({ link: l })}>
            ✎
          </button>
          <button className="link-chip-btn" title="Remove link" onClick={() => remove(l.id)}>
            ✕
          </button>
        </span>
      ))}
      <button className="btn ghost small" onClick={() => setModal({ link: null })}>
        ＋ Add link
      </button>

      {modal && <LinkModal initial={modal.link} onClose={() => setModal(null)} onSave={save} />}
    </div>
  )
}

function LinkModal({
  initial,
  onClose,
  onSave,
}: {
  initial: ExternalLink | null
  onClose: () => void
  onSave: (label: string, url: string, id: string | null) => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [error, setError] = useState('')

  function submit() {
    if (!normalizeUrl(url)) {
      setError('Enter a valid web address (starting with http:// or https://).')
      return
    }
    onSave(label, url, initial?.id ?? null)
  }

  return (
    <Modal
      title={initial ? 'Edit link' : 'Add link'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            Save
          </button>
        </>
      }
    >
      <div className="field">
        <label>Label</label>
        <input
          className="input"
          autoFocus
          value={label}
          placeholder="e.g. D&D Beyond, My Character Sheet"
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="field">
        <label>URL</label>
        <input
          className="input"
          value={url}
          placeholder="https://www.dndbeyond.com/…"
          onChange={(e) => {
            setUrl(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      {error && <div className="danger-text" style={{ fontSize: 13 }}>{error}</div>}
    </Modal>
  )
}
