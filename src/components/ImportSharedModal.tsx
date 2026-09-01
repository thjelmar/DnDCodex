import { useState } from 'react'
import { Modal } from './Modal'
import { decodeShare, importSharePacket, type SharePacket } from '../lib/share'
import type { Id, PlayerNoteSection } from '../db/types'

const SECTION_LABEL: Record<PlayerNoteSection, string> = {
  quests: 'Quest',
  notes: 'Loose Note',
  people: 'Person / Place',
  journal: 'Session Journal',
  character: 'My Character',
}
const SECTION_ICON: Record<PlayerNoteSection, string> = {
  quests: '⚔️',
  notes: '📝',
  people: '🧑',
  journal: '📓',
  character: '🧝',
}

/**
 * Player-side: paste a share code from the DM, preview what it adds, and import
 * it into this campaign (entries land in their sections and are wired together
 * on the player's map).
 */
export function ImportSharedModal({ campaignId, onClose }: { campaignId: Id; onClose: () => void }) {
  const [text, setText] = useState('')
  const [packet, setPacket] = useState<SharePacket | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ entries: number; connections: number } | null>(null)

  function preview(value: string) {
    setText(value)
    setDone(null)
    if (!value.trim()) {
      setPacket(null)
      setError('')
      return
    }
    const p = decodeShare(value)
    if (p) {
      setPacket(p)
      setError('')
    } else {
      setPacket(null)
      setError("That doesn't look like a valid share code. Paste the whole thing your DM sent.")
    }
  }

  async function doImport() {
    if (!packet) return
    const result = await importSharePacket(campaignId, packet)
    setDone(result)
  }

  return (
    <Modal
      title="⬇ Import from your DM"
      onClose={onClose}
      footer={
        done ? (
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={!packet} onClick={doImport}>
              Import
            </button>
          </>
        )
      }
    >
      {done ? (
        <div>
          <p>
            ✓ Added <strong>{done.entries}</strong> {done.entries === 1 ? 'entry' : 'entries'}
            {done.connections > 0 && (
              <>
                {' '}
                and <strong>{done.connections}</strong> connection{done.connections === 1 ? '' : 's'}
              </>
            )}
            . Find them in your sections and on your map.
          </p>
        </div>
      ) : (
        <>
          <div className="field">
            <label>Paste the share code from your DM</label>
            <textarea
              className="input"
              autoFocus
              value={text}
              onChange={(e) => preview(e.target.value)}
              placeholder="Paste the code here…"
              style={{ width: '100%', minHeight: 90, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
            />
            {error && <div className="danger-text" style={{ fontSize: 13, marginTop: 6 }}>{error}</div>}
          </div>

          {packet && (
            <div className="field">
              <label>This will add</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {packet.entries.map((e) => (
                  <div key={e.tempId} className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <span>{SECTION_ICON[e.section]}</span>
                    <span>{e.title}</span>
                    <span className="faint" style={{ fontSize: 12 }}>→ {SECTION_LABEL[e.section]}</span>
                  </div>
                ))}
              </div>
              {packet.connections.length > 0 && (
                <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
                  Plus {packet.connections.length} connection{packet.connections.length === 1 ? '' : 's'} on your map.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
