import { useEffect, useRef, useState } from 'react'
import type { AbilityKey, CharacterClass, CharacterSheet } from '../db/types'
import { ABILITIES, abilityMod, signed } from '../lib/statblock'
import { parseDdbId, fetchDdbCharacter, mapDdbCharacter } from '../lib/ddb'
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
        <div className="char-id-grid">
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
      <div className="char-section">
        <div className="row between" style={{ alignItems: 'center', marginBottom: 6 }}>
          <span className="char-sub-label" style={{ margin: 0 }}>Inventory {(value.inventory?.length ?? 0) > 0 && <span className="faint">({value.inventory!.length})</span>}</span>
          <button className="btn ghost small" onClick={() => set({ inventory: [...(value.inventory ?? []), { name: '', qty: 1, equipped: false }] })}><Icon name="plus" size={13} /> Add item</button>
        </div>
        <div className="char-inv">
          {(value.inventory ?? []).map((it, i) => (
            <div key={i} className="char-inv-row">
              <input className="input" style={{ flex: '2 1 140px' }} value={it.name} onChange={(e) => set({ inventory: (value.inventory ?? []).map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Item" />
              <NumberField className="char-lvl" value={it.qty} min={1} onChange={(v) => set({ inventory: (value.inventory ?? []).map((x, j) => (j === i ? { ...x, qty: v ?? 1 } : x)) })} ariaLabel="Quantity" />
              <label className="char-inv-eq"><input type="checkbox" checked={it.equipped} onChange={(e) => set({ inventory: (value.inventory ?? []).map((x, j) => (j === i ? { ...x, equipped: e.target.checked } : x)) })} /> eq</label>
              {it.rarity && <span className="char-rarity">{it.rarity}</span>}
              <button className="btn ghost small" onClick={() => set({ inventory: (value.inventory ?? []).filter((_, j) => j !== i) })} aria-label="Remove item"><Icon name="x" size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
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

/** Paste a D&D Beyond URL (or id) to import/refresh. Read-only, public chars only. */
export function DdbImport({ existing, onImported }: { existing?: CharacterSheet['ddb']; onImported: (sheet: CharacterSheet, name?: string) => void }) {
  const [url, setUrl] = useState(existing?.url ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function run(id: string) {
    setBusy(true); setErr('')
    try {
      const raw = await fetchDdbCharacter(id)
      onImported(mapDdbCharacter(raw), typeof raw?.name === 'string' ? raw.name : undefined)
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
