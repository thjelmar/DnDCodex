import { useState } from 'react'
import { Modal } from './Modal'
import {
  REVEAL_CONFIRM_KEY,
  SHAREABLE_KINDS,
  clearShareDefaults,
  isConfirmSkipped,
  loadShareDefaults,
  sectionLabel,
  setConfirmSkip,
} from '../lib/prefs'
import type { ShareableKind } from '../lib/reveal'

const KIND_LABEL: Record<ShareableKind, string> = {
  npc: 'NPCs',
  location: 'Locations',
  note: 'Notes',
  session: 'Sessions',
  item: 'Items',
}

/**
 * Per-browser preferences: reset the "don't ask again" reveal prompt and the
 * per-kind "sections I usually share" defaults. localStorage isn't reactive, so
 * the panel mirrors each preference into state and writes through on change.
 */
export function PreferencesModal({ onClose }: { onClose: () => void }) {
  const [askReveal, setAskReveal] = useState(() => !isConfirmSkipped(REVEAL_CONFIRM_KEY))
  const [defaults, setDefaults] = useState<Record<ShareableKind, string[] | null>>(() => {
    const d = {} as Record<ShareableKind, string[] | null>
    for (const k of SHAREABLE_KINDS) d[k] = loadShareDefaults(k)
    return d
  })

  function toggleAskReveal(next: boolean) {
    setConfirmSkip(REVEAL_CONFIRM_KEY, !next) // "skip" is the inverse of "ask"
    setAskReveal(next)
  }

  function resetDefault(kind: ShareableKind) {
    clearShareDefaults(kind)
    setDefaults((d) => ({ ...d, [kind]: null }))
  }

  function resetAllDefaults() {
    for (const k of SHAREABLE_KINDS) clearShareDefaults(k)
    const cleared = {} as Record<ShareableKind, string[] | null>
    for (const k of SHAREABLE_KINDS) cleared[k] = null
    setDefaults(cleared)
  }

  const anyDefaults = SHAREABLE_KINDS.some((k) => defaults[k] != null)

  return (
    <Modal
      title="Preferences"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="prefs-section">
        <div className="prefs-section-title">Confirmation prompts</div>
        <label className="row" style={{ gap: 10, cursor: 'pointer', alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={askReveal}
            onChange={(e) => toggleAskReveal(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <div>Ask before revealing a spoiler on a shared entity</div>
            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
              When on, un-hiding spoilered text on an entity that's already shared asks for
              confirmation first. Turn off to skip it (the same as ticking “Don't ask again”).
            </div>
          </span>
        </label>
      </div>

      <div className="prefs-section">
        <div className="row between" style={{ alignItems: 'center' }}>
          <div className="prefs-section-title" style={{ margin: 0 }}>
            Default shared sections
          </div>
          <button className="btn ghost small" onClick={resetAllDefaults} disabled={!anyDefaults}>
            Reset all
          </button>
        </div>
        <div className="faint" style={{ fontSize: 12, margin: '4px 0 10px' }}>
          Ticking “Make these my default” in a share picker remembers the choice here and
          pre-selects it next time. Reset a kind to fall back to sharing all its sections.
        </div>
        {SHAREABLE_KINDS.map((kind) => {
          const keys = defaults[kind]
          return (
            <div key={kind} className="prefs-row">
              <div className="prefs-row-label">{KIND_LABEL[kind]}</div>
              <div className="prefs-row-value">
                {keys == null ? (
                  <span className="faint" style={{ fontSize: 12 }}>
                    All sections
                  </span>
                ) : keys.length === 0 ? (
                  <span className="faint" style={{ fontSize: 12 }}>
                    None
                  </span>
                ) : (
                  keys.map((k) => (
                    <span key={k} className="pushchanges-sectag">
                      {sectionLabel(kind, k)}
                    </span>
                  ))
                )}
              </div>
              <button
                className="btn ghost small"
                onClick={() => resetDefault(kind)}
                disabled={keys == null}
              >
                Reset
              </button>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
