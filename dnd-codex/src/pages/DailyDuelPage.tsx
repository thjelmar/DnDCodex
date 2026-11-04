import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { isDemo } from '../lib/demo'
import {
  availableAttacks, endTurn, foeOf, heroAttack, heroOf, loadDuel, saveDuel,
  shareText, startDuel, utcDayKey, type DuelState,
} from '../lib/dailyDuel'

// Daily Duel (T-63): one Wordle-style 1v1 per UTC day, same matchup for
// everyone. Public (no sign-in) and local-only — it never calls Supabase, and
// it is hidden in the demo.

function HpBar({ label, emoji, hp, max, tone }: { label: string; emoji: string; hp: number; max: number; tone: string }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100))
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        <span aria-hidden>{emoji}</span> {label}
      </div>
      <div
        role="progressbar"
        aria-label={`${label} hit points`}
        aria-valuenow={Math.max(0, hp)}
        aria-valuemin={0}
        aria-valuemax={max}
        style={{ height: 12, borderRadius: 6, background: 'var(--bg-elev, rgba(127,127,127,.25))', overflow: 'hidden' }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: tone, transition: 'width .3s' }} />
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{Math.max(0, hp)} / {max} HP</div>
    </div>
  )
}

export function DailyDuelPage() {
  const demo = isDemo()
  const day = utcDayKey()
  const [duel, setDuel] = useState<DuelState | null>(() => (demo ? null : loadDuel(day)))
  const [copied, setCopied] = useState(false)
  const logEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (duel && !demo) saveDuel(duel)
  }, [duel, demo])

  useEffect(() => {
    logEnd.current?.scrollIntoView?.({ block: 'nearest' })
  }, [duel?.log.length])

  if (demo) return <Navigate to="/" replace />

  const hero = duel ? heroOf(duel) : null
  const foe = duel ? foeOf(duel) : null

  async function share() {
    if (!duel) return
    const text = shareText(duel)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy your result:', text)
    }
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">Daily Duel</h1>
          <div className="subtitle">One duel a day, the same for everyone. Resets at midnight UTC ({day}).</div>
        </div>
      </div>

      {!duel && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h3>Today’s duel is ready</h3>
          <p className="faint">
            Pick an attack each turn, and the Codex rolls it. Then your opponent strikes back.
            You get one try a day, so make it count.
          </p>
          <button className="btn primary" onClick={() => setDuel(startDuel(day))}>Roll initiative</button>
        </div>
      )}

      {duel && hero && foe && (
        <div style={{ maxWidth: 640, display: 'grid', gap: 16 }}>
          <div className="card">
            <div style={{ display: 'flex', gap: 16 }}>
              <HpBar label={hero.name} emoji={hero.emoji} hp={duel.heroHp} max={hero.hp} tone="#16a34a" />
              <HpBar label={foe.name} emoji={foe.emoji} hp={duel.foeHp} max={foe.hp} tone="#dc2626" />
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
              AC {hero.ac} vs AC {foe.ac} · Round {duel.round}
            </div>
          </div>

          {duel.outcome === 'playing' ? (
            <div className="card">
              <h3>Your turn</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {availableAttacks(duel).map((a) => (
                  <button key={a.id} className="btn primary" onClick={() => setDuel(heroAttack(duel, a.id))}>
                    {a.kind === 'bonus' ? 'Bonus: ' : ''}{a.name}
                    <span style={{ opacity: 0.8, fontWeight: 400 }}> · +{a.toHit}, {a.damage}{a.times && a.times > 1 ? ` ×${a.times}` : ''}</span>
                  </button>
                ))}
                <button className="btn ghost" onClick={() => setDuel(endTurn(duel))}>End turn</button>
              </div>
            </div>
          ) : (
            <div className="card">
              <h3>
                {duel.outcome === 'won' ? '🏆 Victory!' : duel.outcome === 'lost' ? '💀 Defeat' : '🤝 Stalemate'}
              </h3>
              <pre style={{ margin: '8px 0', fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{shareText(duel)}</pre>
              <button className="btn primary" onClick={share}>{copied ? 'Copied!' : 'Copy result'}</button>
              <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
                A new duel arrives at midnight UTC.
              </div>
            </div>
          )}

          <div className="card" aria-live="polite">
            <h3>Battle log</h3>
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 4, fontSize: 14 }}>
              {duel.log.map((e, i) => (
                <div key={i} style={{ color: e.side === 'foe' ? 'var(--text-dim)' : undefined }}>
                  <span className="faint">R{e.round}</span> {e.text}
                </div>
              ))}
              <div ref={logEnd} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
