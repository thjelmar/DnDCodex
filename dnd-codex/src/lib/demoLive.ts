import { useSyncExternalStore } from 'react'
import { DEMO_CLOUD_ID, DEMO_PLAYER_ID, isDemo } from './demo'
import type { LiveCombat, LiveCombatRow } from '../auth/liveCombat'
import type { LiveScene, LiveToken, LivePlayerTemplate } from '../auth/liveScene'
import type { LiveSession, SharedImage } from '../auth/cloud'
import type { HealthMarker } from './liveCombat'
import type { PingMsg } from './pings'
import { DEMO_IMG_DECREE } from '../data/demoSeedImages'

// A local fake of the live-session layer, for the demo only. The real layer reads
// shared_scenes, shared_combat and friends over Supabase Realtime; the demo has no
// backend (the client is null, see lib/supabase.ts), so the same hooks and player
// actions read and write this in-memory store instead. The player UI is the real
// one. A "Demo controls" strip plays the DM (see components/DemoLiveControls.tsx).
// Nothing here is persisted: a reload resets it, and nothing touches the network.

const SCENE_ID = 'demo-scene-cellar'
const W = 1400
const H = 980
const CELL = 70

const T_HERO = 'demo-tok-hero'
const T_ALLY = 'demo-tok-ally'
const T_GOB = 'demo-tok-goblin'
const T_BOSS = 'demo-tok-boss'
const T_CRATE = 'demo-tok-crate'
const ALLY_USER = 'demo-ally-user'

/** A cellar floor drawn as an inline SVG, so the demo needs no image asset. */
function mapSvgUrl(): string {
  const tiles: string[] = []
  for (let r = 0; r < H / CELL; r++)
    for (let c = 0; c < W / CELL; c++)
      tiles.push(`<rect x="${c * CELL}" y="${r * CELL}" width="${CELL}" height="${CELL}" fill="${(r + c) % 2 ? '#4a4540' : '#554f49'}"/>`)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    tiles.join('') +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#2a2622" stroke-width="28"/>` +
    // Tables, barrels and a rug, so the room reads as a cellar tavern.
    `<rect x="560" y="280" width="280" height="140" rx="10" fill="#7a5230" stroke="#3b2713" stroke-width="6"/>` +
    `<rect x="420" y="560" width="140" height="210" rx="10" fill="#7a5230" stroke="#3b2713" stroke-width="6"/>` +
    `<circle cx="1180" cy="210" r="48" fill="#6b4423" stroke="#3b2713" stroke-width="6"/>` +
    `<circle cx="1180" cy="330" r="48" fill="#6b4423" stroke="#3b2713" stroke-width="6"/>` +
    `<rect x="840" y="600" width="350" height="210" rx="14" fill="#7f2d2d" opacity="0.55"/>` +
    `<text x="${W / 2}" y="${H - 50}" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#d8cdb8" opacity="0.6">Demo battle map: the Gilded Stag cellar</text>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export interface DemoLiveState {
  /** True while the faux session is running (the page shows "Live"). */
  live: boolean
  session: LiveSession | null
  scene: LiveScene | null
  tokens: LiveToken[]
  mapUrl: string | null
  combat: LiveCombat | null
  templates: LivePlayerTemplate[]
  handouts: SharedImage[]
  myColor: string | null
  /** Hidden enemy hit points, by combatant id. Players never see these. */
  enemyHp: Record<string, { hp: number; maxHp: number }>
  /** What the DM did last, for the controls strip. */
  log: string[]
}

function initial(): DemoLiveState {
  const tokens: LiveToken[] = [
    { id: T_HERO, label: 'Thalia', color: '#2563eb', col: 4, row: 7, size: 1, portrait: null, icon: null, shape: null, controlledBy: DEMO_PLAYER_ID, combat: null, speedFt: 30 },
    { id: T_ALLY, label: 'Brother Corin', color: '#16a34a', col: 4, row: 9, size: 1, portrait: null, icon: null, shape: null, controlledBy: ALLY_USER, combat: null, speedFt: 30 },
    { id: T_GOB, label: 'Goblin', color: '#dc2626', col: 14, row: 7, size: 1, portrait: null, icon: null, shape: null, controlledBy: null, combat: null },
    { id: T_BOSS, label: 'Goblin Boss', color: '#991b1b', col: 15, row: 9, size: 1, portrait: null, icon: null, shape: null, controlledBy: null, combat: null },
    { id: T_CRATE, label: 'Crates', color: '#a16207', col: 9, row: 6, size: 1, portrait: null, icon: '📦', shape: 'square', controlledBy: null, combat: null, terrain: { cover: 'half' } },
  ]
  return {
    live: true,
    session: {
      campaignId: DEMO_CLOUD_ID,
      sessionId: 'demo-live-session',
      title: 'Demo session: the cellar ambush',
      sessionDate: new Date().toISOString().slice(0, 10),
      startedAt: new Date().toISOString(),
      discordVoice: null,
    },
    scene: {
      campaignId: DEMO_CLOUD_ID,
      sceneId: SCENE_ID,
      name: 'The Gilded Stag cellar',
      width: W,
      height: H,
      grid: { cellPx: CELL, offsetX: 0, offsetY: 0, show: true, color: '#ffffff', opacity: 0.3 },
      mapImageId: null,
      mapPath: null,
      fog: null,
      templates: null,
    },
    tokens,
    mapUrl: mapSvgUrl(),
    combat: null,
    templates: [],
    handouts: [
      {
        id: 'demo-handout-1',
        dataUrl: DEMO_IMG_DECREE.dataUrl,
        caption: 'A royal decree (demo handout)',
        width: DEMO_IMG_DECREE.width,
        height: DEMO_IMG_DECREE.height,
        kind: 'handout',
        sessionId: 'demo-live-session',
        sessionTitle: 'Demo session: the cellar ambush',
        sessionDate: null,
        createdAt: new Date().toISOString(),
      },
    ],
    myColor: null,
    enemyHp: {},
    log: ['The demo session is live. You are the player; use Demo controls to play the DM.'],
  }
}

let state: DemoLiveState = initial()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function set(patch: Partial<DemoLiveState> | ((s: DemoLiveState) => Partial<DemoLiveState>), note?: string) {
  const p = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...p, log: note ? [note, ...state.log].slice(0, 6) : state.log }
  emit()
}

export function getDemoLive(): DemoLiveState {
  return state
}

export function subscribeDemoLive(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The fake session's state, live. */
export function useDemoLive(): DemoLiveState {
  return useSyncExternalStore(subscribeDemoLive, getDemoLive, getDemoLive)
}

/** True when `cloudId` is the faux campaign (the demo has no other live campaign). */
export function isDemoCloud(cloudId: string | null | undefined): boolean {
  return isDemo() && cloudId === DEMO_CLOUD_ID
}

// ── Ping bus ───────────────────────────────────────────────────────────────
// The map pings hook (lib/usePings.ts) uses this in place of a Realtime channel.

const pingListeners = new Set<(m: PingMsg) => void>()
export function onDemoPing(fn: (m: PingMsg) => void): () => void {
  pingListeners.add(fn)
  return () => pingListeners.delete(fn)
}
export function emitDemoPing(m: PingMsg): void {
  pingListeners.forEach((fn) => fn(m))
}

// ── Combat helpers ─────────────────────────────────────────────────────────

function marker(hp: number, max: number): HealthMarker | null {
  if (hp >= max) return null
  const f = hp / max
  return f <= 0.25 ? 'deaths_door' : f <= 0.5 ? 'bloodied' : 'injured'
}

/** Re-number the order (highest initiative first), set the token overlays, and the acting row. */
function withOrder(rows: LiveCombatRow[]): LiveCombatRow[] {
  return [...rows]
    .sort((a, b) => (b.initiative ?? -99) - (a.initiative ?? -99) || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, sortOrder: i }))
}

function overlays(tokens: LiveToken[], combat: LiveCombat | null): LiveToken[] {
  return tokens.map((t) => {
    const row = combat?.rows.find((r) => r.id === t.id)
    if (!combat || !row) return { ...t, combat: null }
    const ally = row.kind !== 'enemy'
    return {
      ...t,
      combat: {
        active: combat.activeIds.includes(t.id),
        conditions: row.conditions,
        hp: ally ? row.hp : null,
        maxHp: ally ? row.maxHp : null,
      },
    }
  })
}

function commitCombat(combat: LiveCombat | null, note?: string) {
  set((s) => ({ combat, tokens: overlays(s.tokens, combat) }), note)
}

function enemyRow(id: string, name: string, initiative: number, hp: number, order: number): LiveCombatRow {
  return {
    id, controlledBy: null, source: 'dm', endTurnRequestedAt: null, name, kind: 'enemy', initiative,
    sortOrder: order, hp: null, maxHp: null, healthMarker: marker(hp, hp), conditions: [], groupCount: null,
  }
}

// ── DM actions (the controls strip) ────────────────────────────────────────

export const demoDm = {
  /** "Ask players for initiative": a gathering combat with one ally already in. */
  askInitiative() {
    commitCombat(
      {
        campaignId: DEMO_CLOUD_ID,
        phase: 'gathering',
        round: 1,
        activeIds: [],
        rows: [
          { id: T_ALLY, controlledBy: ALLY_USER, source: 'player', endTurnRequestedAt: null, name: 'Brother Corin', kind: 'pc', initiative: 12, sortOrder: 0, hp: 24, maxHp: 24, healthMarker: null, conditions: [], groupCount: null },
        ],
      },
      'Asked the players for initiative. Join with Thalia in the Initiative strip.',
    )
  },

  /** "Start combat": adds the enemies, sorts the order, and makes the first row act. */
  startCombat() {
    const cur = state.combat
    const hasRow = (id: string) => !!cur?.rows.some((r) => r.id === id)
    const rows = [...(cur?.rows ?? [])]
    const enemyHp = { ...state.enemyHp }
    if (!hasRow(T_GOB)) { rows.push(enemyRow(T_GOB, 'Goblin', 15, 7, rows.length)); enemyHp[T_GOB] = { hp: 7, maxHp: 7 } }
    if (!hasRow(T_BOSS)) { rows.push(enemyRow(T_BOSS, 'Goblin Boss', 9, 21, rows.length)); enemyHp[T_BOSS] = { hp: 21, maxHp: 21 } }
    if (!cur) {
      // Started with no gathering phase: bring in the ally, but not the player (they have not joined).
      rows.push({ id: T_ALLY, controlledBy: ALLY_USER, source: 'dm', endTurnRequestedAt: null, name: 'Brother Corin', kind: 'pc', initiative: 12, sortOrder: 0, hp: 24, maxHp: 24, healthMarker: null, conditions: [], groupCount: null })
    }
    const ordered = withOrder(rows)
    set({ enemyHp })
    commitCombat({ campaignId: DEMO_CLOUD_ID, phase: 'active', round: 1, activeIds: [ordered[0].id], rows: ordered }, 'Started combat.')
  },

  nextTurn() {
    const c = state.combat
    if (!c || c.phase !== 'active') return
    const order = [...c.rows].sort((a, b) => a.sortOrder - b.sortOrder)
    const i = order.findIndex((r) => c.activeIds.includes(r.id))
    const next = order[(i + 1) % order.length]
    const wrapped = i + 1 >= order.length
    const rows = c.rows.map((r) => ({ ...r, endTurnRequestedAt: null }))
    commitCombat({ ...c, rows, activeIds: [next.id], round: wrapped ? c.round + 1 : c.round }, `Next turn: ${next.name}.`)
  },

  /** Change a combatant's HP (negative = damage). Enemies show a marker, never numbers. */
  hp(id: string, delta: number) {
    const c = state.combat
    const row = c?.rows.find((r) => r.id === id)
    if (!c || !row) return
    if (row.kind === 'enemy') {
      const e = state.enemyHp[id]
      if (!e) return
      const hp = Math.max(0, Math.min(e.maxHp, e.hp + delta))
      set((s) => ({ enemyHp: { ...s.enemyHp, [id]: { ...e, hp } } }))
      commitCombat({ ...c, rows: c.rows.map((r) => (r.id === id ? { ...r, healthMarker: marker(hp, e.maxHp) } : r)) }, `${row.name} ${delta < 0 ? 'took damage' : 'was healed'}.`)
    } else {
      const max = row.maxHp ?? 0
      const hp = Math.max(0, Math.min(max, (row.hp ?? max) + delta))
      commitCombat({ ...c, rows: c.rows.map((r) => (r.id === id ? { ...r, hp } : r)) }, `${row.name} ${delta < 0 ? 'took' : 'healed'} ${Math.abs(delta)}.`)
    }
  },

  /** Set or clear a condition on a combatant. */
  toggleCondition(id: string, cond: string) {
    const c = state.combat
    if (!c) return
    commitCombat({ ...c, rows: c.rows.map((r) => (r.id === id ? { ...r, conditions: r.conditions.includes(cond) ? r.conditions.filter((x) => x !== cond) : [...r.conditions, cond] } : r)) }, `Toggled ${cond}.`)
  },

  moveToken(id: string, dCol: number, dRow: number) {
    const cols = Math.floor(W / CELL)
    const rows = Math.floor(H / CELL)
    set((s) => ({ tokens: s.tokens.map((t) => (t.id === id ? { ...t, col: Math.max(0, Math.min(cols - 1, t.col + dCol)), row: Math.max(0, Math.min(rows - 1, t.row + dRow)) } : t)) }), 'Moved a token.')
  },

  ping() {
    const x = (3 + Math.floor(Math.random() * 14)) * CELL + CELL / 2
    const y = (2 + Math.floor(Math.random() * 10)) * CELL + CELL / 2
    emitDemoPing({ t: 'p', s: SCENE_ID.slice(0, 8), x, y, c: '#a78bfa', n: 'Demo DM', k: 'demo-dm', d: true, ts: Date.now() })
    set({}, 'Pinged the map as the DM.')
  },

  /** Add a wolf to the fight (and the map) with a random initiative. */
  addCombatant() {
    const id = `demo-tok-wolf-${Math.random().toString(36).slice(2, 6)}`
    const init = 1 + Math.floor(Math.random() * 20)
    set((s) => ({
      tokens: [...s.tokens, { id, label: 'Wolf', color: '#7c2d12', col: 10, row: 11, size: 1, portrait: null, icon: null, shape: null, controlledBy: null, combat: null }],
      enemyHp: { ...s.enemyHp, [id]: { hp: 11, maxHp: 11 } },
    }))
    const c = state.combat
    if (c) {
      const rows = withOrder([...c.rows, enemyRow(id, 'Wolf', init, 11, c.rows.length)])
      const active = c.phase === 'active' ? c.activeIds : []
      commitCombat({ ...c, rows, activeIds: active }, `A wolf joined at initiative ${init}.`)
    } else {
      set({}, 'A wolf appeared on the map (no combat yet).')
    }
  },

  /** Stop sharing the fight: the players' initiative goes back to the empty state. */
  endCombat() {
    commitCombat(null, 'Ended combat.')
  },

  reset() {
    state = initial()
    emit()
  },
}

// ── Player actions (what the real RPCs do) ─────────────────────────────────

export const demoPlayer = {
  join(name: string, initiative: number, hp: number | null, maxHp: number | null, charKey: string): string {
    const c = state.combat
    if (!c) throw new Error('Your DM has not asked for initiative yet.')
    const existing = c.rows.find((r) => r.controlledBy === DEMO_PLAYER_ID && r.name.trim().toLowerCase() === name.trim().toLowerCase())
    if (existing) return existing.id
    const isHero = charKey !== '' && state.tokens.some((t) => t.id === T_HERO) && !c.rows.some((r) => r.id === T_HERO)
    const id = isHero ? T_HERO : `demo-pc-${Math.random().toString(36).slice(2, 6)}`
    const row: LiveCombatRow = { id, controlledBy: DEMO_PLAYER_ID, source: 'player', endTurnRequestedAt: null, name, kind: 'pc', initiative, sortOrder: 0, hp, maxHp, healthMarker: null, conditions: [], groupCount: null }
    const rows = withOrder([...c.rows, row])
    commitCombat({ ...c, rows }, `Thalia joined at initiative ${initiative}.`)
    return id
  },

  setInitiative(rowId: string, initiative: number) {
    const c = state.combat
    if (!c) return
    const active = c.phase === 'active'
    // While active, keep the order stable (the DM re-sorts in the real app); gathering re-sorts.
    const rows = c.rows.map((r) => (r.id === rowId ? { ...r, initiative } : r))
    commitCombat({ ...c, rows: active ? rows : withOrder(rows) })
  },

  leave(rowId: string) {
    const c = state.combat
    if (!c) return
    commitCombat({ ...c, rows: c.rows.filter((r) => r.id !== rowId), activeIds: c.activeIds.filter((x) => x !== rowId) })
  },

  /** End turn: the real flow asks the DM's client, which advances. The demo stamps the request, then advances. */
  endTurn(rowId: string) {
    const c = state.combat
    if (!c || c.phase !== 'active' || !c.activeIds.includes(rowId)) throw new Error('It is not that character’s turn.')
    commitCombat({ ...c, rows: c.rows.map((r) => (r.id === rowId ? { ...r, endTurnRequestedAt: new Date().toISOString() } : r)) })
    window.setTimeout(() => {
      const cur = state.combat
      if (cur && cur.activeIds.includes(rowId)) demoDm.nextTurn()
    }, 700)
  },

  moveToken(id: string, col: number, row: number) {
    set((s) => ({ tokens: s.tokens.map((t) => (t.id === id && t.controlledBy === DEMO_PLAYER_ID ? { ...t, col, row } : t)) }))
  },

  placeTemplate(t: LivePlayerTemplate) {
    set((s) => ({ templates: s.templates.some((x) => x.id === t.id) ? s.templates.map((x) => (x.id === t.id ? t : x)) : [...s.templates, t] }))
  },
  removeTemplate(id: string) {
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }))
  },
  setColor(color: string | null) {
    set({ myColor: color })
  },
}
