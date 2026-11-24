import { useEffect, useRef, useState } from 'react'
import { haloFor, markerFor, TRAIL_MS, type MarkerShape } from '../lib/pings'
import { useReducedMotion } from '../lib/useReducedMotion'
import type { CursorItem, PingsApi } from '../lib/usePings'

// SVG overlay for map pings and cursors (T-102). It renders inside the board's
// transformed group, so positions are board pixels and stay correct under any
// pan and zoom. Sizes divide by `scale` to keep a constant on-screen size.

function Marker({ shape, r, color, halo, sw }: { shape: MarkerShape; r: number; color: string; halo: string; sw: number }) {
  const common = { fill: color, stroke: halo, strokeWidth: sw, strokeLinejoin: 'round' as const }
  if (shape === 'diamond') return <polygon points={`0,${-r * 1.3} ${r * 1.3},0 0,${r * 1.3} ${-r * 1.3},0`} {...common} />
  if (shape === 'square') return <rect x={-r} y={-r} width={r * 2} height={r * 2} {...common} />
  if (shape === 'triangle') return <polygon points={`0,${-r * 1.3} ${r * 1.2},${r} ${-r * 1.2},${r}`} {...common} />
  return <circle r={r} {...common} />
}

function NameTag({ x, y, text, color, s }: { x: number; y: number; text: string; color: string; s: number }) {
  const fs = 11 / s
  const w = text.length * fs * 0.58 + fs * 1.6
  const h = fs * 1.6
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} className="ping-tag-bg" stroke={color} strokeWidth={1.5 / s} />
      <text className="ping-tag-text" fontSize={fs} textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
    </g>
  )
}

// A drag cursor: a filled circle in the user's color with a trail of the last
// TRAIL_MS of positions that tapers and fades. Reduced motion draws the circle only.
function CursorMark({ c, s, reduced }: { c: CursorItem; s: number; reduced: boolean }) {
  const trail = useRef<{ x: number; y: number; t: number }[]>([])
  const [, tick] = useState(0)
  const now = performance.now()
  const last = trail.current[trail.current.length - 1]
  if (!reduced && (!last || last.x !== c.x || last.y !== c.y)) trail.current.push({ x: c.x, y: c.y, t: now })
  trail.current = trail.current.filter((p) => now - p.t < TRAIL_MS)
  const pts = trail.current
  const animating = !reduced && pts.length > 1
  useEffect(() => {
    if (!animating) return
    const id = requestAnimationFrame(() => tick((n) => n + 1))
    return () => cancelAnimationFrame(id)
  })
  const halo = haloFor(c.color)
  return (
    <g className={`ping-cursor${c.ending ? ' ending' : ''}`}>
      {!reduced &&
        pts.slice(1).map((p, i) => {
          const a = pts[i]
          const f = Math.max(0, 1 - (now - p.t) / TRAIL_MS)
          return <line key={i} className="ping-trail" x1={a.x} y1={a.y} x2={p.x} y2={p.y} stroke={c.color} strokeOpacity={f * 0.8} strokeWidth={(2 + 10 * f) / s} strokeLinecap="round" />
        })}
      <g style={{ transform: `translate(${c.x}px, ${c.y}px)` }}>
        <g transform={`scale(${1 / s})`}>
          <circle className="ping-dot-mark" r={9} fill={c.color} stroke={halo} strokeWidth={2.5} />
          <NameTag x={20} y={20} text={c.name} color={c.color} s={1} />
        </g>
      </g>
    </g>
  )
}

export function PingLayer({ pings, scale, view }: { pings: PingsApi; scale: number; view: { tx: number; ty: number; w: number; h: number } }) {
  const reduced = useReducedMotion()
  if (!pings.enabled) return null
  const s = scale || 1
  return (
    <g className={`ping-layer${reduced ? ' reduced' : ''}`} pointerEvents="none" aria-hidden="true">
      {pings.items.map((p) => {
        const halo = haloFor(p.color)
        const shape = markerFor(p.k)
        // Off-screen indicator: a chevron on the viewport edge pointing at the ping.
        const sx = view.tx + p.x * s
        const sy = view.ty + p.y * s
        const off = sx < 0 || sy < 0 || sx > view.w || sy > view.h
        if (off && view.w > 0) {
          const ex = Math.min(Math.max(sx, 18), view.w - 18)
          const ey = Math.min(Math.max(sy, 18), view.h - 18)
          const ang = Math.atan2(sy - view.h / 2, sx - view.w / 2)
          const bx = (ex - view.tx) / s
          const by = (ey - view.ty) / s
          return (
            <g key={p.id} className="ping-edge" transform={`translate(${bx} ${by}) rotate(${(ang * 180) / Math.PI}) scale(${1 / s})`}>
              <polygon points="-9,-9 9,0 -9,9 -4,0" fill={p.color} stroke={halo} strokeWidth={2} strokeLinejoin="round" />
              <g transform={`rotate(${(-ang * 180) / Math.PI}) translate(0 -22)`}>
                <NameTag x={0} y={0} text={p.name} color={p.color} s={1} />
              </g>
            </g>
          )
        }
        return (
          <g key={p.id} className="ping" transform={`translate(${p.x} ${p.y})`}>
            <circle className="ping-ring" r={42 / s} fill="none" stroke={halo} strokeWidth={6} vectorEffect="non-scaling-stroke" />
            <circle className="ping-ring" r={42 / s} fill="none" stroke={p.color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
            <circle className="ping-ring ping-ring-2" r={26 / s} fill="none" stroke={p.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <Marker shape={shape} r={5 / s} color={p.color} halo={halo} sw={2 / s} />
            <NameTag x={0} y={-20 / s} text={p.name} color={p.color} s={s} />
          </g>
        )
      })}
      {pings.cursors.map((c) => (
        <CursorMark key={`${c.k}-${c.local ? 'l' : 'r'}`} c={c} s={s} reduced={reduced} />
      ))}
    </g>
  )
}
