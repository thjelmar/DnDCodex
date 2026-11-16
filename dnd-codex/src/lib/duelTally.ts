import { supabase } from './supabase'
import { isDemo } from './demo'
import type { Lean } from './duelLean'
import type { DuelRecord } from '../db/types'

// Daily Duel shared tally (T-66). Aggregate only: a random per-browser device id
// (never an account id) goes up with each finished duel, and the previous day's
// win rate leans today's twist. Every call fails quietly: offline, Supabase not
// configured, demo mode or an RPC error all just mean "no tally", and the game
// still works.

const DEVICE_KEY = 'codex.duelDevice'
const LEAN_KEY = 'codex.duelLean' // { day, lean } for the day it was fetched
const SENT_KEY = 'codex.duelSent' // the last day this device recorded

function store(): Storage | null {
  try { return localStorage } catch { return null }
}

function deviceId(): string {
  const s = store()
  try {
    const have = s?.getItem(DEVICE_KEY)
    if (have) return have
  } catch { /* fall through to a fresh id */ }
  const id = crypto.randomUUID()
  try { s?.setItem(DEVICE_KEY, id) } catch { /* private mode: a per-call id is fine */ }
  return id
}

const enabled = () => !!supabase && !isDemo()

/** Sends a finished duel once per day. Never throws. */
export async function recordDuelResult(rec: Pick<DuelRecord, 'day' | 'tier' | 'outcome' | 'rounds' | 'heroId' | 'foeId'>, twistId: string): Promise<void> {
  if (!enabled()) return
  const s = store()
  try {
    if (s?.getItem(SENT_KEY) === rec.day) return
    const { error } = await supabase!.rpc('record_duel_result', {
      p_day: rec.day, p_tier: rec.tier, p_outcome: rec.outcome, p_rounds: Math.max(1, rec.rounds),
      p_hero_id: rec.heroId, p_foe_id: rec.foeId, p_twist_id: twistId, p_device_id: deviceId(),
    })
    if (!error) s?.setItem(SENT_KEY, rec.day)
  } catch { /* offline or blocked */ }
}

/**
 * Yesterday's lean for `day`, or null. A non-null answer is cached for the day so
 * a reload doesn't refetch. Resolves null after `timeoutMs` so the page never waits long.
 */
export async function fetchDuelLean(day: string, timeoutMs = 2500): Promise<Lean | null> {
  if (!enabled()) return null
  const s = store()
  try {
    const cached = JSON.parse(s?.getItem(LEAN_KEY) ?? 'null') as { day: string; lean: Lean } | null
    if (cached && cached.day === day && (cached.lean === 'hero' || cached.lean === 'foe')) return cached.lean
  } catch { /* ignore a bad cache */ }
  try {
    const call = supabase!.rpc('get_duel_lean', { p_day: day }).then(({ data, error }) => (error ? null : data as unknown))
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))
    const lean = await Promise.race([call, timeout])
    if (lean === 'hero' || lean === 'foe') {
      try { s?.setItem(LEAN_KEY, JSON.stringify({ day, lean })) } catch { /* ignore */ }
      return lean
    }
  } catch { /* offline */ }
  return null
}
