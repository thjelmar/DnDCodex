// Snap a rough, user-drawn grid estimate to the grid lines actually drawn on a
// battle-map image. Pure pixel math, no dependencies.
//
// Method: build a "thin line" profile per column and per row (the absolute
// second derivative of brightness, summed across the image; grid lines are thin
// and stand out from their neighbors on both sides, where soft art edges mostly
// don't). Then search square sizes near the estimate for the one whose evenly
// spaced lines land on the strongest profile peaks. Both axes share one size
// (squares), but each gets its own offset.

export interface DetectedGrid {
  cellPx: number
  offsetX: number
  offsetY: number
  /** How sharply the lines stood out (robust z-score, weaker axis); higher is surer. */
  confidence: number
}

/** Below this, the map probably has no drawn grid; keep the user's box. */
export const MIN_CONFIDENCE = 8
/** Share of predicted lines that must actually be there (a real grid: ~all). */
export const MIN_COVERAGE = 0.7

async function loadPixels(dataUrl: string): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { data, width: canvas.width, height: canvas.height }
}

/**
 * Column and row "thin line" profiles. Each pixel contributes a RIDGE response:
 * how much darker (or lighter) it is than BOTH neighbors 1–2px away. A one-sided
 * step (the edge of a wall, a tree) scores ~0, so busy art doesn't drown out
 * faint grid lines. Per-pixel responses are capped so a few high-contrast
 * features can't outvote a line that runs the whole map.
 */
function lineProfiles(data: Uint8ClampedArray, width: number, height: number) {
  const lum = new Float32Array(width * height)
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  const CAP = 24
  const ridge = (c: number, a1: number, b1: number, a2: number, b2: number) => {
    const dark = Math.max(Math.min(a1, b1) - c, Math.min(a2, b2) - c, 0)
    const light = Math.max(c - Math.max(a1, b1), c - Math.max(a2, b2), 0)
    return Math.min(CAP, Math.max(dark, light))
  }
  const cols = new Float64Array(width)
  const rows = new Float64Array(height)
  for (let y = 2; y < height - 2; y++) {
    const r = y * width
    for (let x = 2; x < width - 2; x++) {
      const i = r + x
      const c = lum[i]
      cols[x] += ridge(c, lum[i - 1], lum[i + 1], lum[i - 2], lum[i + 2])
      rows[y] += ridge(c, lum[i - width], lum[i + width], lum[i - 2 * width], lum[i + 2 * width])
    }
  }
  return { cols: Float32Array.from(cols), rows: Float32Array.from(rows) }
}

/** Light [1,2,1] blur so anti-aliased (2px-wide) lines still read as one peak. */
function smooth(a: Float32Array): Float32Array {
  const out = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) {
    out[i] = (a[Math.max(0, i - 1)] + 2 * a[i] + a[Math.min(a.length - 1, i + 1)]) / 4
  }
  return out
}

function sample(a: Float32Array, x: number): number {
  const i = Math.floor(x)
  if (i < 0 || i >= a.length - 1) return 0
  const t = x - i
  return a[i] * (1 - t) + a[i + 1] * t
}

function mean(a: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]
  return s / a.length || 1
}

/** Best offset for period `p` on one axis, and its mean score per line. */
function bestPhase(profile: Float32Array, p: number): { phase: number; score: number; z: number } {
  let best = { phase: 0, score: -1 }
  const step = 0.25
  const scores: number[] = []
  for (let phase = 0; phase < p; phase += step) {
    let sum = 0
    let n = 0
    for (let x = phase; x < profile.length; x += p) {
      sum += sample(profile, x)
      n++
    }
    const score = n ? sum / n : 0
    scores.push(score)
    if (score > best.score) best = { phase, score }
  }
  return { ...best, z: robustZ(best.score, scores) }
}

/**
 * How far `peak` stands above the other candidate offsets, in robust standard
 * deviations (median / MAD). Texture and noise lift every offset equally, so
 * they don't inflate this; a real grid makes one offset stand out sharply.
 */
function robustZ(peak: number, values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const med = sorted[Math.floor(sorted.length / 2)]
  const dev = values.map((v) => Math.abs(v - med)).sort((a, b) => a - b)
  const mad = dev[Math.floor(dev.length / 2)] * 1.4826
  return (peak - med) / (mad || 1e-6)
}

/**
 * Refine `estimateCellPx` (±12%) against the image. Returns null when nothing
 * grid-like is found.
 */
export async function detectGrid(
  dataUrl: string,
  estimateCellPx: number,
  minConfidence = MIN_CONFIDENCE,
): Promise<DetectedGrid | null> {
  const { data, width, height } = await loadPixels(dataUrl)
  if (width < 16 || height < 16) return null
  // Sweep on a lightly blurred profile (tolerant of anti-aliasing); fit on the
  // raw one (exact centroids).
  const raw = lineProfiles(data, width, height)
  const cols = smooth(raw.cols)
  const rows = smooth(raw.rows)
  const colMean = mean(cols)
  const rowMean = mean(rows)

  const scoreAt = (p: number) => {
    const x = bestPhase(cols, p)
    const y = bestPhase(rows, p)
    return { p, x, y, score: x.score / colMean + y.score / rowMean }
  }

  // Coarse sweep, then a fine one around the winner.
  const lo = Math.max(8, estimateCellPx * 0.88)
  const hi = estimateCellPx * 1.12
  let best = scoreAt(estimateCellPx)
  const coarse = Math.max(0.05, estimateCellPx / 400)
  for (let p = lo; p <= hi; p += coarse) {
    const s = scoreAt(p)
    if (s.score > best.score) best = s
  }
  for (let p = best.p - coarse; p <= best.p + coarse; p += coarse / 10) {
    const s = scoreAt(p)
    if (s.score > best.score) best = s
  }

  // Both axes must show a grid (the weaker one decides).
  const confidence = Math.min(best.x.z, best.y.z)
  if (confidence < minConfidence) return null

  // Sub-pixel refinement: find each line's centroid near its predicted spot,
  // then least-squares fit position = offset + k·size on each axis. This pins
  // the size to a fraction of a pixel, so there's no drift across the map.
  const fx = fitLines(raw.cols, best.p, best.x.phase)
  const fy = fitLines(raw.rows, best.p, best.y.phase)
  // A true grid has a line at (nearly) every predicted spot on both axes; a
  // chance match on art lines up with only a few.
  if (!fx || !fy || fx.coverage < MIN_COVERAGE || fy.coverage < MIN_COVERAGE) return null
  const cellPx = (fx.p + fy.p) / 2
  const round2 = (n: number) => Math.round(n * 100) / 100
  const norm = (o: number) => round2(((o % cellPx) + cellPx) % cellPx)
  return {
    cellPx: round2(cellPx),
    offsetX: norm(fx.offset),
    offsetY: norm(fy.offset),
    confidence,
  }
}

/**
 * Centroid each predicted line (in board coordinates, where pixel i spans
 * [i, i+1]) and fit a straight line through them. Returns null with too few
 * clear lines to trust.
 */
function fitLines(
  profile: Float32Array,
  p: number,
  phase: number,
): { p: number; offset: number; coverage: number } | null {
  const avg = mean(profile)
  const ks: number[] = []
  const cs: number[] = []
  const ws: number[] = []
  let predicted = 0
  const R = Math.max(2, Math.min(4, p * 0.1))
  for (let k = 0, x = phase; x < profile.length; k++, x = phase + k * p) {
    const lo = Math.max(0, Math.floor(x - R))
    const hi = Math.min(profile.length - 1, Math.ceil(x + R))
    predicted++
    let base = Infinity
    for (let i = lo; i <= hi; i++) base = Math.min(base, profile[i])
    let sw = 0
    let sx = 0
    for (let i = lo; i <= hi; i++) {
      const w = profile[i] - base
      sw += w
      sx += w * (i + 0.5)
    }
    // Only trust lines that clearly stand out from the map's average.
    if (sw <= 0 || profile[Math.round(x)] < avg * 1.5) continue
    ks.push(k)
    cs.push(sx / sw)
    ws.push(sw)
  }
  if (ks.length < 3) return null
  // Weighted least squares: c = offset + k·p.
  let W = 0, Sk = 0, Sc = 0, Skk = 0, Skc = 0
  for (let i = 0; i < ks.length; i++) {
    const w = ws[i]
    W += w; Sk += w * ks[i]; Sc += w * cs[i]; Skk += w * ks[i] * ks[i]; Skc += w * ks[i] * cs[i]
  }
  const den = W * Skk - Sk * Sk
  if (Math.abs(den) < 1e-9) return null
  const slope = (W * Skc - Sk * Sc) / den
  const offset = (Sc - slope * Sk) / W
  // Guard: the fit must agree with the sweep (it only refines, never jumps).
  if (Math.abs(slope - p) > p * 0.02) return null
  return { p: slope, offset, coverage: ks.length / predicted }
}
