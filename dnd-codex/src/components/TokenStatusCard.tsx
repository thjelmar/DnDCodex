import type { SceneToken, TokenCombat } from '../db/types'
import { conditionMeta } from '../lib/combat'

/** True when the (privacy-filtered) overlay has anything worth floating: real
 *  HP, damage taken, or conditions. Callers use it to skip a bare name-only
 *  card (the board already labels the token). */
export function hasFloatingStatus(cc: TokenCombat | undefined): boolean {
  if (!cc) return false
  return (cc.hp != null && cc.maxHp != null) || (cc.damageTaken ?? 0) > 0 || (cc.conditions?.length ?? 0) > 0
}

/**
 * A read-only glance card for a token, floated above it on the board (the
 * players' live board and the DM's player-preview). Everything shown comes from
 * the privacy-filtered combat overlay: real HP for allies, only damage taken for
 * enemies, plus any conditions.
 */
export function TokenStatusCard({ token, combat: cc }: { token: SceneToken; combat?: TokenCombat }) {
  const hpTracked = !!cc && cc.hp != null && cc.maxHp != null && cc.maxHp > 0
  const frac = hpTracked ? Math.max(0, Math.min(1, (cc!.hp as number) / (cc!.maxHp as number))) : 0
  const hpCls = frac > 0.5 ? 'hp-hi' : frac > 0.25 ? 'hp-mid' : 'hp-lo'
  const dmg = !hpTracked && cc && (cc.damageTaken ?? 0) > 0 ? cc.damageTaken : null
  const conditions = cc?.conditions ?? []
  return (
    <div className="token-status-card">
      <div className="token-status-name" title={token.label}>{token.label}</div>
      {hpTracked && (
        <div className="token-status-hp">
          <span className="token-status-hp-bar">
            <span className={`token-status-hp-fill ${hpCls}`} style={{ width: `${frac * 100}%` }} />
          </span>
          <span className="token-status-hp-num">{cc!.hp}/{cc!.maxHp}</span>
        </div>
      )}
      {dmg != null && <div className="token-status-dmg">−{dmg} damage</div>}
      {conditions.length > 0 && (
        <div className="token-status-conds">
          {conditions.map((name) => {
            const m = conditionMeta(name)
            return (
              <span key={name} className="token-status-cond">
                <span className="token-status-cond-dot" style={{ background: m.color }} aria-hidden />
                {name}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
