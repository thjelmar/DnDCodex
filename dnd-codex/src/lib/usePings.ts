import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { isDemo } from './demo'
import { useAuth } from '../auth/AuthProvider'
import {
  CURSOR_FADE_MS,
  CURSOR_IDLE_MS,
  CURSOR_INTERVAL_MS,
  DEFAULT_ACCENT,
  MAX_CURSORS,
  MAX_PINGS,
  MAX_PINGS_PER_SENDER,
  PING_BURST,
  PING_LIFE_MS,
  PING_MIN_GAP_MS,
  PING_WINDOW_MS,
  PINGS_PREF_EVENT,
  RECV_BURST,
  allowSend,
  colorFor,
  parseMsg,
  pingTopic,
  readDmPingColor,
  readPingsPref,
  sceneKey,
  writeDmPingColor,
  writePingsPref,
  upsertLocalCursor,
  type PingMsg,
} from './pings'

// Ephemeral map pings and cursors over Supabase Realtime Broadcast (T-102).
// Nothing is written to the database. The channel is private: only campaign
// members can join (RLS on realtime.messages, see the pings migration). The
// demo and signed-out users never open a channel; their own pings still animate
// locally so the feature stays visible.

export interface PingItem {
  id: string
  k: string
  x: number
  y: number
  color: string
  name: string
  local: boolean
  at: number
}

export interface CursorItem {
  k: string
  x: number
  y: number
  color: string
  name: string
  local: boolean
  ending: boolean
  last: number
}

export interface PingsApi {
  /** Pings and cursors are on for this user (preference on and allowed). */
  enabled: boolean
  /** The broadcast channel is joined. False in the demo and offline. */
  online: boolean
  isDm: boolean
  items: PingItem[]
  cursors: CursorItem[]
  /** Latest screen reader announcement. */
  announce: string
  sendPing: (x: number, y: number) => void
  sendCursor: (x: number, y: number, end: boolean) => void
  cursorIntervalMs: number
  /** Click-to-ping tool (touch users and anyone who prefers a tool). */
  pingTool: boolean
  setPingTool: (on: boolean) => void
  /** DM controls. */
  allowPlayers: boolean
  setAllowPlayers: (on: boolean) => void
  muted: ReadonlySet<string>
  toggleMute: (k: string) => void
  roster: { k: string; name: string; color: string }[]
  myColor: string
  setMyColor: (c: string) => void
  /** Local preference (Preferences, and the board menu). */
  prefOn: boolean
  setPrefOn: (on: boolean) => void
}

// --- shared channel registry -------------------------------------------------
// supabase.channel(name) returns the existing channel for a repeated name, and
// adding callbacks to a subscribed one throws. Several boards can mount at
// once (compact and full screen), so they share one channel by reference count.

interface Shared {
  ch: RealtimeChannel
  refs: number
  online: boolean
  onMsg: Set<(m: PingMsg) => void>
  onStatus: Set<(online: boolean) => void>
}
const registry = new Map<string, Shared>()

function acquire(topic: string): Shared | null {
  if (!supabase) return null
  let s = registry.get(topic)
  if (!s) {
    const ch = supabase.channel(topic, { config: { private: true, broadcast: { self: false } } })
    const shared: Shared = { ch, refs: 0, online: false, onMsg: new Set(), onStatus: new Set() }
    ch.on('broadcast', { event: 'm' }, (e) => {
      const m = parseMsg(e.payload)
      if (m) shared.onMsg.forEach((fn) => fn(m))
    }).subscribe((status) => {
      shared.online = status === 'SUBSCRIBED'
      shared.onStatus.forEach((fn) => fn(shared.online))
    })
    registry.set(topic, shared)
    s = shared
  }
  s.refs++
  return s
}

function release(topic: string): void {
  const s = registry.get(topic)
  if (!s) return
  if (--s.refs <= 0) {
    registry.delete(topic)
    void supabase?.removeChannel(s.ch)
  }
}

function accent(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

export function usePingsPref(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readPingsPref)
  useEffect(() => {
    const sync = () => setOn(readPingsPref())
    window.addEventListener(PINGS_PREF_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(PINGS_PREF_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return [on, writePingsPref]
}

interface Opts {
  /** Cloud campaign id; null = no channel (demo, signed out, not shared). */
  campaignId: string | null | undefined
  sceneId: string
  userId: string | null | undefined
  name: string
  /** The member's saved battle-map color, if any. */
  savedColor?: string | null
  isDm: boolean
}

export function usePings({ campaignId, sceneId, userId, name, savedColor, isDm }: Opts): PingsApi {
  const { session } = useAuth()
  const token = session?.access_token ?? null
  const [prefOn, setPrefOn] = usePingsPref()
  const [online, setOnline] = useState(false)
  const [items, setItems] = useState<PingItem[]>([])
  const [cursors, setCursors] = useState<CursorItem[]>([])
  const [announce, setAnnounce] = useState('')
  const [allowPlayers, setAllowState] = useState(true)
  const [muted, setMuted] = useState<ReadonlySet<string>>(new Set())
  const [roster, setRoster] = useState<{ k: string; name: string; color: string }[]>([])
  const [pingTool, setPingTool] = useState(false)
  const [dmColor, setDmColor] = useState<string | null>(readDmPingColor)

  const me = userId ?? 'local'
  const myColor = colorFor(me, isDm ? dmColor ?? savedColor : savedColor, isDm ? accent() : null)
  const enabled = prefOn && (isDm || allowPlayers)

  // Latest values for callbacks that outlive a render.
  const live = useRef({ me, name, myColor, isDm, allowPlayers, muted, prefOn, online, sk: sceneKey(sceneId) })
  live.current = { me, name, myColor, isDm, allowPlayers, muted, prefOn, online, sk: sceneKey(sceneId) }
  const topic = campaignId && token && supabase && !isDemo() ? pingTopic(campaignId) : null
  const sharedRef = useRef<Shared | null>(null)
  const sendLog = useRef<number[]>([])
  const recvLog = useRef(new Map<string, number[]>())
  const lastAnnounce = useRef(new Map<string, number>())

  const sendRaw = useCallback((msg: PingMsg) => {
    const s = sharedRef.current
    if (!s || !s.online) return
    void s.ch.send({ type: 'broadcast', event: 'm', payload: msg })
  }, [])

  // Join the channel.
  useEffect(() => {
    if (!topic) {
      setOnline(false)
      return
    }
    try {
      void supabase!.realtime.setAuth(token)
    } catch {
      /* the session token is applied on the next refresh */
    }
    const s = acquire(topic)
    if (!s) return
    sharedRef.current = s
    const onStatus = (isOn: boolean) => {
      setOnline(isOn)
      if (isOn) {
        setCursors([]) // reconnect: nothing is replayed
        if (live.current.isDm) sendRaw({ t: 'ctl', allow: live.current.allowPlayers })
        else sendRaw({ t: 'hello' })
      }
    }
    const onMsg = (m: PingMsg) => receive(m)
    s.onStatus.add(onStatus)
    s.onMsg.add(onMsg)
    onStatus(s.online)
    return () => {
      s.onStatus.delete(onStatus)
      s.onMsg.delete(onMsg)
      sharedRef.current = null
      release(topic)
      setOnline(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, token])

  function receive(m: PingMsg) {
    const L = live.current
    if (m.t === 'ctl') {
      if (!L.isDm) setAllowState(m.allow)
      return
    }
    if (m.t === 'hello') {
      if (L.isDm) sendRaw({ t: 'ctl', allow: L.allowPlayers })
      return
    }
    if (!L.prefOn || m.k === L.me || document.visibilityState === 'hidden') return
    if (m.s && m.s !== L.sk) return
    if (!m.d && (!L.allowPlayers || L.muted.has(m.k))) return
    const now = Date.now()
    const log = recvLog.current.get(m.k) ?? []
    while (log.length && now - log[0] > PING_WINDOW_MS) log.shift()
    if (m.t === 'p') {
      if (log.length >= RECV_BURST) return
      log.push(now)
    }
    recvLog.current.set(m.k, log)
    setRoster((r) => (r.some((x) => x.k === m.k && x.name === m.n && x.color === m.c) ? r : [...r.filter((x) => x.k !== m.k), { k: m.k, name: m.n, color: m.c }]))
    if (m.t === 'p') {
      addPing({ id: crypto.randomUUID(), k: m.k, x: m.x, y: m.y, color: m.c, name: m.n, local: false, at: now })
      const last = lastAnnounce.current.get(m.k) ?? 0
      if (now - last > 3000) {
        lastAnnounce.current.set(m.k, now)
        setAnnounce(`${m.n} pinged the map`)
      }
    } else {
      setCursors((cs) => {
        const rest = cs.filter((c) => c.k !== m.k || c.local)
        const prev = cs.find((c) => c.k === m.k && !c.local)
        if (!prev && rest.filter((c) => !c.local).length >= MAX_CURSORS) return cs
        return [...rest, { k: m.k, x: m.x, y: m.y, color: m.c, name: m.n, local: false, ending: m.end, last: now }]
      })
    }
  }

  function addPing(p: PingItem) {
    setItems((list) => {
      let next = [...list, p]
      const mine = next.filter((x) => x.k === p.k)
      if (mine.length > MAX_PINGS_PER_SENDER) {
        const drop = new Set(mine.slice(0, mine.length - MAX_PINGS_PER_SENDER).map((x) => x.id))
        next = next.filter((x) => !drop.has(x.id))
      }
      return next.length > MAX_PINGS ? next.slice(next.length - MAX_PINGS) : next
    })
  }

  // Prune expired pings and fade idle cursors while anything is on screen.
  const active = items.length > 0 || cursors.length > 0
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => {
      const now = Date.now()
      setItems((l) => {
        const next = l.filter((p) => now - p.at < PING_LIFE_MS + 100)
        return next.length === l.length ? l : next
      })
      setCursors((cs) => {
        let changed = false
        const next: CursorItem[] = []
        for (const c of cs) {
          if (!c.ending && now - c.last > CURSOR_IDLE_MS) {
            changed = true
            next.push({ ...c, ending: true, last: now })
          } else if (c.ending && now - c.last > CURSOR_FADE_MS) {
            changed = true
          } else next.push(c)
        }
        return changed ? next : cs
      })
    }, 200)
    return () => window.clearInterval(id)
  }, [active])

  // Turning pings off clears what is showing.
  useEffect(() => {
    if (!enabled) {
      setItems([])
      setCursors([])
    }
  }, [enabled])

  // The DM re-announces the allow switch whenever it changes.
  useEffect(() => {
    if (isDm) sendRaw({ t: 'ctl', allow: allowPlayers })
  }, [allowPlayers, isDm, online, sendRaw])

  const sendPing = useCallback(
    (x: number, y: number) => {
      const L = live.current
      if (!L.prefOn || (!L.isDm && !L.allowPlayers)) return
      const now = Date.now()
      if (!allowSend(sendLog.current, now, PING_MIN_GAP_MS, PING_BURST, PING_WINDOW_MS)) return
      addPing({ id: crypto.randomUUID(), k: L.me, x, y, color: L.myColor, name: 'You', local: true, at: now })
      sendRaw({ t: 'p', s: L.sk, x, y, c: L.myColor, n: L.name, k: L.me, d: L.isDm, ts: now })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendRaw],
  )

  const sendCursor = useCallback(
    (x: number, y: number, end: boolean) => {
      const L = live.current
      if (!L.prefOn || (!L.isDm && !L.allowPlayers)) return
      const now = Date.now()
      // Always draw your own cursor locally, online or not: the channel never echoes it back.
      // Remote cursors are never local, so this replaces only your previous local copy.
      setCursors((cs) => upsertLocalCursor(cs, { k: L.me, x, y, color: L.myColor, name: 'You', local: true, ending: end, last: now }))
      sendRaw({ t: 'c', s: L.sk, x, y, c: L.myColor, n: L.name, k: L.me, d: L.isDm, ts: now, end })
    },
    [sendRaw],
  )

  const toggleMute = useCallback((k: string) => {
    setMuted((m) => {
      const n = new Set(m)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
    setCursors((cs) => cs.filter((c) => c.k !== k))
  }, [])

  const setMyColor = useCallback((c: string) => {
    writeDmPingColor(c)
    setDmColor(c)
  }, [])

  return useMemo(
    () => ({
      enabled,
      online,
      isDm,
      items,
      cursors,
      announce,
      sendPing,
      sendCursor,
      cursorIntervalMs: CURSOR_INTERVAL_MS,
      pingTool,
      setPingTool,
      allowPlayers,
      setAllowPlayers: setAllowState,
      muted,
      toggleMute,
      roster,
      myColor,
      setMyColor,
      prefOn,
      setPrefOn,
    }),
    [enabled, online, isDm, items, cursors, announce, sendPing, sendCursor, pingTool, allowPlayers, muted, toggleMute, roster, myColor, setMyColor, prefOn, setPrefOn],
  )
}
