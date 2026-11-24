import { test, expect } from '@playwright/test'
import { ringCells, ringSquares, stepCost } from '../src/lib/rangeRing'

// Movement range ring (T-103): pure logic, no browser.

test.describe('range ring', () => {
  test('speed turns into whole squares at 5 ft each', () => {
    expect(ringSquares(30)).toBe(6)
    expect(ringSquares(32)).toBe(6)
    expect(ringSquares(4)).toBe(0)
    expect(ringSquares(0)).toBe(0)
    expect(ringSquares(null)).toBe(0)
    expect(ringSquares(undefined)).toBe(0)
  })

  test('standard rule: diagonals cost 5 ft, so the ring is a square', () => {
    expect(stepCost(3, 3, 'standard')).toBe(3)
    const cells = ringCells({ col: 10, row: 10, size: 1 }, 2)
    expect(cells).toHaveLength(25) // 5 x 5, the token's own cell included
  })

  test('5-10-5 rule: every second diagonal costs 10 ft, so the corners come off', () => {
    expect(stepCost(2, 2, '5-10-5')).toBe(3)
    expect(stepCost(1, 1, '5-10-5')).toBe(1)
    const std = ringCells({ col: 10, row: 10, size: 1 }, 4, 'standard').length
    const alt = ringCells({ col: 10, row: 10, size: 1 }, 4, '5-10-5').length
    expect(std).toBe(81)
    expect(alt).toBeLessThan(std)
  })

  test('a Large token reaches the same distance from each edge', () => {
    const cells = ringCells({ col: 5, row: 5, size: 2 }, 3)
    expect(cells).toHaveLength(8 * 8) // 2 + 2 * 3 squares on a side
    expect(cells).toContainEqual([5, 5])
    expect(cells).toContainEqual([9, 6]) // 3 squares past the right edge (col 6)
    expect(cells).not.toContainEqual([10, 6])
  })

  test('cells off the board are left out', () => {
    const cells = ringCells({ col: 0, row: 0, size: 1 }, 2, 'standard', { cols: 20, rows: 20 })
    expect(cells).toHaveLength(9) // 3 x 3 in the corner
    expect(ringCells({ col: 0, row: 0, size: 1 }, 0)).toHaveLength(0)
  })
})
