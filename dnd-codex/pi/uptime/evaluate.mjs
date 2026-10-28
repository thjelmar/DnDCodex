// Alert rules for the uptime check. Pure functions with no I/O, so the rules can
// be tested without a network or a clock.
//
// One failed check is often a blip, so a check must fail FAILS_BEFORE_ALERT runs
// in a row before it alerts. After that it alerts once, repeats a reminder every
// REMIND_MS while it stays down, and sends a single "back" message on recovery.

export const FAILS_BEFORE_ALERT = 2
export const REMIND_MS = 6 * 60 * 60 * 1000

const FRESH = { failures: 0, down: false, downSince: null, lastAlert: null }

/** "5 min", "2 h 10 min". */
export function formatDuration(ms) {
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/**
 * @param {Record<string, {failures: number, down: boolean, downSince: number|null, lastAlert: number|null}>} prev
 *   State saved by the previous run, keyed by check name.
 * @param {{name: string, ok: boolean, detail: string}[]} results  This run's checks.
 * @param {number} now  Epoch milliseconds.
 * @returns {{state: object, messages: string[]}}  The state to save and the alerts to send.
 */
export function evaluate(prev, results, now) {
  const state = {}
  const messages = []

  for (const { name, ok, detail } of results) {
    const before = { ...FRESH, ...(prev[name] ?? {}) }

    if (ok) {
      if (before.down) {
        messages.push(`✅ ${name} is back (down for ${formatDuration(now - before.downSince)}).`)
      }
      state[name] = { ...FRESH }
      continue
    }

    // The counter stops at the alert threshold so a long outage doesn't rewrite
    // the state file (and wear the SD card) on every run.
    const failures = Math.min(before.failures + 1, FAILS_BEFORE_ALERT)

    if (before.down) {
      if (now - before.lastAlert >= REMIND_MS) {
        messages.push(`🔴 ${name} is still down after ${formatDuration(now - before.downSince)}: ${detail}`)
        state[name] = { ...before, failures, lastAlert: now }
      } else {
        state[name] = { ...before, failures }
      }
    } else if (failures >= FAILS_BEFORE_ALERT) {
      messages.push(`🔴 ${name} is down: ${detail}`)
      state[name] = { failures, down: true, downSince: now, lastAlert: now }
    } else {
      state[name] = { ...before, failures }
    }
  }

  return { state, messages }
}
