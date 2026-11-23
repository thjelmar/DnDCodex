import { test, expect } from '@playwright/test'
import { STALE_MS, elapsedMs, formatClock, pauseTimer, settleTimer, startTimer } from '../src/lib/runTimer'

// The run timer's pure rules (T-98): start, pause, resume, a stale heartbeat, the clock text.

test.describe('run timer model', () => {
  test('start, then pause banks the time, then resume continues', () => {
    const a = startTimer(null, 1_000)
    expect(elapsedMs(a, 6_000)).toBe(5_000)
    const b = pauseTimer(a, 6_000)
    expect(b.since).toBeNull()
    expect(elapsedMs(b, 99_000)).toBe(5_000)
    const c = startTimer(b, 100_000)
    expect(elapsedMs(c, 103_000)).toBe(8_000)
  })

  test('a running timer last seen more than 5 minutes ago stops at that moment', () => {
    const s = { ms: 60_000, since: 1_000_000, seen: 1_000_000 + 4 * 60_000 }
    const settled = settleTimer(s, s.seen + STALE_MS + 1)
    expect(settled.since).toBeNull()
    expect(elapsedMs(settled, s.seen + 10 * 60_000)).toBe(60_000 + 4 * 60_000)
  })

  test('a running timer seen within 5 minutes keeps counting (a reload)', () => {
    const s = { ms: 0, since: 1_000, seen: 50_000 }
    expect(settleTimer(s, 50_000 + STALE_MS)).toBe(s)
  })

  test('a paused timer is left alone', () => {
    const s = { ms: 5_000, since: null, seen: 0 }
    expect(settleTimer(s, 10 * STALE_MS)).toBe(s)
  })

  test('the clock reads hh:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00:00')
    expect(formatClock(9_858_000)).toBe('02:44:18')
    expect(formatClock(-5)).toBe('00:00:00')
  })
})
