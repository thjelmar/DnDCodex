import { NumberField } from '../NumberField'
import { TOKEN_KINDS } from '../../lib/tokenKind'
import type { TokenCardData } from '../../lib/tokenCard'

/**
 * A compact summary of the selected token at the bottom of the inspector. It shows
 * only what the app already stores, so a token with no stat block shows its name,
 * type and whatever else it has.
 */
export function TokenCard({
  data,
  speedFt,
  onSpeed,
  onOpenStatBlock,
  tags = [],
}: {
  data: TokenCardData
  /** The token's own manual speed (not the stat block's), or null. */
  speedFt: number | null
  onSpeed: (v: number | null) => void
  onOpenStatBlock?: () => void
  /** Terrain tags of a prop ("Difficult", "½ cover"). */
  tags?: string[]
}) {
  const kind = TOKEN_KINDS.find((k) => k.kind === data.kind)
  const rows: [string, string][] = []
  if (data.hp) rows.push(['HP', data.hp])
  if (data.ac) rows.push(['AC', data.ac])
  if (data.speedFt != null) rows.push(['Speed', `${data.speedFt} ft${data.speedFrom === 'stat block' ? ' (stat block)' : ''}`])
  return (
    <section className="bm-card" role="region" aria-label={`${data.name}, selected token`} data-testid="bm-token-card">
      <div className="bm-card-head">
        <strong className="bm-card-name">{data.name}</strong>
        <span className="bm-pill">{kind?.one}</span>
      </div>
      {tags.length > 0 && (
        <p className="bm-card-tags" data-testid="bm-card-tags">
          {tags.map((t) => (
            <span key={t} className="bm-terrain-pill">{t}</span>
          ))}
        </p>
      )}
      {rows.length > 0 && (
        <dl className="bm-card-rows">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {data.attacks.map((a) => (
        <p key={a.name} className="bm-card-atk">
          <b>{a.name}.</b> {a.text}
        </p>
      ))}
      <div className="bm-card-foot">
        {onOpenStatBlock && (
          <button type="button" className="bm-btn" onClick={onOpenStatBlock}>
            Open stat block
          </button>
        )}
        <label className="bm-card-speed">
          Speed (ft)
          <NumberField value={speedFt} min={0} max={400} step={5} onChange={onSpeed} ariaLabel="Speed in feet" placeholder="Unknown" />
        </label>
      </div>
    </section>
  )
}
