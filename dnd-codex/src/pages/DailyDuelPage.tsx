import { useEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../auth/AuthProvider'
import { getDuelHistory, saveDuelResult } from '../db/repo'
import { isDemo } from '../lib/demo'
import {
  availableAttacks, challengeLink, compareToChallenge, dailyTier, endTurn, foeOf, heroAttack, heroOf,
  gridEmoji, historyStats, loadDuel, parseChallenge, saveDuel, shareText, startDuel, toDuelRecord,
  utcDayKey, type DuelState, type LogEntry,
} from '../lib/dailyDuel'
import { FOES, HEROES, TIER_LABEL } from '../data/duelists'

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

const CHIP: Record<LogEntry['kind'], { label: string; bg: string; fg: string } | null> = {
  hit: { label: 'HIT', bg: 'rgba(22,163,74,.18)', fg: '#16a34a' },
  crit: { label: 'CRIT!', bg: 'rgba(234,179,8,.25)', fg: '#ca8a04' },
  miss: { label: 'MISS', bg: 'rgba(127,127,127,.2)', fg: 'var(--text-dim)' },
  fumble: { label: 'NAT 1', bg: 'rgba(127,127,127,.2)', fg: 'var(--text-dim)' },
  info: null,
}

/** The play-by-play: grouped by round, each attack on its own row with the
 *  attacker, the roll against Armor Class, and the damage with HP left. */
function BattleLog({ log, heroEmoji, foeEmoji }: { log: LogEntry[]; heroEmoji: string; foeEmoji: string }) {
  const rounds: { round: number; rows: LogEntry[] }[] = []
  for (const e of log) {
    const last = rounds[rounds.length - 1]
    if (last && last.round === e.round) last.rows.push(e)
    else rounds.push({ round: e.round, rows: [e] })
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rounds.map((r) => (
        <div key={r.round}>
          <div className="faint" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
            Round {r.round}
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {r.rows.map((e, i) => {
              const chip = CHIP[e.kind]
              const mine = e.side === 'hero'
              if (!chip || e.attack === undefined) {
                return (
                  <div key={i} className="faint" style={{ fontSize: 13, fontStyle: e.kind === 'info' ? 'italic' : undefined }}>
                    {e.text}
                  </div>
                )
              }
              const hit = e.kind === 'hit' || e.kind === 'crit'
              return (
                <div
                  key={i}
                  style={{
                    borderLeft: `3px solid ${mine ? '#16a34a' : '#dc2626'}`,
                    background: mine ? 'rgba(22,163,74,.07)' : 'rgba(220,38,38,.07)',
                    borderRadius: 4,
                    padding: '5px 8px',
                    fontSize: 14,
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden>{mine ? heroEmoji : foeEmoji}</span>
                    <strong>{e.who}</strong>
                    <span>used {e.attack}</span>
                    <span style={{ background: chip.bg, color: chip.fg, borderRadius: 4, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>
                      {chip.label}
                    </span>
                    {hit && (
                      <strong style={{ marginLeft: 'auto', color: mine ? '#16a34a' : '#dc2626' }}>−{e.damage} HP</strong>
                    )}
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                    d20 {e.d20} {(e.bonus ?? 0) >= 0 ? '+' : '−'} {Math.abs(e.bonus ?? 0)} = {e.total} vs AC {e.ac}
                    {hit && e.targetHp !== undefined && e.targetMax !== undefined && ` · ${e.targetHp}/${e.targetMax} HP left`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function DailyDuelPage() {
  const demo = isDemo()
  const day = utcDayKey()
  const [duel, setDuel] = useState<DuelState | null>(() => (demo ? null : loadDuel(day)))
  const [copied, setCopied] = useState(false)
  const logEnd = useRef<HTMLDivElement>(null)
  const [params] = useSearchParams()
  const challenge = parseChallenge(params.get('beat'))

  useEffect(() => {
    if (duel && !demo) saveDuel(duel)
  }, [duel, demo])

  // A finished duel goes into the battle history (one row per UTC day, so a
  // reload can't duplicate it). Signed in, it then syncs with the account.
  useEffect(() => {
    const rec = duel && !demo ? toDuelRecord(duel) : null
    if (rec) saveDuelResult(rec).catch(() => {})
  }, [duel, demo])

  const { user } = useAuth()
  const history = useLiveQuery(() => (demo ? Promise.resolve([]) : getDuelHistory()), [demo])

  useEffect(() => {
    logEnd.current?.scrollIntoView?.({ block: 'nearest' })
  }, [duel?.log.length])

  if (demo) return <Navigate to="/" replace />

  const hero = duel ? heroOf(duel) : null
  const foe = duel ? foeOf(duel) : null

  async function share() {
    if (!duel) return
    const base = `${window.location.origin}${window.location.pathname}`
    const text = shareText(duel, challengeLink(duel, base))
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

      {challenge && (
        <div className="card" style={{ maxWidth: 640, marginBottom: 16 }}>
          <strong>A friend challenged you.</strong>{' '}
          {challenge.outcome === 'won'
            ? `They won in ${challenge.rounds} round${challenge.rounds === 1 ? '' : 's'} with ${challenge.hpLeft} HP left.`
            : 'They were defeated. Can you win?'}
          {challenge.day !== day && (
            <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
              That challenge was for {challenge.day}. You’re playing today’s duel instead.
            </div>
          )}
          {challenge.day === day && duel && duel.outcome !== 'playing' && (
            <div style={{ marginTop: 4 }}>
              {{ beat: '🏆 You beat their score!', tied: '🤝 You tied their score.', lost: '💀 Their score still stands.' }[compareToChallenge(duel, challenge)]}
            </div>
          )}
        </div>
      )}

      {!duel && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h3>Today’s duel is ready</h3>
          <p className="faint">
            Each turn, pick an attack. The Codex rolls a d20 and adds the attack bonus: if the total
            meets or beats the target’s Armor Class, it hits and rolls damage. A natural 20 always hits
            and doubles the damage dice, and a natural 1 always misses. Then your opponent takes its
            turn, and you trade turns until one of you drops to 0 HP. You get one try a day, so make
            it count. Today’s difficulty: {TIER_LABEL[dailyTier(day)]}.
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
              {TIER_LABEL[duel.tier]} · AC {hero.ac} vs AC {foe.ac} · Round {duel.round}
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
                {duel.outcome === 'won' ? '🏆 Victory!' : '💀 Defeat'}
              </h3>
              <pre style={{ margin: '8px 0', fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{shareText(duel)}</pre>
              <button className="btn primary" onClick={share}>{copied ? 'Copied!' : 'Copy result and challenge link'}</button>
              <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
                A new duel arrives at midnight UTC.
              </div>
            </div>
          )}

          <div className="card" aria-live="polite">
            <h3>Battle log</h3>
            <div style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 8 }}>
              <BattleLog log={duel.log} heroEmoji={hero.emoji} foeEmoji={foe.emoji} />
              <div ref={logEnd} />
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <h3>Battle history</h3>
        {history && history.length > 0 ? (
          <>
            {(() => {
              const st = historyStats(history)
              return (
                <div className="faint" style={{ fontSize: 13, marginBottom: 8 }}>
                  {st.played} played · {st.won} won · win streak {st.streak} (best {st.bestStreak})
                </div>
              )
            })()}
            <div style={{ display: 'grid', gap: 10 }}>
              {history.map((r) => {
                const hero = HEROES.find((h) => h.id === r.heroId)
                const foe = FOES.find((f) => f.id === r.foeId)
                return (
                  <div key={r.day}>
                    <div>
                      <span aria-hidden>{r.outcome === 'won' ? '🏆' : '💀'}</span>{' '}
                      <strong>{r.day}</strong> · {TIER_LABEL[r.tier]} · {hero?.name ?? r.heroId} vs {foe?.name ?? r.foeId}
                    </div>
                    <div className="faint" style={{ fontSize: 12 }}>
                      {r.outcome === 'won' ? 'Won' : 'Lost'} in {r.rounds} round{r.rounds === 1 ? '' : 's'} · {r.heroHpLeft}/{r.heroHpMax} HP left
                    </div>
                    <div aria-label="Roll-by-roll results" style={{ wordBreak: 'break-all', lineHeight: 1.2 }}>{gridEmoji(r.grid)}</div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="faint" style={{ fontSize: 13 }}>Finished duels show up here.</div>
        )}
        {!user && (
          <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
            Your history is saved in this browser. Sign in to keep it across your devices.
          </div>
        )}
      </div>
    </div>
  )
}
