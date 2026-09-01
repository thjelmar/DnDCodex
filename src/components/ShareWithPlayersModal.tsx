import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { useAuth } from '../auth/AuthProvider'
import { getCampaignMembers, sendShareToMembers, type Member } from '../auth/cloud'
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
  campaignId,
  node,
  graph,
  onClose,
}: {
  campaignId: string
  node: GraphNode
  graph: CampaignGraph
  onClose: () => void
}) {
  const { user } = useAuth()
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

  // Joined players (excluding the DM), for account delivery.
  const [members, setMembers] = useState<Member[]>([])
  const [recipients, setRecipients] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [sentCount, setSentCount] = useState<number | null>(null)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getCampaignMembers(campaignId).then((all) => {
      if (cancelled) return
      const players = all.filter((m) => m.userId !== user.id)
      setMembers(players)
      setRecipients(new Set(players.map((p) => p.userId)))
    })
    return () => {
      cancelled = true
    }
  }, [campaignId, user])

  function toggle(key: string) {
    setIncluded((s) => {
      const next = new Set(s)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
    setCode(null)
  }

  function toggleRecipient(id: string) {
    setRecipients((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function buildPacket() {
    return buildSharePacket({ mainNode: node, mainSection, includeKeys: [...included], graph })
  }

  async function generate() {
    setCode(encodeShare(await buildPacket()))
    setCopied(false)
  }

  async function send() {
    if (!user || recipients.size === 0) return
    setSending(true)
    try {
      const packet = await buildPacket()
      const n = await sendShareToMembers(campaignId, user.id, [...recipients], packet.title, packet)
      setSentCount(n)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not send.')
    } finally {
      setSending(false)
    }
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

      {user && members.length > 0 && (
        <div className="field">
          <label>Send to players in this campaign</label>
          {sentCount != null ? (
            <div style={{ fontSize: 13 }}>
              ✓ Sent to {sentCount} player{sentCount === 1 ? '' : 's'}. They'll see it under “Shared with you”.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {members.map((m) => (
                  <label key={m.userId} className="row" style={{ gap: 8, cursor: 'pointer', alignItems: 'center' }}>
                    <input type="checkbox" checked={recipients.has(m.userId)} onChange={() => toggleRecipient(m.userId)} />
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" width={18} height={18} style={{ borderRadius: '50%' }} />
                    ) : (
                      <span aria-hidden>👤</span>
                    )}
                    <span>{m.displayName}</span>
                  </label>
                ))}
              </div>
              <button
                className="btn small primary"
                style={{ marginTop: 8 }}
                disabled={sending || recipients.size === 0}
                onClick={send}
              >
                {sending ? 'Sending…' : `📤 Send to ${recipients.size} player${recipients.size === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </div>
      )}

      {user && members.length === 0 && (
        <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>
          No players have joined this campaign yet — invite them from the overview, or share a code below.
        </div>
      )}

      {code && (
        <div className="field">
          <label>Share code — for players who haven’t joined</label>
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
