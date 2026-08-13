import { useState } from 'react'

// Shown in place of an empty link picker: there's nothing of this kind to link
// yet. Clicking runs `onAdd`, which creates the entity, links it back to where
// you are, and navigates you to edit it (auto-create + pre-select).
export function AddLinkButton({ label, onAdd }: { label: string; onAdd: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      className="btn small"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await onAdd()
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? '…' : `＋ Add ${label}`}
    </button>
  )
}
