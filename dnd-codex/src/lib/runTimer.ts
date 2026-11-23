import { useCallback, useEffect, useRef, useState } from 'react'
import type { Id } from '../db/types'

// Run mode's run-time timer: how long a Run mode session has been going. It lives only in this
// browser (localStorage), never syncs and never enters the JSON backup. The DM starts it with a
// button. It pauses when the DM leaves Run mode. A page that closes or crashes while it runs counts
// time up to its last heartbeat, and the timer comes back paused if the page was away for more than
// STALE_MS.

export interface RunTimerState {
  /** Time banked while paused, in milliseconds. */
  ms: number
  /** When the current run started, or null while paused. */
  since: number | null
  /** The last heartbeat, so a closed tab does not count the time it was away. */
  seen: number
}

/** Away longer than this and a running timer comes back paused, at its last heartbeat. */
export const STALE_MS = 5 * 60_000
/** How often a running timer writes its heartbeat. */
export const HEARTBEAT_MS = 30_000

export const runTimerKey = (sessionId: Id) => `codex.runTimer.${sessionId}`

/** Milliseconds on the clock at `now`. */
export function elapsedMs(s: RunTimerState, now: number): number {
  return s.ms + (s.since != null ? Math.max(0, now - s.since) : 0)
}

/** Start from zero, or resume. */
export function startTimer(s: RunTimerState | null, now: number): RunTimerState {
  return { ms: s?.ms ?? 0, since: now, seen: now }
}

export function pauseTimer(s: RunTimerState, now: number): RunTimerState {
  return { ms: elapsedMs(s, now), since: null, seen: now }
}

/** A running timer that was last seen long ago stops at that moment. */
export function settleTimer(s: RunTimerState, now: number): RunTimerState {
  if (s.since != null && now - s.seen > STALE_MS) return { ms: s.ms + Math.max(0, s.seen - s.since), since: null, seen: s.seen }
  return s
}

/** `hh:mm:ss`. */
export function formatClock(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`
}

function parse(raw: string | null): RunTimerState | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<RunTimerState>
    if (typeof v.ms !== 'number' || typeof v.seen !== 'number') return null
    return { ms: v.ms, since: typeof v.since === 'number' ? v.since : null, seen: v.seen }
  } catch {
    return null
  }
}

export function loadTimer(sessionId: Id, now = Date.now()): RunTimerState | null {
  try {
    const s = parse(localStorage.getItem(runTimerKey(sessionId)))
    return s ? settleTimer(s, now) : null
  } catch {
    return null
  }
}

function saveTimer(sessionId: Id, s: RunTimerState | null): void {
  try {
    if (s) localStorage.setItem(runTimerKey(sessionId), JSON.stringify(s))
    else localStorage.removeItem(runTimerKey(sessionId))
  } catch {
    /* private mode: the timer still works until the page closes */
  }
}

// Sessions whose Run mode is on screen. Leaving Run mode pauses the timer, but a React dev
// re-mount unmounts and mounts again in one tick, so the pause waits one tick and checks this set.
const live = new Set<string>()

/** The timer for one session. `null` until the DM presses Start. */
export function useRunTimer(sessionId: Id | null) {
  const [state, setState] = useState<RunTimerState | null>(() => (sessionId ? loadTimer(sessionId) : null))
  const [, setNow] = useState(() => Date.now())
  const ref = useRef(state)
  ref.current = state

  // Load this session's timer when the session changes.
  const loaded = useRef(sessionId)
  useEffect(() => {
    if (loaded.current === sessionId) return
    loaded.current = sessionId
    setState(sessionId ? loadTimer(sessionId) : null)
  }, [sessionId])

  const apply = useCallback(
    (next: RunTimerState | null) => {
      setState(next)
      if (sessionId) saveTimer(sessionId, next)
    },
    [sessionId],
  )

  // Tick once a second while running; write the heartbeat every 30 seconds.
  const running = state?.since != null
  useEffect(() => {
    if (!running || !sessionId) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const beat = setInterval(() => {
      const cur = ref.current
      if (cur?.since != null) saveTimer(sessionId, { ...cur, seen: Date.now() })
    }, HEARTBEAT_MS)
    return () => {
      clearInterval(tick)
      clearInterval(beat)
    }
  }, [running, sessionId])

  // Leaving Run mode (or switching sessions) pauses.
  useEffect(() => {
    if (!sessionId) return
    live.add(sessionId)
    return () => {
      live.delete(sessionId)
      setTimeout(() => {
        if (live.has(sessionId)) return
        const cur = loadTimer(sessionId)
        if (cur?.since != null) saveTimer(sessionId, pauseTimer(cur, Date.now()))
      }, 0)
    }
  }, [sessionId])

  return {
    started: state != null,
    running,
    ms: state ? elapsedMs(state, Date.now()) : 0, // `now` re-renders each second while running
    start: () => apply(startTimer(state, Date.now())),
    pause: () => state && apply(pauseTimer(state, Date.now())),
    reset: () => apply(null),
  }
}
