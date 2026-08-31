import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Modal } from './Modal'
import { createLink, deleteLink } from '../db/repo'
import {
  buildCampaignGraph,
  connectedKeys,
  KIND_META,
  NODE_KINDS,
  type CampaignGraph,
  type GraphNode,
  type NodeKind,
} from '../lib/graph'
import { seedPosition, stepLayout, type SimNode } from '../lib/forceLayout'
import type { Id } from '../db/types'

interface Transform {
  tx: number
  ty: number
  k: number
}

/**
 * The campaign "thought map" — a force-directed web of every NPC, location,
 * item, note and session, wired together by the connections the DM has drawn
 * plus the structural links implied by the data. Pan/zoom to explore, drag to
 * arrange, click a node to focus on its neighborhood, and add or cut
 * connections right on the canvas (they persist to the same links the rest of
 * the app reads).
 */
export function ThoughtMap({ campaignId }: { campaignId: Id }) {
  const graph = useLiveQuery(() => buildCampaignGraph(campaignId), [campaignId])

  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // Simulation node positions, preserved across data changes.
  const posRef = useRef<Map<string, SimNode>>(new Map())
  const heatRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const [, forceRender] = useState(0)

  const [transform, setTransform] = useState<Transform>({ tx: 0, ty: 0, k: 1 })
  const [selected, setSelected] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<NodeKind>>(new Set())
  const [showGaps, setShowGaps] = useState(false)
  // The node currently under a bubble being dragged (a drop here creates a link).
  const [linkTarget, setLinkTarget] = useState<string | null>(null)
  // Pending "describe the relationship" popup after a link drop.
  const [linkDraft, setLinkDraft] = useState<{ fromKey: string; toKey: string } | null>(null)

  const center = { x: size.w / 2, y: size.h / 2 }
  const centerRef = useRef(center)
  centerRef.current = center

  // Visible subgraph after kind filters.
  const view = useMemo<CampaignGraph>(() => {
    if (!graph) return { nodes: [], edges: [] }
    const nodes = graph.nodes.filter((n) => !hidden.has(n.kind))
    const keep = new Set(nodes.map((n) => n.key))
    const edges = graph.edges.filter((e) => keep.has(e.fromKey) && keep.has(e.toKey))
    return { nodes, edges }
  }, [graph, hidden])

  const nodeByKey = useMemo(() => new Map(view.nodes.map((n) => [n.key, n])), [view])
  const connected = useMemo(() => connectedKeys(view), [view])

  const reheat = (frames = 260) => {
    heatRef.current = Math.max(heatRef.current, frames)
    if (rafRef.current == null) tick()
  }

  // Reconcile positions when the visible node set changes, then reheat.
  const keySig = view.nodes.map((n) => n.key).sort().join(',')
  useEffect(() => {
    const pos = posRef.current
    const seen = new Set<string>()
    view.nodes.forEach((n, i) => {
      seen.add(n.key)
      if (!pos.has(n.key)) {
        const p = seedPosition(i, view.nodes.length, centerRef.current.x, centerRef.current.y)
        pos.set(n.key, { key: n.key, x: p.x, y: p.y, vx: 0, vy: 0, pinned: false })
      }
    })
    for (const k of [...pos.keys()]) if (!seen.has(k)) pos.delete(k)
    reheat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig])

  function tick() {
    const sim = view.nodes.map((n) => posRef.current.get(n.key)!).filter(Boolean)
    const energy = stepLayout(sim, view.edges, centerRef.current)
    forceRender((n) => n + 1)
    heatRef.current -= 1
    if (heatRef.current > 0 && energy > 0.05) {
      rafRef.current = requestAnimationFrame(tick)
    } else {
      rafRef.current = null
    }
  }
  // Keep the loop reading fresh edges/nodes each frame via a ref to `view`.
  const viewRef = useRef(view)
  viewRef.current = view
  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }, [])

  // --- Pointer interactions (pan, node drag, zoom) ---
  const drag = useRef<
    | { kind: 'pan'; startX: number; startY: number; tx: number; ty: number }
    | { kind: 'node'; key: string; moved: boolean; startX: number; startY: number; prevPinned: boolean }
    | null
  >(null)

  // How close (in world units) a dragged bubble's center must come to another
  // bubble to count as "dropped on" it. A little larger than the node radius.
  const LINK_RADIUS = 20

  /** Nearest other node whose center is within LINK_RADIUS of (x, y). */
  function nodeNear(x: number, y: number, exceptKey: string): string | null {
    let best = LINK_RADIUS
    let hit: string | null = null
    for (const other of viewRef.current.nodes) {
      if (other.key === exceptKey) continue
      const op = posRef.current.get(other.key)
      if (!op) continue
      const dist = Math.hypot(op.x - x, op.y - y)
      if (dist < best) {
        best = dist
        hit = other.key
      }
    }
    return hit
  }

  const toWorld = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect()
    return {
      x: (clientX - rect.left - transform.tx) / transform.k,
      y: (clientY - rect.top - transform.ty) / transform.k,
    }
  }

  function onBgPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, tx: transform.tx, ty: transform.ty }
  }
  function onNodePointerDown(e: React.PointerEvent, node: GraphNode) {
    e.stopPropagation()
    if (e.button !== 0) return
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    const p = posRef.current.get(node.key)
    const prevPinned = p?.pinned ?? false
    if (p) p.pinned = true
    // Freeze the simulation while dragging so the target bubbles hold still
    // (essential for aiming a drop). It reheats on release.
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    heatRef.current = 0
    drag.current = { kind: 'node', key: node.key, moved: false, startX: p?.x ?? 0, startY: p?.y ?? 0, prevPinned }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    if (d.kind === 'pan') {
      setTransform((t) => ({ ...t, tx: d.tx + (e.clientX - d.startX), ty: d.ty + (e.clientY - d.startY) }))
    } else {
      const w = toWorld(e.clientX, e.clientY)
      const p = posRef.current.get(d.key)
      if (p) {
        p.x = w.x
        p.y = w.y
        p.vx = 0
        p.vy = 0
        d.moved = true
        setLinkTarget(nodeNear(w.x, w.y, d.key))
        // Re-render to follow the cursor without advancing physics (frozen while
        // dragging), so other bubbles stay put and can be aimed at.
        forceRender((n) => n + 1)
      }
    }
  }
  function onPointerUp() {
    const d = drag.current
    if (d?.kind === 'node') {
      const p = posRef.current.get(d.key)
      // Dropped onto another bubble → offer to describe the relationship, and
      // return the dragged bubble to where it started (a link gesture, not a move).
      const target = d.moved && p ? nodeNear(p.x, p.y, d.key) : null
      if (target && p) {
        p.x = d.startX
        p.y = d.startY
        p.pinned = d.prevPinned
        setLinkDraft({ fromKey: d.key, toKey: target })
      } else if (!d.moved) {
        setSelected((s) => (s === d.key ? null : d.key))
      }
      // Let the layout settle around the drag's outcome.
      reheat(160)
    }
    setLinkTarget(null)
    drag.current = null
  }
  function onBgPointerUp() {
    if (drag.current?.kind === 'pan') setSelected(null)
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const rect = wrapRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setTransform((t) => {
      const k = Math.min(2.5, Math.max(0.25, t.k * (e.deltaY < 0 ? 1.12 : 0.893)))
      // Keep the point under the cursor fixed while zooming.
      const wx = (mx - t.tx) / t.k
      const wy = (my - t.ty) / t.k
      return { k, tx: mx - wx * k, ty: my - wy * k }
    })
  }

  function zoomBy(factor: number) {
    setTransform((t) => {
      const k = Math.min(2.5, Math.max(0.25, t.k * factor))
      const wx = (center.x - t.tx) / t.k
      const wy = (center.y - t.ty) / t.k
      return { k, tx: center.x - wx * k, ty: center.y - wy * k }
    })
  }
  function recenter() {
    for (const p of posRef.current.values()) p.pinned = false
    setTransform({ tx: 0, ty: 0, k: 1 })
    reheat(320)
  }

  function toggleKind(kind: NodeKind) {
    setHidden((h) => {
      const next = new Set(h)
      next.has(kind) ? next.delete(kind) : next.add(kind)
      return next
    })
  }

  // Neighborhood of the selected node, for focus highlighting.
  const neighborhood = useMemo(() => {
    if (!selected) return null
    const near = new Set<string>([selected])
    for (const e of view.edges) {
      if (e.fromKey === selected) near.add(e.toKey)
      if (e.toKey === selected) near.add(e.fromKey)
    }
    return near
  }, [selected, view])

  const pos = posRef.current
  const selectedNode = selected ? nodeByKey.get(selected) ?? null : null

  return (
    <div>
      <div className="row wrap between" style={{ gap: 10, marginBottom: 10, alignItems: 'center' }}>
        <div className="row wrap" style={{ gap: 6 }}>
          {NODE_KINDS.map((kind) => {
            const on = !hidden.has(kind)
            const meta = KIND_META[kind]
            return (
              <button
                key={kind}
                className="btn ghost small"
                onClick={() => toggleKind(kind)}
                style={{
                  opacity: on ? 1 : 0.4,
                  borderColor: on ? meta.color : 'var(--border)',
                  display: 'inline-flex',
                  gap: 5,
                  alignItems: 'center',
                }}
                title={on ? `Hide ${meta.label}` : `Show ${meta.label}`}
              >
                <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
                {meta.label}
              </button>
            )
          })}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            className="btn ghost small"
            onClick={() => setShowGaps((g) => !g)}
            style={{ borderColor: showGaps ? 'var(--danger)' : 'var(--border)', color: showGaps ? 'var(--danger)' : undefined }}
            title="Highlight entries that aren't connected to anything yet"
          >
            ⚠ Lore gaps
          </button>
          <button className="btn ghost small" onClick={() => zoomBy(1.2)} title="Zoom in">＋</button>
          <button className="btn ghost small" onClick={() => zoomBy(0.833)} title="Zoom out">－</button>
          <button className="btn ghost small" onClick={recenter} title="Reset the layout and view">Recenter</button>
        </div>
      </div>

      <div className="row" style={{ gap: 12, alignItems: 'stretch' }}>
        <div
          ref={wrapRef}
          onPointerDown={onBgPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { onPointerUp(); onBgPointerUp() }}
          onWheel={onWheel}
          style={{
            position: 'relative',
            flex: 1,
            height: '70vh',
            minHeight: 440,
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
            cursor: drag.current?.kind === 'pan' ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
        >
          {graph && view.nodes.length === 0 && (
            <div className="empty" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="big">🕸️</div>
              <p className="faint">
                {graph.nodes.length === 0
                  ? 'Add some NPCs, locations, notes or sessions and they’ll appear here to connect.'
                  : 'Everything is hidden — re-enable a category above.'}
              </p>
            </div>
          )}

          <svg width="100%" height="100%" style={{ display: 'block' }}>
            <g transform={`translate(${transform.tx},${transform.ty}) scale(${transform.k})`}>
              {/* Edges */}
              {view.edges.map((e) => {
                const a = pos.get(e.fromKey)
                const b = pos.get(e.toKey)
                if (!a || !b) return null
                const incident = selected != null && (e.fromKey === selected || e.toKey === selected)
                const dim = neighborhood != null && !incident
                const showLabel = incident || (!e.derived && neighborhood == null)
                const mx = (a.x + b.x) / 2
                const my = (a.y + b.y) / 2
                return (
                  <g key={e.key} style={{ opacity: dim ? 0.08 : e.derived ? 0.5 : 0.85 }}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={incident ? 'var(--accent)' : 'var(--text-faint)'}
                      strokeWidth={incident ? 2 : 1.2}
                      strokeDasharray={e.derived ? '4 4' : undefined}
                    />
                    {showLabel && (
                      <text
                        x={mx}
                        y={my}
                        textAnchor="middle"
                        dy={-3}
                        style={{ fontSize: 9, fill: 'var(--text-dim)', paintOrder: 'stroke', stroke: 'var(--bg-elev)', strokeWidth: 3 }}
                      >
                        {e.label}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Nodes */}
              {view.nodes.map((n) => {
                const p = pos.get(n.key)
                if (!p) return null
                const meta = KIND_META[n.kind]
                const isSel = n.key === selected
                const isLinkTarget = n.key === linkTarget
                const dim = neighborhood != null && !neighborhood.has(n.key) && !isLinkTarget
                const gap = showGaps && !connected.has(n.key)
                const r = isSel || isLinkTarget ? 13 : 10
                return (
                  <g
                    key={n.key}
                    transform={`translate(${p.x},${p.y})`}
                    onPointerDown={(e) => onNodePointerDown(e, n)}
                    style={{ cursor: 'pointer', opacity: dim ? 0.28 : 1 }}
                  >
                    {gap && <circle r={r + 6} fill="none" stroke="var(--danger)" strokeWidth={1.5} strokeDasharray="3 3" />}
                    {isLinkTarget && <circle r={r + 8} fill="var(--accent)" opacity={0.18} />}
                    <circle
                      r={r}
                      fill={meta.color}
                      stroke={isLinkTarget ? 'var(--accent)' : isSel ? 'var(--text)' : 'var(--bg)'}
                      strokeWidth={isLinkTarget || isSel ? 2.5 : 2}
                    />
                    <text textAnchor="middle" dy={4} style={{ fontSize: 11, pointerEvents: 'none' }}>
                      {meta.icon}
                    </text>
                    <text
                      textAnchor="middle"
                      y={r + 13}
                      style={{
                        fontSize: 11,
                        fontWeight: isSel ? 600 : 400,
                        fill: 'var(--text)',
                        paintOrder: 'stroke',
                        stroke: 'var(--bg-elev)',
                        strokeWidth: 3,
                        pointerEvents: 'none',
                      }}
                    >
                      {n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>

          <div className="faint" style={{ position: 'absolute', left: 10, bottom: 8, fontSize: 11, pointerEvents: 'none' }}>
            Drag to pan · scroll to zoom · drop a bubble onto another to link them · click to focus
          </div>
        </div>

        {selectedNode && (
          <NodePanel
            campaignId={campaignId}
            node={selectedNode}
            graph={view}
            nodeByKey={nodeByKey}
            onClose={() => setSelected(null)}
            onPick={(key) => setSelected(key)}
          />
        )}
      </div>

      {linkDraft && nodeByKey.get(linkDraft.fromKey) && nodeByKey.get(linkDraft.toKey) && (
        <RelationshipModal
          campaignId={campaignId}
          from={nodeByKey.get(linkDraft.fromKey)!}
          to={nodeByKey.get(linkDraft.toKey)!}
          onClose={() => setLinkDraft(null)}
        />
      )}
    </div>
  )
}

/** Popup shown after dropping one bubble onto another: name the relationship,
 *  then persist it as a link. */
function RelationshipModal({
  campaignId,
  from,
  to,
  onClose,
}: {
  campaignId: Id
  from: GraphNode
  to: GraphNode
  onClose: () => void
}) {
  const [label, setLabel] = useState('')
  const [swap, setSwap] = useState(false)
  const a = swap ? to : from
  const b = swap ? from : to

  async function save() {
    await createLink(campaignId, a.kind, a.id, b.kind, b.id, label.trim() || 'related to')
    onClose()
  }

  return (
    <Modal
      title="Describe the connection"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Connect
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <span className="tag">{KIND_META[a.kind].icon} {a.name}</span>
        <button
          className="btn ghost small"
          onClick={() => setSwap((s) => !s)}
          title="Swap direction"
          style={{ padding: '2px 8px' }}
        >
          →⇄
        </button>
        <span className="tag">{KIND_META[b.kind].icon} {b.name}</span>
      </div>
      <div className="field">
        <label>{a.name} …</label>
        <input
          className="input"
          autoFocus
          placeholder="relationship (e.g. serves, allied with, betrayed)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </div>
      <div className="faint" style={{ fontSize: 12 }}>
        Reads as “{a.name} <strong>{label.trim() || 'related to'}</strong> {b.name}”. Use ⇄ to flip the direction.
      </div>
    </Modal>
  )
}

/** Detail sidebar for the focused node: where to open it, its connections, and
 *  an inline form to wire it to another entity. */
function NodePanel({
  campaignId,
  node,
  graph,
  nodeByKey,
  onClose,
  onPick,
}: {
  campaignId: Id
  node: GraphNode
  graph: CampaignGraph
  nodeByKey: Map<string, GraphNode>
  onClose: () => void
  onPick: (key: string) => void
}) {
  const meta = KIND_META[node.kind]
  const conns = graph.edges
    .filter((e) => e.fromKey === node.key || e.toKey === node.key)
    .map((e) => {
      const otherKey = e.fromKey === node.key ? e.toKey : e.fromKey
      return { edge: e, other: nodeByKey.get(otherKey) }
    })
    .filter((c) => c.other)

  const [label, setLabel] = useState('')
  const [targetKey, setTargetKey] = useState('')
  const options = graph.nodes.filter((n) => n.key !== node.key)

  async function addConnection() {
    const target = nodeByKey.get(targetKey)
    if (!target) return
    await createLink(campaignId, node.kind, node.id, target.kind, target.id, label.trim() || 'related to')
    setLabel('')
    setTargetKey('')
  }

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 14,
        maxHeight: '70vh',
        overflowY: 'auto',
      }}
    >
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 8 }}>
          <span aria-hidden style={{ width: 12, height: 12, borderRadius: '50%', background: meta.color, marginTop: 5 }} />
          <div>
            <div style={{ fontWeight: 600, fontFamily: 'var(--serif)', fontSize: 17 }}>{node.name}</div>
            {node.sub && <div className="faint" style={{ fontSize: 12, textTransform: 'capitalize' }}>{node.sub}</div>}
          </div>
        </div>
        <button className="btn ghost small" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <Link
        to={`/campaign/${campaignId}/${node.section}?sel=${node.id}`}
        className="btn small"
        style={{ marginTop: 10, display: 'inline-block' }}
      >
        Open {meta.icon} →
      </Link>

      <div className="sidebar-heading" style={{ margin: '16px 0 6px' }}>
        Connections {conns.length > 0 && <span className="faint">({conns.length})</span>}
      </div>
      {conns.length === 0 && <div className="faint" style={{ fontSize: 13 }}>No connections yet — add one below.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {conns.map(({ edge, other }) => (
          <div key={edge.key} className="row between" style={{ gap: 6 }}>
            <button
              onClick={() => onPick(other!.key)}
              style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--text)', padding: 0, minWidth: 0 }}
            >
              <span className="faint" style={{ fontSize: 11 }}>{edge.label}</span>
              <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {KIND_META[other!.kind].icon} {other!.name}
              </div>
            </button>
            {edge.derived ? (
              <span className="tag" style={{ fontSize: 10 }} title="Inferred from this entry's fields">auto</span>
            ) : (
              <button
                onClick={() => edge.linkId && deleteLink(edge.linkId)}
                aria-label="Remove connection"
                style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar-heading" style={{ margin: '16px 0 6px' }}>Add a connection</div>
      <input
        className="input"
        style={{ width: '100%', marginBottom: 6 }}
        placeholder="relationship (e.g. serves)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <select className="select" style={{ width: '100%', marginBottom: 6 }} value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>
        <option value="">Link to…</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {KIND_META[o.kind].icon} {o.name}
          </option>
        ))}
      </select>
      <button className="btn small primary" style={{ width: '100%' }} disabled={!targetKey} onClick={addConnection}>
        ＋ Connect
      </button>
    </div>
  )
}
