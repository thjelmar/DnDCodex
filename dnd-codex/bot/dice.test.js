// Run with: npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { rollExpression, formatRoll, escapeMarkdown } from './dice.js'

/**
 * A fake random source. The roller computes floor(rng() * sides) + 1, so for each
 * call return (face - 0.5) / sides to land on the wanted face.
 */
function rngFor(faces, sidesList) {
  let i = 0
  return () => (faces[i] - 0.5) / sidesList[i++]
}

test('rolls a basic expression with a modifier', () => {
  const r = rollExpression('2d6+3', { rng: rngFor([4, 5], [6, 6]) })
  assert.equal(r.total, 12)
  assert.deepEqual(r.terms[0].rolls, [4, 5])
})

test('treats d20 as 1d20 and handles subtraction', () => {
  const r = rollExpression('d20-2', { rng: rngFor([15], [20]) })
  assert.equal(r.total, 13)
})

test('ignores spaces and case', () => {
  const r = rollExpression(' 1D8 + 1d6 - 1 ', { rng: rngFor([8, 6], [8, 6]) })
  assert.equal(r.total, 13)
})

test('subtracts a negative dice term', () => {
  const r = rollExpression('10-1d4', { rng: rngFor([3], [4]) })
  assert.equal(r.total, 7)
})

test('rejects invalid input', () => {
  for (const bad of ['', '   ', 'hello', '2d', 'd', '2d6!', '2d6+', '0d6', '101d6', '1d1001', '1d0', '2d6 + banana']) {
    assert.equal(rollExpression(bad), null, `"${bad}" should be rejected`)
  }
})

test('advantage keeps the higher d20 and disadvantage keeps the lower', () => {
  const adv = rollExpression('d20+5', { mode: 'advantage', rng: rngFor([4, 17], [20, 20]) })
  assert.equal(adv.total, 22)
  assert.equal(adv.terms[0].keptIndex, 1)
  const dis = rollExpression('d20+5', { mode: 'disadvantage', rng: rngFor([4, 17], [20, 20]) })
  assert.equal(dis.total, 9)
  assert.equal(dis.terms[0].keptIndex, 0)
})

test('advantage leaves other dice alone', () => {
  const r = rollExpression('2d20', { mode: 'advantage', rng: rngFor([3, 4], [20, 20]) })
  assert.equal(r.terms[0].rolls.length, 2)
  assert.equal(r.total, 7)
})

test('real random rolls stay in range', () => {
  for (let i = 0; i < 500; i++) {
    const { total } = rollExpression('3d6')
    assert.ok(total >= 3 && total <= 18)
  }
})

test('formats a roll and strikes through the die dropped by advantage', () => {
  const r = rollExpression('d20+5', { mode: 'advantage', rng: rngFor([4, 17], [20, 20]) })
  assert.equal(formatRoll(r, 'Sam'), '🎲 **Sam** rolled `d20+5`: [~~4~~, 17] +5 = **22**')
})

test('falls back to the total for a very long roll', () => {
  const r = rollExpression(Array(40).fill('100d1000').join('+'))
  const text = formatRoll(r, 'Sam')
  assert.ok(text.length < 2000)
  assert.match(text, /= \*\*\d+\*\*$/)
  assert.doesNotMatch(text, /\[/)
})

test('escapes Markdown in display names', () => {
  assert.equal(escapeMarkdown('**Bob** _the_ `bold`'), '\\*\\*Bob\\*\\* \\_the\\_ \\`bold\\`')
})
