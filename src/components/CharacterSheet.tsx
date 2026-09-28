import { useEffect, useRef, useState } from 'react'
import type { AbilityKey, CharacterClass, CharacterItem, CharacterSheet } from '../db/types'
import { ABILITIES, abilityMod, signed } from '../lib/statblock'
import { parseDdbId, fetchDdbCharacter, mapDdbCharacter, extractBackstoryHtml } from '../lib/ddb'
import { NumberField } from './NumberField'
import { Icon } from './Icon'

// Structured "My Character" sheet (v1). All fields editable + autosaved by the
// caller; backstory lives in the entry's rich-text body, not here. Numbers use
// NumberField (steppers + scroll). D&D Beyond import fills these in; AC and a few
// derived values may need a manual "verify" pass.

const SKILLS: { name: string; ability: AbilityKey }[] = [
  { name: 'Acrobatics', ability: 'dex' }, { name: 'Animal Handling', ability: 'wis' },
  { name: 'Arcana', ability: 'int' }, { name: 'Athletics', ability: 'str' },
  { name: 'Deception', ability: 'cha' }, { name: 'History', ability: 'int' },
  { name: 'Insight', ability: 'wis' }, { name: 'Intimidation', ability: 'cha' },
  { name: 'Investigation', ability: 'int' }, { name: 'Medicine', ability: 'wis' },
  { name: 'Nature', ability: 'int' }, { name: 'Perception', ability: 'wis' },
  { name: 'Performance', ability: 'cha' }, { name: 'Persuasion', ability: 'cha' },
  { name: 'Religion', ability: 'int' }, { name: 'Sleight of Hand', ability: 'dex' },
  { name: 'Stealth', ability: 'dex' }, { name: 'Survival', ability: 'wis' },
]
const COINS: (keyof NonNullable<CharacterSheet['currency']>)[] = ['pp', 'gp', 'ep', 'sp', 'cp']

export function emptyCharacterSheet(): CharacterSheet {
  return {
    species: '', classes: [], background: '', alignment: '', level: 1,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [], skillProficiencies: [],
    ac: null, maxHp: null, currentHp: null, tempHp: 0,
    speeds: {}, senses: '', currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  }
}

export function totalLevel(cs: CharacterSheet): number {
  return cs.classes.reduce((s, c) => s + (c.level || 0), 0) || cs.level || 1
}
function profBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4)
}

export function CharacterSheetEditor({ value, onChange }: { value: CharacterSheet; onChange: (v: CharacterSheet) => void }) {
  const set = (p: Partial<CharacterSheet>) => onChange({ ...value, ...p })
  const level = totalLevel(value)
  const pb = value.proficiencyBonus ?? profBonus(level)
  const skillSet = new Set(value.skillProficiencies)

  const setClass = (i: number, p: Partial<CharacterClass>) =>
    set({ classes: value.classes.map((c, j) => (j === i ? { ...c, ...p } : c)) })
  const addClass = () => set({ classes: [...value.classes, { name: '', level: 1 }] })
  const removeClass = (i: number) => set({ classes: value.classes.filter((_, j) => j !== i) })

  return (
    <div className="char-sheet">
      {/* Identity */}
      <div className="char-identity">
        {value.avatarUrl && <img className="char-portrait" src={value.avatarUrl} alt="" />}
        <div className="char-id-fields">
          <div className="char-id-grid">
            <label className="field"><span>Species</span><input className="input" value={value.species} onChange={(e) => set({ species: e.target.value })} placeholder="e.g. Hill Dwarf" /></label>
            <label className="field"><span>Background</span><input className="input" value={value.background} onChange={(e) => set({ background: e.target.value })} placeholder="e.g. Soldier" /></label>
            <label className="field"><span>Alignment</span><input className="input" value={value.alignment} onChange={(e) => set({ alignment: e.target.value })} placeholder="e.g. Neutral Good" /></label>
            <div className="field"><span>Total level</span><div className="char-readout">{level}</div></div>
          </div>
          <div className="char-classes">
            <span className="char-sub-label">Classes</span>
            {value.classes.map((c, i) => (
              <div key={i} className="char-class-row">
                <input className="input" style={{ flex: '2 1 120px' }} value={c.name} onChange={(e) => setClass(i, { name: e.target.value })} placeholder="Class" />
                <input className="input" style={{ flex: '2 1 120px' }} value={c.subclass ?? ''} onChange={(e) => setClass(i, { subclass: e.target.value })} placeholder="Subclass" />
                <NumberField className="char-lvl" value={c.level} min={1} onChange={(v) => setClass(i, { level: v ?? 1 })} ariaLabel="Class level" />
                <button className="btn ghost small" onClick={() => removeClass(i)} aria-label="Remove class"><Icon name="x" size={13} /></button>
              </div>
            ))}
            <button className="btn ghost small" onClick={addClass}><Icon name="plus" size={13} /> Add class</button>
          </div>
        </div>
      </div>

      {/* Vitals */}
      <div className="char-vitals">
        <Vital label="AC" hint={value.ac == null ? 'verify' : undefined}>
          <NumberField className="char-num" value={value.ac ?? null} min={0} placeholder="—" onChange={(v) => set({ ac: v })} ariaLabel="Armor Class" />
        </Vital>
        <Vital label="Current HP">
          <NumberField className="char-num" value={value.currentHp ?? null} min={0} placeholder="—" onChange={(v) => set({ currentHp: v })} ariaLabel="Current HP" />
        </Vital>
        <Vital label="Max HP">
          <NumberField className="char-num" value={value.maxHp ?? null} min={0} placeholder="—" onChange={(v) => set({ maxHp: v })} ariaLabel="Max HP" />
        </Vital>
        <Vital label="Temp HP">
          <NumberField className="char-num" value={value.tempHp ?? 0} min={0} onChange={(v) => set({ tempHp: v ?? 0 })} ariaLabel="Temp HP" />
        </Vital>
        <Vital label="Speed">
          <NumberField className="char-num" value={value.speeds.walk ?? null} min={0} placeholder="—" onChange={(v) => set({ speeds: { ...value.speeds, walk: v ?? undefined } })} ariaLabel="Walking speed" />
        </Vital>
        <div className="char-vital"><span className="char-vital-label">Prof</span><div className="char-readout">{signed(pb)}</div></div>
        <div className="char-vital"><span className="char-vital-label">Init</span><div className="char-readout">{signed(abilityMod(value.abilities.dex))}</div></div>
      </div>

      {/* Abilities */}
      <div className="char-abilities">
        {ABILITIES.map(({ key, label }) => {
          const mod = abilityMod(value.abilities[key])
          const saveProf = value.saveProficiencies.includes(key)
          return (
            <div key={key} className="char-ability">
              <span className="char-ability-label">{label}</span>
              <NumberField className="char-ability-score" value={value.abilities[key]} min={1} max={30}
                onChange={(v) => set({ abilities: { ...value.abilities, [key]: v ?? 10 } })} ariaLabel={`${label} score`} />
              <span className="char-ability-mod">{signed(mod)}</span>
              <label className="char-save">
                <input type="checkbox" checked={saveProf} onChange={() => set({
                  saveProficiencies: saveProf ? value.saveProficiencies.filter((k) => k !== key) : [...value.saveProficiencies, key],
                })} />
                <span>save {signed(mod + (saveProf ? pb : 0))}</span>
              </label>
            </div>
          )
        })}
      </div>

      {/* Skills */}
      <div className="char-skills-wrap">
        <span className="char-sub-label">Skills <span className="faint">(check proficient)</span></span>
        <div className="char-skills">
          {SKILLS.map((sk) => {
            const prof = skillSet.has(sk.name)
            const bonus = abilityMod(value.abilities[sk.ability]) + (prof ? pb : 0)
            return (
              <label key={sk.name} className={`char-skill${prof ? ' prof' : ''}`}>
                <input type="checkbox" checked={prof} onChange={() => {
                  const s = new Set(value.skillProficiencies)
                  if (s.has(sk.name)) s.delete(sk.name); else s.add(sk.name)
                  set({ skillProficiencies: [...s] })
                }} />
                <span className="char-skill-bonus">{signed(bonus)}</span>
                <span className="char-skill-name">{sk.name}</span>
                <span className="char-skill-ab faint">{sk.ability.toUpperCase()}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Senses + currency */}
      <div className="char-id-grid">
        <label className="field"><span>Senses</span><input className="input" value={value.senses ?? ''} onChange={(e) => set({ senses: e.target.value })} placeholder="e.g. Darkvision 60 ft." /></label>
        <div className="field">
          <span>Currency</span>
          <div className="char-coins">
            {COINS.map((c) => (
              <label key={c} className="char-coin">
                <span>{c.toUpperCase()}</span>
                <NumberField className="char-num" value={value.currency?.[c] ?? 0} min={0}
                  onChange={(v) => set({ currency: { ...(value.currency ?? { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }), [c]: v ?? 0 } })} ariaLabel={`${c} coins`} />
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Proficiencies & Languages */}
      <div className="char-section">
        <span className="char-sub-label">Proficiencies &amp; Languages</span>
        <div className="char-id-grid">
          <ListField label="Armor" value={value.proficiencies?.armor} onChange={(a) => set({ proficiencies: { armor: a, weapons: value.proficiencies?.weapons ?? [], tools: value.proficiencies?.tools ?? [] } })} />
          <ListField label="Weapons" value={value.proficiencies?.weapons} onChange={(a) => set({ proficiencies: { armor: value.proficiencies?.armor ?? [], weapons: a, tools: value.proficiencies?.tools ?? [] } })} />
          <ListField label="Tools" value={value.proficiencies?.tools} onChange={(a) => set({ proficiencies: { armor: value.proficiencies?.armor ?? [], weapons: value.proficiencies?.weapons ?? [], tools: a } })} />
          <ListField label="Languages" value={value.languages} onChange={(a) => set({ languages: a })} />
        </div>
      </div>

      {/* Defenses + feats */}
      <div className="char-section">
        <span className="char-sub-label">Defenses &amp; Feats</span>
        <div className="char-id-grid">
          <ListField label="Resistances" value={value.resistances} onChange={(a) => set({ resistances: a })} />
          <ListField label="Immunities" value={value.immunities} onChange={(a) => set({ immunities: a })} />
          <ListField label="Feats" value={value.feats} onChange={(a) => set({ feats: a })} />
        </div>
      </div>

      {/* Background & Personality */}
      <div className="char-section">
        <span className="char-sub-label">Background &amp; Personality</span>
        <label className="field" style={{ marginBottom: 10 }}><span>Background feature</span>
          <input className="input" value={value.backgroundFeature ?? ''} onChange={(e) => set({ backgroundFeature: e.target.value })} placeholder="e.g. Heart of Darkness" />
        </label>
        <div className="char-personality">
          {(['traits', 'ideals', 'bonds', 'flaws'] as const).map((k) => (
            <label key={k} className="field">
              <span style={{ textTransform: 'capitalize' }}>{k === 'traits' ? 'Personality traits' : k}</span>
              <textarea className="textarea" rows={2} value={value.personality?.[k] ?? ''}
                onChange={(e) => set({ personality: { ...value.personality, [k]: e.target.value } })} />
            </label>
          ))}
        </div>
      </div>

      {/* Inventory */}
      <InventoryEditor items={value.inventory ?? []} onChange={(inv) => set({ inventory: inv })} />

      {/* Tier 2 (imported, read-only): attacks, spells, features */}
      <Tier2Sections value={value} />
    </div>
  )
}

/** Filter items by a search box; return the visible slice + a "show more" control. */
function useItemSearch<T extends { name: string }>(items: T[], initial = 8) {
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(initial)
  const idx = items.map((it, i) => ({ it, i }))
  const filtered = q.trim() ? idx.filter((x) => x.it.name.toLowerCase().includes(q.trim().toLowerCase())) : idx
  const shown = filtered.slice(0, limit)
  const more = filtered.length - shown.length
  return { q, setQ: (v: string) => { setQ(v); setLimit(initial) }, shown, more, showMore: () => setLimit((l) => l + 12), setLimit }
}

function InventoryEditor({ items, onChange }: { items: CharacterItem[]; onChange: (items: CharacterItem[]) => void }) {
  const { q, setQ, shown, more, showMore, setLimit } = useItemSearch(items)
  const setItem = (i: number, p: Partial<CharacterItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)))
  return (
    <div className="char-section">
      <div className="row between" style={{ alignItems: 'center', marginBottom: 6, gap: 8 }}>
        <span className="char-sub-label" style={{ margin: 0 }}>Inventory {items.length > 0 && <span className="faint">({items.length})</span>}</span>
        <button className="btn ghost small" onClick={() => { onChange([...items, { name: '', qty: 1, equipped: false }]); setQ(''); setLimit(items.length + 1) }}><Icon name="plus" size={13} /> Add item</button>
      </div>
      {items.length > 6 && <input className="input" style={{ marginBottom: 8 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" aria-label="Search inventory" />}
      <div className="char-inv">
        {shown.map(({ it, i }) => (
          <div key={i} className="char-inv-row">
            <input className="input" style={{ flex: '2 1 140px' }} value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} placeholder="Item" />
            <NumberField className="char-lvl" value={it.qty} min={1} onChange={(v) => setItem(i, { qty: v ?? 1 })} ariaLabel="Quantity" />
            <label className="char-inv-eq"><input type="checkbox" checked={it.equipped} onChange={(e) => setItem(i, { equipped: e.target.checked })} /> eq</label>
            {it.rarity && <span className="char-rarity">{it.rarity}</span>}
            <button className="btn ghost small" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remove item"><Icon name="x" size={13} /></button>
          </div>
        ))}
      </div>
      {more > 0 && <button className="btn ghost small" style={{ marginTop: 6 }} onClick={showMore}>Show more ({more} left)</button>}
    </div>
  )
}

function InventoryView({ items }: { items: CharacterItem[] }) {
  const { q, setQ, shown, more, showMore } = useItemSearch(items)
  return (
    <div className="cv-inv">
      <div className="cv-inv-head">
        <div className="cv-label">Inventory <span className="faint">({items.length})</span></div>
        {items.length > 6 && <input className="input cv-inv-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search inventory" />}
      </div>
      <div className="cv-inv-list">
        {shown.map(({ it, i }) => (
          <span key={i} className="cv-item">
            {it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}
            {it.equipped && <span className="cv-item-tag">equipped</span>}
            {it.rarity && <span className="cv-item-tag faint">{it.rarity}</span>}
          </span>
        ))}
      </div>
      {more > 0 && <button className="btn ghost small" style={{ marginTop: 6 }} onClick={showMore}>Show more ({more} left)</button>}
    </div>
  )
}

const SPELL_LEVEL_LABEL = ['Cantrips', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

/** Features & Traits — searchable, progressive (import-derived, read-only). */
function FeatureList({ features }: { features: NonNullable<CharacterSheet['features']> }) {
  const { q, setQ, shown, more, showMore } = useItemSearch(features, 8)
  return (
    <div className="char-t2">
      <div className="cv-inv-head">
        <div className="cv-label">Features &amp; Traits <span className="faint">({features.length})</span></div>
        {features.length > 8 && <input className="input cv-inv-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search features" />}
      </div>
      <div className="t2-features">
        {shown.map(({ it, i }) => (
          <div key={i} className="t2-feat">
            <div className="t2-feat-head">
              <span className="t2-feat-name">{it.name}</span>
              {it.source && <span className="t2-badge">{it.source}{it.level ? ` ${it.level}` : ''}</span>}
            </div>
            {it.snippet && <div className="t2-feat-snip">{it.snippet}</div>}
          </div>
        ))}
      </div>
      {more > 0 && <button className="btn ghost small" style={{ marginTop: 6 }} onClick={showMore}>Show more ({more} left)</button>}
    </div>
  )
}

/** Attacks — weapons + special actions with computed to-hit / damage. */
function AttackTable({ attacks }: { attacks: NonNullable<CharacterSheet['attacks']> }) {
  return (
    <div className="char-t2">
      <div className="cv-label" style={{ marginBottom: 6 }}>Attacks <span className="faint">({attacks.length})</span></div>
      <div className="t2-attacks">
        {attacks.map((a, i) => (
          <div key={i} className="t2-atk">
            <span className="t2-atk-name">{a.name}</span>
            <span className="t2-atk-hit">{a.toHit != null ? signed(a.toHit) : '—'}</span>
            <span className="t2-atk-dmg">{a.damage || '—'}</span>
            <span className="t2-atk-note faint">{[a.range, a.note].filter(Boolean).join(' · ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Spells — save DC / attack bonus, slot ladder, grouped by level. */
function SpellList({ value }: { value: CharacterSheet }) {
  const spells = value.spells ?? []
  const sc = value.spellcasting
  const byLevel = new Map<number, typeof spells>()
  for (const s of spells) {
    const arr = byLevel.get(s.level) ?? []
    arr.push(s); byLevel.set(s.level, arr)
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b)
  const slots = value.spellSlots ?? []
  const pact = value.pactMagic ?? []
  return (
    <div className="char-t2">
      <div className="cv-label" style={{ marginBottom: 6 }}>Spells <span className="faint">({spells.length})</span></div>
      {sc && (sc.saveDc != null || sc.attackBonus != null) && (
        <div className="t2-spell-meta">
          {sc.ability && <span className="t2-badge">{sc.ability.toUpperCase()}</span>}
          {sc.saveDc != null && <span>Save DC <b>{sc.saveDc}</b></span>}
          {sc.attackBonus != null && <span>Attack <b>{signed(sc.attackBonus)}</b></span>}
        </div>
      )}
      {(slots.length > 0 || pact.length > 0) && (
        <div className="t2-slots">
          {slots.map((s) => <span key={`s${s.level}`} className="t2-slot"><b>{SPELL_LEVEL_LABEL[s.level] ?? s.level}</b> ×{s.total}</span>)}
          {pact.map((s) => <span key={`p${s.level}`} className="t2-slot t2-pact"><b>Pact {SPELL_LEVEL_LABEL[s.level] ?? s.level}</b> ×{s.total}</span>)}
        </div>
      )}
      {levels.map((lvl) => (
        <div key={lvl} className="t2-spell-group">
          <div className="t2-spell-lvl">{SPELL_LEVEL_LABEL[lvl] ?? `L${lvl}`}</div>
          <div className="t2-spell-chips">
            {(byLevel.get(lvl) ?? []).map((s, i) => (
              <span key={i} className={`t2-spell${s.prepared ? ' prepared' : ''}`} title={[s.school, s.source].filter(Boolean).join(' · ')}>
                {s.name}
                {s.concentration && <span className="t2-spell-tag" title="Concentration">C</span>}
                {s.ritual && <span className="t2-spell-tag" title="Ritual">R</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** All Tier 2 sections that have data (import-derived, read-only). */
function Tier2Sections({ value }: { value: CharacterSheet }) {
  const hasFeatures = (value.features ?? []).length > 0
  const hasAttacks = (value.attacks ?? []).length > 0
  const hasSpells = (value.spells ?? []).length > 0
  if (!hasFeatures && !hasAttacks && !hasSpells) return null
  return (
    <>
      {hasAttacks && <AttackTable attacks={value.attacks!} />}
      {hasSpells && <SpellList value={value} />}
      {hasFeatures && <FeatureList features={value.features!} />}
    </>
  )
}

/** A comma-separated list, edited as text and committed to string[] on blur. */
function ListField({ label, value, onChange }: { label: string; value?: string[]; onChange: (a: string[]) => void }) {
  const [raw, setRaw] = useState((value ?? []).join(', '))
  const editing = useRef(false)
  useEffect(() => { if (!editing.current) setRaw((value ?? []).join(', ')) }, [value])
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        value={raw}
        placeholder="comma-separated"
        onFocus={() => { editing.current = true }}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => { editing.current = false; onChange(raw.split(',').map((s) => s.trim()).filter(Boolean)) }}
      />
    </label>
  )
}

function Vital({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="char-vital">
      <span className="char-vital-label">{label}{hint && <span className="char-verify"> {hint}</span>}</span>
      {children}
    </div>
  )
}

/** Read-only display of a character sheet, styled like an NPC stat block. */
export function CharacterSheetView({ value, name }: { value: CharacterSheet; name?: string }) {
  const level = totalLevel(value)
  const pb = value.proficiencyBonus ?? profBonus(level)
  const classLine = value.classes.map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ''} ${c.level}`).join(' / ')
  const meta = [value.species, classLine, value.background, value.alignment].filter(Boolean).join(' · ')
  const saves = ABILITIES.filter((a) => value.saveProficiencies.includes(a.key))
    .map((a) => `${a.label} ${signed(abilityMod(value.abilities[a.key]) + pb)}`)
  const skills = SKILLS.filter((s) => (value.skillProficiencies ?? []).includes(s.name))
    .map((s) => `${s.name} ${signed(abilityMod(value.abilities[s.ability]) + pb)}`)
  const P = value.personality
  const line = (label: string, val?: string | null) =>
    val ? <div className="cv-line"><span className="cv-label">{label}</span> {val}</div> : null

  return (
    <div className="char-view">
      <div className="cv-head">
        {value.avatarUrl && <img className="char-portrait" src={value.avatarUrl} alt="" />}
        <div style={{ minWidth: 0 }}>
          {name && <div className="cv-name">{name}</div>}
          <div className="cv-sub">{meta || `Level ${level}`}</div>
        </div>
      </div>

      <div className="cv-vitals">
        {value.ac != null && <div className="cv-stat"><span>AC</span><b>{value.ac}</b></div>}
        <div className="cv-stat"><span>HP</span><b>{value.currentHp ?? '—'} / {value.maxHp ?? '—'}</b></div>
        {value.speeds.walk && <div className="cv-stat"><span>Speed</span><b>{value.speeds.walk} ft</b></div>}
        <div className="cv-stat"><span>Init</span><b>{signed(abilityMod(value.abilities.dex))}</b></div>
        <div className="cv-stat"><span>Prof</span><b>{signed(pb)}</b></div>
      </div>

      <div className="cv-abilities">
        {ABILITIES.map((a) => (
          <div key={a.key} className="cv-ability">
            <span className="cv-ab-label">{a.label}</span>
            <span className="cv-ab-score">{value.abilities[a.key]}</span>
            <span className="cv-ab-mod">{signed(abilityMod(value.abilities[a.key]))}</span>
          </div>
        ))}
      </div>

      <div className="cv-lines">
        {line('Saving Throws', saves.join(', '))}
        {line('Skills', skills.join(', '))}
        {line('Senses', value.senses)}
        {line('Languages', (value.languages ?? []).join(', '))}
        {line('Damage Resistances', (value.resistances ?? []).join(', '))}
        {line('Damage Immunities', (value.immunities ?? []).join(', '))}
        {line('Armor', (value.proficiencies?.armor ?? []).join(', '))}
        {line('Weapons', (value.proficiencies?.weapons ?? []).join(', '))}
        {line('Tools', (value.proficiencies?.tools ?? []).join(', '))}
        {line('Feats', (value.feats ?? []).join(', '))}
        {line('Background Feature', value.backgroundFeature)}
      </div>

      {(P?.traits || P?.ideals || P?.bonds || P?.flaws) && (
        <div className="cv-lines">
          {line('Personality', P?.traits)}
          {line('Ideals', P?.ideals)}
          {line('Bonds', P?.bonds)}
          {line('Flaws', P?.flaws)}
        </div>
      )}

      <Tier2Sections value={value} />

      {(value.inventory ?? []).length > 0 && <InventoryView items={value.inventory ?? []} />}

      {value.currency && (value.currency.pp || value.currency.gp || value.currency.ep || value.currency.sp || value.currency.cp) ? (
        <div className="cv-line"><span className="cv-label">Currency</span> {
          (['pp', 'gp', 'ep', 'sp', 'cp'] as const).filter((c) => value.currency![c]).map((c) => `${value.currency![c]} ${c}`).join(', ')
        }</div>
      ) : null}
    </div>
  )
}

/** Paste a D&D Beyond URL (or id) to import/refresh. Read-only, public chars only. */
export function DdbImport({ existing, onImported }: { existing?: CharacterSheet['ddb']; onImported: (sheet: CharacterSheet, name?: string, backstory?: string) => void }) {
  const [url, setUrl] = useState(existing?.url ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function run(id: string) {
    setBusy(true); setErr('')
    try {
      const raw = await fetchDdbCharacter(id)
      onImported(mapDdbCharacter(raw), typeof raw?.name === 'string' ? raw.name : undefined, extractBackstoryHtml(raw))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed.')
    }
    setBusy(false)
  }

  function importFromUrl() {
    const id = parseDdbId(url)
    if (!id) { setErr('Enter a D&D Beyond character URL or id.'); return }
    run(id)
  }

  return (
    <div className="ddb-import">
      <div className="ddb-import-row">
        <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="D&D Beyond character URL…" aria-label="D&D Beyond URL" />
        <button className="btn small primary" onClick={importFromUrl} disabled={busy}>
          {busy ? 'Importing…' : existing ? 'Re-import' : 'Import'}
        </button>
        {existing && (
          <button className="btn ghost small" onClick={() => run(String(existing.characterId))} disabled={busy} title="Re-pull from D&D Beyond">
            <Icon name="cloud" size={14} /> Refresh
          </button>
        )}
      </div>
      <div className="faint" style={{ fontSize: 11.5 }}>
        Experimental · read-only · public characters only · verify AC after import.
        {existing?.lastImportedAt && ` Last imported ${new Date(existing.lastImportedAt).toLocaleDateString()}.`}
      </div>
      {err && <div className="bug-error" style={{ fontSize: 13 }}>{err}</div>}
    </div>
  )
}
