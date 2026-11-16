import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../auth/AuthProvider'
import { TokenIcon } from '../components/TokenIcon'
import { getDuelHistory, saveDuelResult } from '../db/repo'
import { isDemo } from '../lib/demo'
import {
  availableAttacks, averageDamage, canDodge, canUseSignature, challengeLink, chooseAttack, compareToChallenge,
  dailyTier, dailyTwist, endTurn, foeAc, foeAttackMode, foeIntent, foeOf, gridEmoji, heroAc, heroAttackMode, heroOf,
  heroAttacks, heroToHit, historyStats, hitChance, loadDuel, parseChallenge, rollPending, saveDuel, shareText, signatureOf,
  startDuel, toDuelRecord, twistOf, useDodge, useSignature, utcDayKey, type DuelState, type LogEntry, type Side,
} from '../lib/dailyDuel'
import type { DuelFxKind } from '../lib/duelFx'
import { DUELIST_ICONS, FOES, HEROES, TIER_LABEL, type DuelAttack } from '../data/duelists'
import { GENERIC_TOKEN_ICON } from '../lib/tokenIcons'

// Daily Duel (T-63, T-65): one Wordle-style 1v1 per UTC day, same matchup and
// twist for everyone. Public (no sign-in) and local-only — it never calls
// Supabase, and it is hidden in the demo.
//
// The engine (lib/dailyDuel.ts) resolves every roll the moment you act and
// records it in the log. This page replays the new log entries one at a time:
// the d20 tumbles, the swing plays, the damage dice roll, and only then do the
// hit point bars move. Reduced motion skips the tumbling and the effects.

const iconOf = (id: string) => DUELIST_ICONS[id] ?? GENERIC_TOKEN_ICON

/** Respect the visitor's reduced-motion setting (checked when each animation plays). */
const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

// ── Dice ─────────────────────────────────────────────────────────────────────

/** One outline per die type: d4 triangle, d6 square, d8 diamond, d10 kite, d12 pentagon, d20 hexagon. */
function DieShape({ sides }: { sides: number }) {
  switch (sides) {
    case 4: return <polygon points="50,6 95,88 5,88" />
    case 6: return <rect x="10" y="10" width="80" height="80" rx="14" />
    case 8: return <polygon points="50,4 94,50 50,96 6,50" />
    case 10: return <polygon points="50,4 92,38 50,96 8,38" />
    case 12: return <polygon points="50,4 96,38 79,93 21,93 4,38" />
    default: return (
      <>
        <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" />
        <polygon className="inner" points="50,22 78,68 22,68" />
      </>
    )
  }
}

interface DieProps {
  sides: number
  value: number | null
  tumbling?: boolean
  small?: boolean
  crit?: boolean
  fumble?: boolean
  dropped?: boolean
  ready?: boolean
  onClick?: () => void
  label?: string
}

/** A die that cycles random faces while `tumbling`, then shows `value`. */
function Die({ sides, value, tumbling, small, crit, fumble, dropped, ready, onClick, label }: DieProps) {
  const [face, setFace] = useState(value)
  useEffect(() => {
    if (!tumbling) { setFace(value); return }
    const t = setInterval(() => setFace(1 + Math.floor(Math.random() * sides)), 55)
    return () => clearInterval(t)
  }, [tumbling, value, sides])
  const cls = [
    'duel-die', small && 'sm', tumbling && 'tumble', crit && 'crit', fumble && 'fumble', dropped && 'dropped', ready && 'ready',
    !tumbling && value !== null && 'land',
  ].filter(Boolean).join(' ')
  const body = (
    <>
      <svg className="shape" viewBox="0 0 100 100" aria-hidden="true"><DieShape sides={sides} /></svg>
      <span className="num">{face ?? (sides === 20 ? '20' : '·')}</span>
    </>
  )
  return onClick || ready ? (
    <button type="button" className={cls} data-sides={sides} disabled={!ready} onClick={onClick} aria-label={label}>{body}</button>
  ) : (
    <div className={cls} data-sides={sides} role="img" aria-label={label}>{body}</div>
  )
}

// ── Effects ──────────────────────────────────────────────────────────────────

interface Fx {
  id: number
  kind: DuelFxKind
  /** The side the effect plays on (the target of an attack, or the actor for a self move). */
  side: Side
  swing: number
  crit: boolean
  /** Projectiles only: horizontal start and end inside the arena, and the height. */
  from?: number
  to?: number
  y?: number
}

const STAR = '50,4 60,36 92,22 70,48 96,60 62,64 66,96 50,72 34,96 38,64 4,60 30,48 8,22 40,36'
const RAYS = [-70, -30, 10, 50, 95, 140, 190, 235, 280]

function CutPaths() {
  return (
    <>
      <path className="trail" pathLength="1" d="M8 4 Q72 22 94 100" />
      <path className="core" pathLength="1" d="M8 4 Q72 22 94 100" />
      <path className="echo" pathLength="1" d="M0 24 Q60 40 84 104" />
    </>
  )
}

function FxItem({ fx }: { fx: Fx }) {
  switch (fx.kind) {
    case 'slash':
      return (
        <div className="duel-fxitem">
          <svg className={`slash fierce${fx.swing % 2 ? ' flip' : ''}`} viewBox="0 0 100 100"><CutPaths /></svg>
          {RAYS.map((a) => <span key={a} className="ray" style={{ ['--a' as string]: `${a}deg` }} />)}
          {fx.crit && <svg className={`slash fierce second${fx.swing % 2 ? '' : ' flip'}`} viewBox="0 0 100 100" style={{ animationDelay: '.11s' }}><CutPaths /></svg>}
        </div>
      )
    case 'smash':
      return (
        <div className="duel-fxitem">
          <svg className="slash heavy" viewBox="0 0 100 100"><path pathLength="1" d="M50 0 L50 96" /></svg>
          <span className="ring" />
        </div>
      )
    case 'arc':
      return (
        <div className="duel-fxitem">
          <svg className="slash wide" viewBox="0 0 100 100"><path pathLength="1" d="M0 80 Q50 -20 100 80" /></svg>
          <span className="ring" />
        </div>
      )
    case 'burst':
      return (
        <div className="duel-fxitem">
          <svg className="burst" viewBox="0 0 100 100"><polygon points={STAR} /></svg>
          <span className="ring small" />
        </div>
      )
    case 'heal':
      return (
        <div className="duel-fxitem">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="spark" style={{ left: `${10 + ((i * 37) % 80)}%`, animationDelay: `${i * 70}ms` }} />
          ))}
        </div>
      )
    case 'surge':
    case 'buff':
      return <div className="duel-fxitem"><span className="ring" /><span className="ring d2" /></div>
    case 'ward':
      return <div className="duel-fxitem"><span className="ring ward" /><span className="ring ward d2" /></div>
    case 'dodge':
      return (
        <div className="duel-fxitem">
          <span className="speed" style={{ top: '28%' }} />
          <span className="speed" style={{ top: '48%', animationDelay: '60ms' }} />
          <span className="speed" style={{ top: '68%', animationDelay: '120ms' }} />
        </div>
      )
    default:
      return null
  }
}

/** How long an effect stays on screen before it is removed. */
const FX_MS: Record<DuelFxKind, number> = {
  slash: 800, smash: 800, arc: 800, burst: 700, spear: 500, heal: 1400, surge: 900, buff: 900, ward: 900, dodge: 800,
}

// ── Pieces ───────────────────────────────────────────────────────────────────

interface Floater { id: number; side: Side; text: string; cls: 'dmg' | 'crit' | 'heal' | 'miss' }

function Fighter({
  side, name, iconId, hp, max, ac, chips, spriteCls, spriteKey, floaters, fxs,
}: {
  side: Side; name: string; iconId: string; hp: number; max: number; ac: number
  chips: string[]; spriteCls: string; spriteKey: number; floaters: Floater[]; fxs: Fx[]
}) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100))
  return (
    <div className={`duel-fighter ${side}`}>
      <div className="duel-floats" aria-hidden="true">
        {floaters.map((f) => <span key={f.id} className={`duel-float ${f.cls}`}>{f.text}</span>)}
      </div>
      <div className="duel-fxbox" aria-hidden="true">
        {fxs.filter((x) => x.kind !== 'spear').map((x) => <FxItem key={x.id} fx={x} />)}
      </div>
      <span key={spriteKey} className={`duel-token ${spriteCls}`} aria-hidden="true"><TokenIcon id={iconId} size={54} /></span>
      <div className="duel-name">
        <span>{name}</span>
        <span className="duel-chips">{chips.map((c) => <span key={c} className="duel-chip">{c}</span>)}</span>
      </div>
      <div
        className="duel-bar"
        role="progressbar"
        aria-label={`${name} hit points`}
        aria-valuenow={Math.max(0, hp)}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div className="ghost" style={{ width: `${pct}%` }} />
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="duel-hp">{Math.max(0, hp)} / {max} HP · AC {ac}</div>
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
function BattleLog({ log }: { log: LogEntry[] }) {
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
              const rolls = e.d20s && e.d20s.length > 1 ? `d20 ${e.d20s.join('/')} (keeps ${e.d20})` : `d20 ${e.d20}`
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
                    <strong>{e.who}</strong>
                    <span>used {e.attack}</span>
                    <span style={{ background: chip.bg, color: chip.fg, borderRadius: 4, padding: '0 6px', fontSize: 11, fontWeight: 700 }}>
                      {chip.label}
                    </span>
                    {hit && (
                      <strong style={{ marginLeft: 'auto', color: mine ? '#16a34a' : '#dc2626' }}>
                        −{e.damage} HP{e.warded ? ' (halved)' : ''}
                      </strong>
                    )}
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                    {rolls} {(e.bonus ?? 0) >= 0 ? '+' : '−'} {Math.abs(e.bonus ?? 0)} = {e.total} vs AC {e.ac}
                    {hit && e.dice && e.dice.length > 0 && ` · damage ${e.dice.map((d) => d.value).join(' + ')}${e.flat ? ` + ${e.flat}` : ''}`}
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

// ── Page ─────────────────────────────────────────────────────────────────────

interface View { hero: number; foe: number; shown: number; round: number; intent: string; acting: Side | null }
const viewOf = (d: DuelState): View => ({ hero: d.heroHp, foe: d.foeHp, shown: d.log.length, round: d.round, intent: d.intent, acting: null })

interface D20View { values: number[]; kept: number; tumbling: boolean; crit: boolean; fumble: boolean; label: string }
interface DmgView { dice: { sides: number; value: number }[]; flat: number; tumbling: boolean; total: number | null; label: string }

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, reducedMotion() ? Math.min(ms, 40) : ms))

export function DailyDuelPage() {
  const demo = isDemo()
  const day = utcDayKey()
  const [duel, setDuel] = useState<DuelState | null>(() => (demo ? null : loadDuel(day)))
  const [view, setView] = useState<View | null>(() => (duel ? viewOf(duel) : null))
  const [busy, setBusy] = useState(false)
  const [d20, setD20] = useState<D20View | null>(null)
  const [dmg, setDmg] = useState<DmgView | null>(null)
  const [fxs, setFxs] = useState<Fx[]>([])
  const [floaters, setFloaters] = useState<Floater[]>([])
  const [sprites, setSprites] = useState<Record<Side, { cls: string; k: number }>>({ hero: { cls: '', k: 0 }, foe: { cls: '', k: 0 } })
  const [copied, setCopied] = useState(false)
  const arena = useRef<HTMLDivElement>(null)
  const logEnd = useRef<HTMLDivElement>(null)
  const run = useRef(0)
  const ids = useRef(1)
  const [params] = useSearchParams()
  const challenge = parseChallenge(params.get('beat'))

  useEffect(() => {
    if (duel && !demo) saveDuel(duel)
  }, [duel, demo])

  // A finished duel goes into the battle history (one row per UTC day, so a
  // reload can't duplicate it). Signed in, it then syncs with the account.
  // It waits for the replay to end so the result isn't spoiled early.
  useEffect(() => {
    const rec = duel && !demo && !busy ? toDuelRecord(duel) : null
    if (rec) saveDuelResult(rec).catch(() => {})
  }, [duel, demo, busy])

  useEffect(() => () => { run.current++ }, []) // stop a replay when leaving the page

  const { user } = useAuth()
  const history = useLiveQuery(() => (demo ? Promise.resolve([]) : getDuelHistory()), [demo])

  useEffect(() => {
    logEnd.current?.scrollIntoView?.({ block: 'nearest' })
  }, [view?.shown])

  const confetti = useMemo(
    () => Array.from({ length: 34 }, (_, i) => {
      const ang = Math.random() * Math.PI * 2
      const dist = 90 + Math.random() * 200
      return {
        i, dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist - 60, rot: Math.random() * 720 - 360,
        color: ['var(--duel-gold)', 'var(--accent)', 'var(--good)', 'var(--text)'][i % 4],
      }
    }),
    [],
  )

  if (demo) return <Navigate to="/" replace />

  const todaysTwist = dailyTwist(day)
  const hero = duel ? heroOf(duel) : null
  const foe = duel ? foeOf(duel) : null
  const twist = duel ? twistOf(duel) : null
  const sig = duel ? signatureOf(duel) : null
  const live = view ?? (duel ? viewOf(duel) : null)
  const over = !!duel && duel.outcome !== 'playing' && !busy
  const aiming = !!duel && !busy && !!duel.pending && duel.outcome === 'playing'
  const idle = !!duel && !busy && !duel.pending && duel.outcome === 'playing'

  // ── Effects helpers ─────────────────────────────────────────────────────────
  const timers = (fn: () => void, ms: number) => { setTimeout(fn, ms) }
  const kick = (side: Side, cls: string) => setSprites((s) => ({ ...s, [side]: { cls, k: s[side].k + 1 } }))
  /** Replays a full-arena flash or rumble without remounting the arena (which would reset every animation). */
  const flashArena = (kind: string) => {
    const el = arena.current
    if (!el || !kind || reducedMotion()) return
    const cls = `flash-${kind}`
    el.classList.remove(cls)
    void el.offsetWidth
    el.classList.add(cls)
    timers(() => el.classList.remove(cls), 800)
  }
  const float = (side: Side, text: string, cls: Floater['cls']) => {
    const id = ids.current++
    setFloaters((f) => [...f, { id, side, text, cls }])
    timers(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1500)
  }
  const spawnFx = (kind: DuelFxKind, side: Side, swing = 0, crit = false) => {
    if (reducedMotion()) return
    const id = ids.current++
    const item: Fx = { id, kind, side, swing, crit }
    if (kind === 'spear' && arena.current) {
      const box = arena.current.getBoundingClientRect()
      const centre = (s: Side) => {
        const el = arena.current!.querySelector(`.duel-fighter.${s} .duel-token`)
        const r = el?.getBoundingClientRect()
        return r ? { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 } : { x: 0, y: 0 }
      }
      const target = centre(side)
      const source = centre(side === 'hero' ? 'foe' : 'hero')
      item.from = source.x
      item.to = target.x
      item.y = target.y
    }
    setFxs((f) => [...f, item])
    timers(() => setFxs((f) => f.filter((x) => x.id !== id)), FX_MS[kind])
    if (kind === 'slash' || kind === 'smash' || kind === 'arc') timers(() => flashArena('rumble'), 160)
  }

  // ── Replay one log entry ────────────────────────────────────────────────────
  async function playEntry(e: LogEntry, alive: () => boolean, firstOfTurn: boolean) {
    const setHp = (side: Side, hp: number | undefined) => {
      if (hp === undefined) return
      setView((v) => (v ? { ...v, [side]: hp } : v))
    }
    if (e.attack !== undefined && e.d20s && e.to) {
      const mine = e.side === 'hero'
      setView((v) => (v ? { ...v, acting: e.side } : v))
      if (!mine && firstOfTurn) await sleepMs(450)
      if (!alive()) return
      setDmg(null)
      const kept = Math.max(0, e.d20s.indexOf(e.d20 ?? 0))
      const label = `${e.who}'s attack roll`
      setD20({ values: e.d20s, kept, tumbling: true, crit: false, fumble: false, label })
      await sleepMs(650 + (e.d20s.length > 1 ? 200 : 0))
      if (!alive()) return
      setD20({ values: e.d20s, kept, tumbling: false, crit: e.d20 === 20, fumble: e.d20 === 1, label })
      await sleepMs(350)
      if (!alive()) return
      const fx = e.fx && e.fx !== 'dodge' ? e.fx : 'slash'
      kick(e.side, mine ? 'lunge-hero' : 'lunge-foe')
      spawnFx(fx, e.to, e.attack.length % 2, e.kind === 'crit')
      await sleepMs(fx === 'spear' ? 420 : 300)
      if (!alive()) return
      if (e.kind === 'hit' || e.kind === 'crit') {
        const dice = e.dice ?? []
        setDmg({ dice, flat: e.flat ?? 0, tumbling: true, total: null, label: `${dice.length} damage ${dice.length === 1 ? 'die' : 'dice'}` })
        await sleepMs(550 + dice.length * 90)
        if (!alive()) return
        setDmg({ dice, flat: e.flat ?? 0, tumbling: false, total: e.damage ?? 0, label: 'Damage' })
        await sleepMs(350)
        if (!alive()) return
        setHp(e.to, e.targetHp)
        float(e.to, `−${e.damage ?? 0}`, e.kind === 'crit' ? 'crit' : 'dmg')
        kick(e.to, 'shake')
        flashArena(e.kind === 'crit' ? 'crit' : !mine ? 'hurt' : '')
        await sleepMs(520)
      } else {
        float(e.to, 'MISS', 'miss')
        kick(e.to, 'sway')
        await sleepMs(450)
      }
      return
    }
    if (e.heal !== undefined && e.to) {
      if (e.dice && e.dice.length > 0) {
        const dice = e.dice
        setDmg({ dice, flat: e.flat ?? 0, tumbling: true, total: null, label: 'Healing dice' })
        await sleepMs(550 + dice.length * 90)
        if (!alive()) return
        setDmg({ dice, flat: e.flat ?? 0, tumbling: false, total: e.heal, label: 'Healing' })
        await sleepMs(300)
        if (!alive()) return
      }
      spawnFx('heal', e.to)
      kick(e.to, 'glow')
      setHp(e.to, e.targetHp)
      float(e.to, `+${e.heal}`, 'heal')
      await sleepMs(650)
      return
    }
    if (e.fx) {
      spawnFx(e.fx, e.side)
      kick(e.side, e.fx === 'dodge' ? 'sidestep' : 'glow')
      if (e.fx === 'surge') float(e.side, 'SURGE!', 'heal')
      await sleepMs(550)
    }
  }

  /** Replays everything the engine logged between `prev` and `next`, then catches the view up. */
  async function play(prev: DuelState, next: DuelState) {
    const my = ++run.current
    const alive = () => run.current === my
    setBusy(true)
    setView({ ...viewOf(prev), shown: prev.log.length })
    const entries = next.log.slice(prev.log.length)
    let first = true
    let shown = prev.log.length
    for (const e of entries) {
      if (!alive()) return
      await playEntry(e, alive, first && e.side === 'foe')
      if (e.attack !== undefined) first = false
      shown++
      if (!alive()) return
      setView((v) => (v ? { ...v, shown } : v))
    }
    if (!alive()) return
    setView(viewOf(next))
    if (next.outcome === 'won') {
      kick('foe', 'fall')
    } else if (next.outcome === 'lost') {
      kick('hero', 'fall')
    }
    setBusy(false)
  }

  function act(next: DuelState) {
    if (!duel || next === duel) return
    const prev = duel
    setDuel(next)
    if (next.log.length === prev.log.length) {
      setView(viewOf(next)) // nothing to replay (for example, choosing an attack)
      return
    }
    void play(prev, next)
  }

  function begin() {
    const first = startDuel(day)
    setDuel(first)
    setView({ ...viewOf(first), shown: 0 })
    setD20(null)
    setDmg(null)
    void play({ ...first, log: [] }, first)
  }

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

  // ── Derived display ─────────────────────────────────────────────────────────
  const intent = duel && live ? (foeOf(duel).attacks.find((a) => a.id === live.intent) ?? foeIntent(duel)) : null
  const foeMode = duel ? foeAttackMode(duel) : 'normal'
  const intentOdds = duel && intent ? hitChance(intent.toHit, heroAc(duel), foeMode) : 0
  const intentOddsDodge = duel && intent ? hitChance(intent.toHit, heroAc(duel), 'dis') : 0
  const pct = (p: number) => `${Math.round(p * 100)}%`
  const heroChips = duel
    ? [duel.dodging && 'Dodging', duel.adv && 'Advantage', duel.ward && 'Warded', duel.rage > 0 && `+${duel.rage} damage`, duel.strikeDice && `+${duel.strikeDice} next hit`].filter(Boolean) as string[]
    : []
  const foeChips = duel ? [duel.hinder && 'Hindered'].filter(Boolean) as string[] : []

  function moveMeta(a: DuelAttack): string {
    if (!duel) return ''
    const p = hitChance(heroToHit(duel, a), foeAc(duel), heroAttackMode(duel))
    return `+${heroToHit(duel, a)} · ${a.damage}${a.times && a.times > 1 ? ` ×${a.times}` : ''} · ${pct(p)} to hit`
  }

  const pending = duel?.pending ? heroAttacks(heroOf(duel)).find((a) => a.id === duel.pending!.attackId) ?? null : null
  const swingNo = duel?.pending && pending ? (pending.times ?? 1) - duel.pending.left + 1 : 0

  return (
    <div className="content duel">
      <div className="page-header">
        <div>
          <h1 className="mb-0">Daily Duel</h1>
          <div className="subtitle">One duel a day, the same for everyone. Resets at midnight UTC ({day}).</div>
        </div>
      </div>

      {challenge && (
        <div className="card" style={{ maxWidth: 720, marginBottom: 16 }}>
          <strong>A friend challenged you.</strong>{' '}
          {challenge.outcome === 'won'
            ? `They won in ${challenge.rounds} round${challenge.rounds === 1 ? '' : 's'} with ${challenge.hpLeft} HP left.`
            : 'They were defeated. Can you win?'}
          {challenge.day !== day && (
            <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
              That challenge was for {challenge.day}. You’re playing today’s duel instead.
            </div>
          )}
          {challenge.day === day && duel && over && (
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
            Each turn, pick a move, then tap the d20 to roll it. If the total meets or beats the target’s
            Armor Class, it hits and you roll damage. A natural 20 always hits and doubles the damage dice,
            and a natural 1 always misses. Your opponent shows its next attack before you choose, so you can
            decide whether to strike, dodge, or save your signature move. You trade turns until one of you
            drops to 0 HP, and you get one try a day. Today’s difficulty: {TIER_LABEL[dailyTier(day)]}.
          </p>
          <p className="faint">Today’s twist: <strong>{todaysTwist.name}</strong>. {todaysTwist.text}</p>
          <button className="btn primary" onClick={begin}>Roll initiative</button>
        </div>
      )}

      {duel && hero && foe && live && (
        <div className="duel-stack">
          {twist && (
            <div className="card duel-twist" aria-live="polite">
              <span className="duel-eyebrow">Today’s twist</span>
              <strong>{twist.name}</strong>
              <span className="faint">{twist.text}</span>
            </div>
          )}

          <div ref={arena} className="duel-arena card">
            <Fighter
              side="hero" name={hero.name} iconId={iconOf(hero.id)} hp={live.hero} max={hero.hp} ac={heroAc(duel)}
              chips={heroChips} spriteCls={sprites.hero.cls} spriteKey={sprites.hero.k}
              floaters={floaters.filter((f) => f.side === 'hero')} fxs={fxs.filter((x) => x.side === 'hero')}
            />
            <div className="duel-vs"><b>VS</b><small>{TIER_LABEL[duel.tier]} · Round {live.round}</small></div>
            <Fighter
              side="foe" name={foe.name} iconId={iconOf(foe.id)} hp={live.foe} max={foe.hp} ac={foeAc(duel)}
              chips={foeChips} spriteCls={sprites.foe.cls} spriteKey={sprites.foe.k}
              floaters={floaters.filter((f) => f.side === 'foe')} fxs={fxs.filter((x) => x.side === 'foe')}
            />
            {fxs.filter((x) => x.kind === 'spear').map((x) => (
              <span
                key={x.id}
                className={`duel-spear${(x.from ?? 0) > (x.to ?? 0) ? ' left' : ''}`}
                style={{ ['--from' as string]: `${x.from}px`, ['--to' as string]: `${x.to}px`, top: (x.y ?? 0) - 6 }}
                aria-hidden="true"
              >
                <svg viewBox="0 0 80 12"><line x1="2" y1="6" x2="66" y2="6" /><polygon points="62,1 80,6 62,11" /></svg>
              </span>
            ))}
            {live.acting === null && over && duel.outcome === 'won' && confetti.map((c) => (
              <span
                key={c.i} className="duel-confetti" aria-hidden="true"
                style={{ background: c.color, ['--dx' as string]: `${c.dx}px`, ['--dy' as string]: `${c.dy}px`, ['--rot' as string]: `${c.rot}deg` }}
              />
            ))}
          </div>

          {duel.outcome === 'playing' && intent && (
            <div className={`card duel-intent${busy && live.acting === 'foe' ? ' acting' : ''}`} aria-live="polite">
              <div className="duel-eyebrow">{foe.name}’s next move</div>
              <div className="duel-intent-row">
                <span className="duel-intent-name">{intent.name}</span>
                <span className={`duel-odds ${intentOdds >= 0.4 ? 'high' : intentOdds <= 0.25 ? 'low' : ''}`}>
                  {pct(intentOdds)} to hit you{duel.dodging ? ' (dodging)' : ''}
                </span>
              </div>
              <div className="faint" style={{ fontSize: 13 }}>
                +{intent.toHit} to hit · {intent.damage}{intent.times && intent.times > 1 ? ` ×${intent.times}` : ''} (avg {Math.round(averageDamage(intent.damage))}
                {intent.times && intent.times > 1 ? ' each' : ''})
                {!duel.dodging && foeMode === 'normal' && ` · Dodge makes it ${pct(intentOddsDodge)} and halves its first hit`}
              </div>
            </div>
          )}

          <div className="card duel-tray">
            <div className="duel-roller">
              <div>
                <div className="duel-dice">
                  {aiming ? (
                    <Die sides={20} value={null} ready onClick={() => act(rollPending(duel))} label="Roll the d20" />
                  ) : d20 ? (
                    d20.values.map((v, i) => (
                      <Die
                        key={i} sides={20} value={v} tumbling={d20.tumbling}
                        crit={!d20.tumbling && i === d20.kept && d20.crit} fumble={!d20.tumbling && i === d20.kept && d20.fumble}
                        dropped={!d20.tumbling && d20.values.length > 1 && i !== d20.kept}
                        label={`${d20.label}: ${v}`}
                      />
                    ))
                  ) : (
                    <Die sides={20} value={null} label="d20" />
                  )}
                </div>
                <div className="duel-die-label">{!aiming && d20 && d20.values.length > 1 ? `${d20.values.length} × d20` : 'd20'}</div>
              </div>
              {dmg && (
                <div className="duel-dmg">
                  <div className="duel-dmg-dice">
                    {dmg.dice.map((d, i) => <Die key={i} sides={d.sides} value={d.value} tumbling={dmg.tumbling} small label={`d${d.sides}: ${d.value}`} />)}
                    {dmg.total !== null && (
                      <span className="duel-sum">{dmg.flat ? <span className="plus">+ {dmg.flat}</span> : null}= {dmg.total}</span>
                    )}
                  </div>
                  <div className="duel-die-label">{dmg.label}</div>
                </div>
              )}
              <div className="duel-msg" aria-live="polite">
                {over ? (
                  <>
                    <div className="big">{duel.outcome === 'won' ? `Victory in ${duel.round} round${duel.round === 1 ? '' : 's'}!` : 'Defeat'}</div>
                    <div className="faint">{duel.outcome === 'won' ? `${foe.name} falls.` : `${foe.name} wins this one.`}</div>
                  </>
                ) : aiming && pending ? (
                  <>
                    <div className="big">
                      Tap the d20 to roll {pending.name}{(pending.times ?? 1) > 1 ? ` (swing ${swingNo} of ${pending.times})` : ''}
                    </div>
                    <div className="faint">
                      You need {Math.max(2, foeAc(duel) - heroToHit(duel, pending))}+ to hit AC {foeAc(duel)}
                      {heroAttackMode(duel) === 'adv' ? ', and you roll with advantage' : ''}. A 20 crits and a 1 always misses.
                    </div>
                  </>
                ) : busy ? (
                  <div className="big">{live.acting === 'foe' ? `${foe.name} is acting…` : 'Rolling…'}</div>
                ) : (
                  <>
                    <div className="big">Your turn</div>
                    <div className="faint">Pick a move. Moves that need an action or bonus action are used up for the turn.</div>
                  </>
                )}
              </div>
            </div>

            {duel.outcome === 'playing' ? (
              <div className="duel-moves" role="group" aria-label="Moves">
                {heroAttacks(hero).map((a) => {
                  const usable = idle && availableAttacks(duel).some((x) => x.id === a.id)
                  return (
                    <button key={a.id} type="button" className="duel-move" disabled={!usable} onClick={() => act(chooseAttack(duel, a.id))}>
                      <span className="top"><span className="nm">{a.name}</span><span className="tag">{a.kind === 'action' ? 'Action' : 'Bonus'}</span></span>
                      <span className="meta">{moveMeta(a)}{a.id === 'power' ? ' · −5 to hit, +6 per hit' : ''}</span>
                    </button>
                  )
                })}
                <button type="button" className="duel-move" disabled={!(idle && canDodge(duel))} onClick={() => act(useDodge(duel))}>
                  <span className="top"><span className="nm">Dodge</span><span className="tag">Action</span></span>
                  <span className="meta">Foe attacks at disadvantage; its first hit deals half damage</span>
                </button>
                {sig && (
                  <button type="button" className="duel-move signature" disabled={!(idle && canUseSignature(duel))} onClick={() => act(useSignature(duel))}>
                    <span className="top"><span className="nm">{sig.name}</span><span className="tag once">{sig.cost === 'bonus' ? 'Bonus' : 'Free'} · once</span></span>
                    <span className="meta">{sig.blurb} · {duel.sigUsed ? 'used' : sig.kind === 'surge' && !duel.actionUsed ? 'after your action' : 'ready'}</span>
                  </button>
                )}
                <button type="button" className="duel-move end" disabled={!idle} onClick={() => act(endTurn(duel))}>End turn</button>
              </div>
            ) : over ? (
              <div>
                <pre style={{ margin: '8px 0', fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{shareText(duel)}</pre>
                <button className="btn primary" onClick={share}>{copied ? 'Copied!' : 'Copy result and challenge link'}</button>
                <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>A new duel arrives at midnight UTC.</div>
              </div>
            ) : null}
          </div>

          <div className="card" aria-live="polite">
            <h3>Battle log</h3>
            <div style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 8 }}>
              <BattleLog log={duel.log.slice(0, live.shown)} />
              <div ref={logEnd} />
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 720, marginTop: 16 }}>
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
                const h = HEROES.find((x) => x.id === r.heroId)
                const f = FOES.find((x) => x.id === r.foeId)
                return (
                  <div key={r.day}>
                    <div>
                      <span aria-hidden>{r.outcome === 'won' ? '🏆' : '💀'}</span>{' '}
                      <strong>{r.day}</strong> · {TIER_LABEL[r.tier]} · {h?.name ?? r.heroId} vs {f?.name ?? r.foeId}
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
