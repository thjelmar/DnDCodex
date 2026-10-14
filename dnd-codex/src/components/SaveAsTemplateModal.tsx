import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'

/**
 * Shared "Save as template" modal (T-8 sessions, T-30 npc/location): names the
 * template and hands the label back to the caller, which snapshots the entity.
 */
export function SaveAsTemplateModal({
  defaultLabel,
  description,
  placeholder,
  onSave,
  onClose,
}: {
  defaultLabel: string
  /** Explains which fields get copied (and which don't). */
  description: ReactNode
  placeholder?: string
  onSave: (label: string) => Promise<void>
  onClose: () => void
}) {
  const [label, setLabel] = useState(defaultLabel)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!label.trim() || busy) return
    setBusy(true)
    await onSave(label)
    onClose()
  }

  return (
    <Modal
      title="Save as template"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy || !label.trim()}>
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </>
      }
    >
      <p className="faint" style={{ marginTop: 0 }}>
        {description}
      </p>
      <div className="field">
        <label>Template name</label>
        <input
          className="input"
          value={label}
          maxLength={60}
          autoFocus
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={placeholder}
        />
      </div>
    </Modal>
  )
}
