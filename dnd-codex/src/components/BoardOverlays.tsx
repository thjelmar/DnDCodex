import { useId, useMemo } from 'react'
import type { SceneGrid, SceneToken } from '../db/types'
import { cellToPx } from '../lib/tabletop'
import { ringCells, type RingDiagonals } from '../lib/rangeRing'
import { drawsZone, footprint } from '../lib/terrain'

// Board layers that sit above the map image and grid and below the templates,
// fog and tokens (T-103): the ambient light tint and the movement range ring.
// `Tabletop` draws this inside its transformed <g> through one `overlays` prop,
// so the board component stays free of scene-specific drawing.

/** Tint colors and the strength of each light level (0 to 1 alpha). */
const LIGHT = {
  dim: { fill: '#2a1a08', alpha: 0.35 },
  dark: { fill: '#060c28', alpha: 0.6 },
} as const

/** The DM sees the tint at this share of its strength, so prep stays readable. */
export const DM_LIGHT_SHARE = 0.5

export interface RangeRing {
  token: SceneToken
  /** Whole squares the token can move. */
  squares: number
  rule: RingDiagonals
}

interface Props {
  grid: SceneGrid
  width: number
  height: number
  /** `dm` draws the tint at reduced strength; `player` at full strength. */
  viewer: 'dm' | 'player'
  ring?: RangeRing | null
  /** Tokens that can draw a terrain zone (props with markers or a footprint). */
  tokens?: SceneToken[]
}

/** A short chip label: the full text on a roomy cell, a glyph on a small one. */
function coverLabel(cover: 'half' | 'three-quarters', cellPx: number): string {
  if (cellPx < 48) return cover === 'half' ? '½' : '¾'
  return cover === 'half' ? '½ COVER' : '¾ COVER'
}

export function BoardOverlays({ grid, width, height, viewer, ring, tokens }: Props) {
  const hatchId = useId()
  const light = grid.light && grid.light !== 'bright' ? LIGHT[grid.light] : null
  const cols = Math.floor((width - grid.offsetX) / grid.cellPx)
  const rows = Math.floor((height - grid.offsetY) / grid.cellPx)
  const ringPath = useMemo(() => {
    if (!ring || ring.squares <= 0) return ''
    const cells = ringCells(ring.token, ring.squares, ring.rule, { cols, rows })
    return cells
      .map(([c, r]) => {
        const p = cellToPx(grid, c, r)
        return `M${p.x} ${p.y}h${grid.cellPx}v${grid.cellPx}h${-grid.cellPx}z`
      })
      .join('')
  }, [ring, grid, cols, rows])

  return (
    <g pointerEvents="none" data-testid="board-overlays">
      {light && (
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={light.fill}
          fillOpacity={light.alpha * (viewer === 'dm' ? DM_LIGHT_SHARE : 1)}
          data-testid="board-light"
          data-light={grid.light}
          data-viewer={viewer}
        />
      )}
      {tokens && tokens.some(drawsZone) && (
        <defs>
          <pattern id={`hatch-${hatchId}`} width={10} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={10} className="bm-hatch-line" />
          </pattern>
        </defs>
      )}
      {tokens?.filter(drawsZone).map((t) => {
        const fp = footprint(t)
        const p = cellToPx(grid, t.col, t.row)
        const w = fp.w * grid.cellPx
        const h = fp.h * grid.cellPx
        const chip = t.terrain?.cover ? coverLabel(t.terrain.cover, grid.cellPx) : null
        const fs = Math.max(8, Math.min(grid.cellPx * 0.22, 16))
        const cw = chip ? chip.length * fs * 0.62 + fs : 0
        return (
          <g key={t.id} data-testid="terrain-zone" data-token={t.id}>
            <rect
              x={p.x}
              y={p.y}
              width={w}
              height={h}
              rx={Math.min(8, grid.cellPx * 0.12)}
              className={`bm-zone${t.terrain?.blocks ? ' blocks' : ''}`}
              style={t.terrain?.difficult ? { fill: `url(#hatch-${hatchId})` } : undefined}
              data-difficult={t.terrain?.difficult ? 'true' : undefined}
              data-blocks={t.terrain?.blocks ? 'true' : undefined}
            />
            {chip && (
              <g data-testid="cover-chip" data-cover={t.terrain?.cover}>
                <rect x={p.x + w / 2 - cw / 2} y={p.y - fs * 0.7} width={cw} height={fs * 1.4} rx={fs * 0.7} className="bm-cover-chip" />
                <text x={p.x + w / 2} y={p.y} className="bm-cover-text" fontSize={fs} textAnchor="middle" dominantBaseline="central">
                  {chip}
                </text>
              </g>
            )}
          </g>
        )
      })}
      {ring && ringPath && (
        <path
          d={ringPath}
          className="bm-range-ring"
          data-testid="range-ring"
          data-squares={ring.squares}
          data-rule={ring.rule}
          data-token={ring.token.id}
        />
      )}
    </g>
  )
}
