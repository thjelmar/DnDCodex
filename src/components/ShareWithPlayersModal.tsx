import { useState } from 'react'
import { Modal } from './Modal'
import { KIND_META, type CampaignGraph, type GraphNode, type NodeKind } from '../lib/graph'
import { buildSharePacket, defaultSectionForKind, encodeShare } from '../lib/share'
import type { PlayerNoteSection } from '../db/types'

const SECTION_LABEL: Record<PlayerNoteSection, string> = {
  quests: 'Quest',
  notes: 'Loose Note',
  people: 'Person / Place',
  journal: 'Session Journal',
  character: 'My Character',
}
const MAIN_SECTIONS: PlayerNoteSection[] = ['quests', 'notes', 'people']

/**
 * DM-side dialog: package a node (a quest note, an NPC…) plus whichever
 * connected bubbles the DM ticks into a share code to hand to players. Only the
 * player-safe fields travel; DM-only notes/stat blocks never leave.
 */
export function ShareWithPlayersModal({
  node,
  graph,
  onClose,
}: {
  node: GraphNode
  graph: CampaignGraph
  onClose: () => void
}) {
  const neighbors = graph.edges
    .filter((e) => e.fromKey === node.key || e.toKey === node.key)
    .map((e) => (e.fromKey === node.key ? e.toKey : e.fromKey))
    .filter((k, i, a) => a.indexOf(k) === i)
    .map((k) => graph.nodes.find((n) => n.key === k))
    .filter((n): n is GraphNode => Boolean(n))

  const [mainSection, setMainSection] = useState<PlayerNoteSection>(defaultSectionForKind(node.kind))
  const [included, setIncluded] = useState<Set<string>>(() => new Set(neighbors.map((n) => n.key)))
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function toggle(key: string) {
    setIncluded((s) => {
      const next = new Set(s)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
    setCode(null)
  }

  async function generate() {
    const packet = await buildSharePacket({
      mainNode: node,
      mainSection,
      includeKeys: [...included],
      graph,
    })
    setCode(encodeShare(packet))
    setCopied(false)
  }

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      /* clipboard blocked — the DM can still select the text manually */
    }
  }

  return (
    <Modal
      title="📤 Share with players"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          {code ? (
            <button className="btn primary" onClick={copy}>
              {copied ? '✓ Copied' : 'Copy share code'}
            </button>
          ) : (
            <button className="btn primary" onClick={generate}>
              Generate share code
            </button>
          )}
        </>
      }
    >
      <div className="field">
        <label>Share “{node.name}” as</label>
        <select
          className="select"
          value={mainSection}
          onChange={(e) => {
            setMainSection(e.target.value as PlayerNoteSection)
            setCode(null)
          }}
        >
          {MAIN_SECTIONS.map((s) => (
            <option key={s} value={s}>
              {SECTION_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {neighbors.length > 0 && (
        <div className="field">
          <label>Also include its connections</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {neighbors.map((n) => (
              <label key={n.key} className="row" style={{ gap: 8, cursor: 'pointer', alignItems: 'center' }}>
                <input type="checkbox" checked={included.has(n.key)} onChange={() => toggle(n.key)} />
                <span>
                  {KIND_META[n.kind as NodeKind]?.icon} {n.name}
                </span>
                <span className="faint" style={{ fontSize: 12 }}>
                  → {SECTION_LABEL[defaultSectionForKind(n.kind)]}
                </span>
              </label>
            ))}
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
            Only what you tick is shared. Your private DM notes and stat blocks never leave.
          </div>
        </div>
      )}

      {code && (
        <div className="field">
          <label>Share code — send this to your players</label>
          <textarea
            className="input"
            readOnly
            value={code}
            onFocus={(e) => e.currentTarget.select()}
            style={{ width: '100%', minHeight: 90, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
          />
          <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
            They paste it into <strong>Import from your DM</strong> on their campaign home.
          </div>
        </div>
      )}
    </Modal>
  )
}
