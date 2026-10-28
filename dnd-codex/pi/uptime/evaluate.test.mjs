// Run with: node --test pi/
import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, formatDuration, FAILS_BEFORE_ALERT, REMIND_MS } from './evaluate.mjs'

const MIN = 60 * 1000
const up = (name = 'App') => ({ name, ok: true, detail: 'HTTP 200' })
const down = (name = 'App') => ({ name, ok: false, detail: 'HTTP 503' })

/** Feed a list of runs through evaluate, five minutes apart. Returns each run's messages. */
function simulate(runs, start = 0) {
  let state = {}
  return runs.map((results, i) => {
    const out = evaluate(state, results, start + i * 5 * MIN)
    state = out.state
    return out.messages
  })
}

test('a single failure stays quiet', () => {
  const [first] = simulate([[down()]])
  assert.deepEqual(first, [])
})

test('alerts once the check fails twice in a row', () => {
  const runs = Array.from({ length: FAILS_BEFORE_ALERT }, () => [down()])
  const out = simulate(runs)
  assert.deepEqual(out.slice(0, -1).flat(), [])
  assert.match(out.at(-1)[0], /App is down: HTTP 503/)
})

test('does not repeat the alert while the check stays down', () => {
  const out = simulate([[down()], [down()], [down()], [down()]])
  assert.equal(out.flat().length, 1)
})

test('a blip that recovers sends nothing', () => {
  const out = simulate([[down()], [up()], [down()], [up()]])
  assert.deepEqual(out.flat(), [])
})

test('sends one recovery message with the downtime', () => {
  const out = simulate([[down()], [down()], [down()], [up()], [up()]])
  const recovery = out.flat().filter((m) => m.startsWith('✅'))
  assert.equal(recovery.length, 1)
  assert.match(recovery[0], /App is back \(down for 10 min\)/)
})

test('reminds again after REMIND_MS', () => {
  let state = {}
  state = evaluate(state, [down()], 0).state
  state = evaluate(state, [down()], 5 * MIN).state // alerts here
  const early = evaluate(state, [down()], 5 * MIN + REMIND_MS - MIN)
  assert.deepEqual(early.messages, [])
  const later = evaluate(early.state, [down()], 5 * MIN + REMIND_MS)
  assert.match(later.messages[0], /still down after 6 h:/)
})

test('tracks each check on its own', () => {
  const out = simulate([[down('App'), up('Database')], [down('App'), up('Database')]])
  assert.equal(out[1].length, 1)
  assert.match(out[1][0], /App/)
})

test('stops growing the state while a check stays down', () => {
  let state = {}
  for (let i = 0; i < 2; i++) state = evaluate(state, [down()], i * 5 * MIN).state
  const again = evaluate(state, [down()], 10 * MIN)
  assert.deepEqual(again.state, state)
})

test('forgets checks that are no longer configured', () => {
  const first = evaluate({}, [down('Old check')], 0)
  const second = evaluate(first.state, [up('App')], 5 * MIN)
  assert.deepEqual(Object.keys(second.state), ['App'])
})

test('formats durations', () => {
  assert.equal(formatDuration(30 * 1000), '1 min')
  assert.equal(formatDuration(45 * MIN), '45 min')
  assert.equal(formatDuration(60 * MIN), '1 h')
  assert.equal(formatDuration(130 * MIN), '2 h 10 min')
})
