// Map pings and colored cursors (T-102): pure helpers with no DOM or network.
// The transport lives in usePings.ts; the gesture recognizer in
// components/useBoardPings.ts. Design: docs/design-exploration/map-pings.md.

/** How long a ping ring stays on screen. */
export const PING_LIFE_MS = 2000
/** How long a cursor takes to fade after its owner releases the button. */
export const CURSOR_FADE_MS = 600
/** How far back the drag trail reaches. */
export const TRAIL_MS = 500
/** A cursor that stops updating fades after this long. */
export const CURSOR_IDLE_MS = 1500

/** Minimum gap between two pings from one user. */
export const PING_MIN_GAP_MS = 300
/** At most this many pings per user in `PING_WINDOW_MS`. */
export const PING_BURST = 10
export const PING_WINDOW_MS = 10_000
/** Receivers drop a sender that exceeds this many messages in the window. */
export const RECV_BURST = 24

/** Cursor send interval: 20 per second. Set to `CURSOR_INTERVAL_FREE_MS` for the free Realtime tier. */
export const CURSOR_INTERVAL_MS = 50
export const CURSOR_INTERVAL_FREE_MS = 84

export const MAX_PINGS = 8
export const MAX_PINGS_PER_SENDER = 3
export const MAX_CURSORS = 12

/** Pointer travel (screen px) that turns a right click into a cursor drag. */
export const DRAG_SLOP_PX = 6
/** A right click released later than this is not a ping. */
export const CLICK_MAX_MS = 350
/** Touch: hold this long (moving less than `TOUCH_SLOP_PX`) to ping. */
export const LONG_PRESS_MS = 400
export const TOUCH_SLOP_PX = 8

/** Okabe-Ito: the colorblind-safe fallback for users with no saved color. */
export const PING_PALETTE = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#FFFFFF']

export const DEFAULT_ACCENT = '#a78bfa'

export type PingMsg =
  | { t: 'p'; s: string; x: number; y: number; c: string; n: string; k: string; d: boolean; ts: number }
  | { t: 'c'; s: string; x: number; y: number; c: string; n: string; k: string; d: boolean; ts: number; end: boolean }
  | { t: 'ctl'; allow: boolean }
  | { t: 'hello' }

/** The private Broadcast channel for a campaign (all clients share one name). */
export const pingTopic = (campaignId: string) => `pings:${campaignId}`

/** A short scene key: a ping for another scene is ignored. */
export const sceneKey = (sceneId: string) => sceneId.slice(0, 8)

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** Saved color wins; else a stable palette pick by user id. */
export function colorFor(userId: string, saved?: string | null, fallback?: string | null): string {
  if (saved && HEX.test(saved)) return saved
  if (fallback && HEX.test(fallback)) return fallback
  return PING_PALETTE[hashString(userId) % PING_PALETTE.length]
}

/** A received color, or a stable palette pick when it is malformed. */
export function sanitizeColor(c: unknown, userId: string): string {
  return typeof c === 'string' && HEX.test(c) ? c : PING_PALETTE[hashString(userId) % PING_PALETTE.length]
}

export function sanitizeName(n: unknown): string {
  if (typeof n !== 'string') return 'Player'
  // eslint-disable-next-line no-control-regex
  const clean = n.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24)
  return clean || 'Player'
}

/** Marker shape per user, so color is never the only signal. */
export type MarkerShape = 'dot' | 'diamond' | 'square' | 'triangle'
const SHAPES: MarkerShape[] = ['dot', 'diamond', 'square', 'triangle']
export const markerFor = (userId: string): MarkerShape => SHAPES[hashString(userId) % SHAPES.length]

/** Halo color for a ping color: dark for light colors, white for dark ones. */
export function haloFor(color: string): string {
  const n = parseInt(color.slice(1), 16)
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 150 ? '#14121a' : '#ffffff'
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6

/** Validate an incoming payload; null for anything malformed. */
export function parseMsg(raw: unknown): PingMsg | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (m.t === 'hello') return { t: 'hello' }
  if (m.t === 'ctl') return typeof m.allow === 'boolean' ? { t: 'ctl', allow: m.allow } : null
  if ((m.t !== 'p' && m.t !== 'c') || !finite(m.x) || !finite(m.y) || typeof m.k !== 'string') return null
  const k = m.k.slice(0, 40)
  const base = {
    s: typeof m.s === 'string' ? m.s.slice(0, 8) : '',
    x: m.x,
    y: m.y,
    c: sanitizeColor(m.c, k),
    n: sanitizeName(m.n),
    k,
    d: m.d === true,
    ts: finite(m.ts) ? m.ts : 0,
  }
  return m.t === 'p' ? { t: 'p', ...base } : { t: 'c', ...base, end: m.end === true }
}

/**
 * Sliding-window limiter. `history` holds past send times (mutated). Returns
 * true and records `now` when a send is allowed.
 */
export function allowSend(history: number[], now: number, minGap: number, burst: number, windowMs: number): boolean {
  while (history.length && now - history[0] > windowMs) history.shift()
  if (history.length && now - history[history.length - 1] < minGap) return false
  if (history.length >= burst) return false
  history.push(now)
  return true
}

/** Pure form of the right-click versus drag decision (for tests). */
export function classifyRelease(dist: number, ms: number, wasDrag: boolean): 'ping' | 'cursor-end' | 'none' {
  if (wasDrag || dist > DRAG_SLOP_PX) return 'cursor-end'
  return ms <= CLICK_MAX_MS ? 'ping' : 'none'
}

// --- local preference -------------------------------------------------------

const PREF_KEY = 'dndcodex.mapPings'
const PREF_EVENT = 'dndcodex:mapPings'

export function readPingsPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

export function writePingsPref(on: boolean): void {
  try {
    if (on) localStorage.removeItem(PREF_KEY)
    else localStorage.setItem(PREF_KEY, 'off')
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
  window.dispatchEvent(new Event(PREF_EVENT))
}

export const PINGS_PREF_EVENT = PREF_EVENT

const DM_COLOR_KEY = 'dndcodex.pingColor'
export function readDmPingColor(): string | null {
  try {
    const c = localStorage.getItem(DM_COLOR_KEY)
    return c && HEX.test(c) ? c : null
  } catch {
    return null
  }
}
export function writeDmPingColor(c: string): void {
  try {
    localStorage.setItem(DM_COLOR_KEY, c)
  } catch {
    /* ignore */
  }
}
