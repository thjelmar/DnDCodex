// Shared two-finger pinch-zoom math for the pan/zoom map canvases (world map and
// battle map). Both boards use the same transform model — a scale `k` with a
// pixel translation `tx`/`ty` — so the gesture math lives here once.
//
// The canvases track active pointers themselves (a pointer id → client position
// map) and call pinchStart when a second finger lands, then pinchMove on each
// move while two fingers are down. The gesture zooms around the fingers' midpoint
// and pans as that midpoint moves, so the image point under the midpoint stays
// put — the natural "pinch and drag" feel.

export interface Xf {
  k: number
  tx: number
  ty: number
}

export interface Pt {
  x: number
  y: number
}

export interface PinchState {
  /** Distance between the two fingers when the gesture began. */
  dist: number
  /** Midpoint when the gesture began, in container-local coords. */
  cx: number
  cy: number
  /** The transform when the gesture began. */
  t0: Xf
}

const midpointDist = (p1: Pt, p2: Pt) => Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1

/** Capture the starting distance, midpoint (container-local) and transform. */
export function pinchStart(p1: Pt, p2: Pt, rect: DOMRect, t0: Xf): PinchState {
  return {
    dist: midpointDist(p1, p2),
    cx: (p1.x + p2.x) / 2 - rect.left,
    cy: (p1.y + p2.y) / 2 - rect.top,
    t0,
  }
}

/** Compute the transform for the current finger positions. `clampK` keeps the
 *  scale inside each board's allowed range. */
export function pinchMove(
  start: PinchState,
  p1: Pt,
  p2: Pt,
  rect: DOMRect,
  clampK: (k: number) => number,
): Xf {
  const dist = midpointDist(p1, p2)
  const curCx = (p1.x + p2.x) / 2 - rect.left
  const curCy = (p1.y + p2.y) / 2 - rect.top
  const k = clampK(start.t0.k * (dist / start.dist))
  const ratio = k / start.t0.k
  // Keep the image point that was under the starting midpoint under the current
  // midpoint, scaled — zoom around the fingers and pan with them.
  return {
    k,
    tx: curCx - (start.cx - start.t0.tx) * ratio,
    ty: curCy - (start.cy - start.t0.ty) * ratio,
  }
}
