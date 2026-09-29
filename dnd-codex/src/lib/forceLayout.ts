// A tiny, dependency-free force-directed layout for the thought map. Nodes repel
// each other (so labels don't pile up), edges act like springs pulling connected
// nodes together, and a gentle gravity keeps everything centered. One call to
// `stepLayout` advances the simulation a single frame; the component runs it in
// a requestAnimationFrame loop until it cools off.

export interface SimNode {
  key: string
  x: number
  y: number
  vx: number
  vy: number
  /** Fixed in place (the user dragged it, or it's being dragged now). */
  pinned: boolean
}

export interface SimEdge {
  fromKey: string
  toKey: string
}

const REPULSION = 9000 // node-node push
const SPRING_LEN = 90 // desired edge length
const SPRING_K = 0.02 // edge pull stiffness
const GRAVITY = 0.015 // pull toward center
const DAMPING = 0.85 // velocity retained each frame
const MAX_SPEED = 30

/** Seeds a node's starting position on a spiral so the layout unfolds smoothly. */
export function seedPosition(index: number, count: number, cx: number, cy: number): { x: number; y: number } {
  const golden = 2.399963 // golden angle (radians)
  const r = 24 + 14 * Math.sqrt(index + 1)
  const a = index * golden
  // Nudge by count so tiny graphs still spread a little.
  const spread = count <= 3 ? 60 : 1
  return { x: cx + Math.cos(a) * r * spread, y: cy + Math.sin(a) * r * spread }
}

/**
 * Advances the simulation one frame in place and returns the total kinetic
 * energy, which the caller uses to decide when the layout has settled.
 */
export function stepLayout(nodes: SimNode[], edges: SimEdge[], center: { x: number; y: number }): number {
  const byKey = new Map(nodes.map((n) => [n.key, n]))

  // Repulsion — every pair pushes apart (O(n^2); fine for campaign-sized graphs).
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]
      let dx = a.x - b.x
      let dy = a.y - b.y
      let d2 = dx * dx + dy * dy
      if (d2 < 0.01) {
        // Coincident — jitter deterministically by index to break symmetry.
        dx = (i - j) * 0.5 + 0.1
        dy = (i + j) % 2 === 0 ? 0.6 : -0.6
        d2 = dx * dx + dy * dy
      }
      const force = REPULSION / d2
      const d = Math.sqrt(d2)
      const fx = (dx / d) * force
      const fy = (dy / d) * force
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }
  }

  // Springs — connected nodes pull toward SPRING_LEN apart.
  for (const e of edges) {
    const a = byKey.get(e.fromKey)
    const b = byKey.get(e.toKey)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01
    const force = (d - SPRING_LEN) * SPRING_K
    const fx = (dx / d) * force
    const fy = (dy / d) * force
    a.vx += fx
    a.vy += fy
    b.vx -= fx
    b.vy -= fy
  }

  // Gravity toward center + integrate.
  let energy = 0
  for (const n of nodes) {
    if (n.pinned) {
      n.vx = 0
      n.vy = 0
      continue
    }
    n.vx += (center.x - n.x) * GRAVITY
    n.vy += (center.y - n.y) * GRAVITY
    n.vx *= DAMPING
    n.vy *= DAMPING
    const speed = Math.hypot(n.vx, n.vy)
    if (speed > MAX_SPEED) {
      n.vx = (n.vx / speed) * MAX_SPEED
      n.vy = (n.vy / speed) * MAX_SPEED
    }
    n.x += n.vx
    n.y += n.vy
    energy += n.vx * n.vx + n.vy * n.vy
  }
  return energy
}
