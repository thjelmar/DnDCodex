import { useState } from 'react'
import type { StatBlock, StatBlockEntry } from '../db/types'
import { searchSrd } from '../lib/monsters'
import {
  ABILITIES,
  abilityMod,
  crXpLabel,
  effectivePb,
  emptyStatBlock,
  parseCr,
  saveValue,
  signed,
  statBlockFromMonster,
} from '../lib/statblock'

// The five repeatable stat-block sections, in D&D Beyond order.
const SECTIONS: { key: keyof Pick<StatBlock, 'traits' | 'actions' | 'bonusActions' | 'reactions' | 'legendaryActions'>; label: string }[] = [
  { key: 'traits', label: 'Traits' },
  { key: 'actions', label: 'Actions' },
  { key: 'bonusActions', label: 'Bonus Actions' },
  { key: 'reactions', label: 'Reactions' },
  { key: 'legendaryActions', label: 'Legendary Actions' },
]

function newEntry(): StatBlockEntry {
  return { id: crypto.randomUUID(), name: '', text: '' }
}

export function StatBlockEditor({
  name,
  value,
  onChange,
}: {
  /** The NPC's name, shown as the block's title. */
  name: string
  value: StatBlock | null | undefined
  onChange: (block: StatBlock | null) => void
}) {
  const [editing, setEditing] = useState(false)

  if (!value) {
    return <StatBlockEmpty onBuild={() => { onChange(emptyStatBlock()); setEditing(true) }}
      onPrefill={(block) => { onChange(block); setEditing(true) }} />
  }

  if (editing) {
    return (
      <StatBlockForm
        value={value}
        onChange={onChange}
        onDone={() => setEditing(false)}
        onRemove={() => { onChange(null); setEditing(false) }}
      />
    )
  }

  return (
    <div>
      <StatBlockView name={name} block={value} />
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn small" onClick={() => setEditing(true)}>✎ Edit stat block</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state: build from scratch, or prefill the basics from an SRD monster.
// ---------------------------------------------------------------------------

function StatBlockEmpty({
  onBuild,
  onPrefill,
}: {
  onBuild: () => void
  onPrefill: (block: StatBlock) => void
}) {
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const results = picking ? searchSrd({ query }).slice(0, 8) : []

  return (
    <div className="sb-empty">
      {!picking ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn small primary" onClick={onBuild}>＋ Build a stat block</button>
          <button className="btn small" onClick={() => setPicking(true)}>Prefill from SRD monster</button>
        </div>
      ) : (
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <input
              className="input"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 322 SRD monsters (e.g. Archmage)…"
            />
            <button className="btn small" onClick={() => { setPicking(false); setQuery('') }}>Cancel</button>
          </div>
          {query.trim() === '' ? (
            <p className="faint" style={{ fontSize: 13 }}>Type to search. Fills size, type, CR, AC, HP, and DEX — you fill in the rest.</p>
          ) : results.length === 0 ? (
            <p className="faint" style={{ fontSize: 13 }}>No SRD monster matches “{query}”.</p>
          ) : (
            <div className="sb-results">
              {results.map((m) => (
                <button key={m.slug} className="sb-result" onClick={() => onPrefill(statBlockFromMonster(m))}>
                  <span>{m.name}</span>
                  <span className="faint" style={{ fontSize: 12 }}>{m.type} · CR {m.cr}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rendered stat block (read view). Only non-empty lines/sections show.
// ---------------------------------------------------------------------------

function StatBlockView({ name, block }: { name: string; block: StatBlock }) {
  const pb = effectivePb(block)
  const crLine = crXpLabel(block)
  const header = [block.size, block.creatureType].filter(Boolean).join(' ') +
    (block.alignment ? `, ${block.alignment}` : '')

  return (
    <div className="sb">
      <div className="sb-name">{name || 'Unnamed'}</div>
      {header.trim() && <div className="sb-sub">{header}</div>}

      <div className="sb-rule" />
      <SbLine label="AC" value={block.ac} />
      <SbLine label="Initiative" value={block.initiative || (block.abilities.dex ? signed(abilityMod(block.abilities.dex)) : '')} />
      <SbLine label="HP" value={block.hp} />
      <SbLine label="Speed" value={block.speed} />

      <div className="sb-rule" />
      <div className="sb-abilities">
        {ABILITIES.map(({ key, label }) => (
          <div key={key} className="sb-ability">
            <div className="sb-ab-label">{label}</div>
            <div className="sb-ab-score">{block.abilities[key]}</div>
            <div className="sb-ab-mods">
              <span>{signed(abilityMod(block.abilities[key]))}</span>
              <span className={block.saveProficiencies.includes(key) ? 'sb-save-prof' : ''}>
                {signed(saveValue(block, key))}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="sb-ab-legend faint">mod · save</div>

      <div className="sb-rule" />
      <SbLine label="Skills" value={block.skills} />
      <SbLine label="Resistances" value={block.resistances} />
      <SbLine label="Immunities" value={block.immunities} />
      <SbLine label="Vulnerabilities" value={block.vulnerabilities} />
      <SbLine label="Senses" value={block.senses} />
      <SbLine label="Languages" value={block.languages} />
      <SbLine label="CR" value={crLine ? `${crLine}${crLine && parseCr(block.cr) != null ? `; PB ${signed(pb)}` : ''}` : ''} />
      <SbLine label="Habitat" value={block.habitat} />
      <SbLine label="Gear" value={block.gear} />
      <SbLine label="Treasure" value={block.treasure} />

      {SECTIONS.map(({ key, label }) => {
        const entries = block[key]
        if (entries.length === 0) return null
        return (
          <div key={key} className="sb-section">
            <div className="sb-section-title">{label}</div>
            {entries.map((e) => (
              <p key={e.id} className="sb-entry">
                {e.name && <strong>{e.name}. </strong>}
                <span style={{ whiteSpace: 'pre-wrap' }}>{e.text}</span>
              </p>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function SbLine({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null
  return (
    <div className="sb-line">
      <span className="sb-line-label">{label}</span> {value}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Edit form
// ---------------------------------------------------------------------------

function StatBlockForm({
  value,
  onChange,
  onDone,
  onRemove,
}: {
  value: StatBlock
  onChange: (block: StatBlock) => void
  onDone: () => void
  onRemove: () => void
}) {
  const set = (patch: Partial<StatBlock>) => onChange({ ...value, ...patch })
  const cr = parseCr(value.cr)

  return (
    <div className="sb-form">
      <div className="form-row">
        <Field label="Size"><input className="input" value={value.size} onChange={(e) => set({ size: e.target.value })} placeholder="Medium" /></Field>
        <Field label="Type"><input className="input" value={value.creatureType} onChange={(e) => set({ creatureType: e.target.value })} placeholder="Humanoid (Wizard)" /></Field>
        <Field label="Alignment"><input className="input" value={value.alignment} onChange={(e) => set({ alignment: e.target.value })} placeholder="Neutral" /></Field>
      </div>

      <div className="form-row">
        <Field label="AC"><input className="input" value={value.ac} onChange={(e) => set({ ac: e.target.value })} placeholder="17" /></Field>
        <Field label="HP"><input className="input" value={value.hp} onChange={(e) => set({ hp: e.target.value })} placeholder="170 (31d8 + 31)" /></Field>
        <Field label="Speed"><input className="input" value={value.speed} onChange={(e) => set({ speed: e.target.value })} placeholder="30 ft." /></Field>
        <Field label="Initiative"><input className="input" value={value.initiative} onChange={(e) => set({ initiative: e.target.value })} placeholder="auto from DEX" /></Field>
      </div>

      <label className="sb-form-label">Ability scores <span className="faint">— check the box for save-proficient abilities; modifiers &amp; saves compute automatically</span></label>
      <div className="sb-ability-inputs">
        {ABILITIES.map(({ key, label }) => (
          <AbilityInput
            key={key}
            label={label}
            score={value.abilities[key]}
            mod={abilityMod(value.abilities[key])}
            save={saveValue(value, key)}
            proficient={value.saveProficiencies.includes(key)}
            onScore={(n) => set({ abilities: { ...value.abilities, [key]: n } })}
            onProf={(on) =>
              set({
                saveProficiencies: on
                  ? [...value.saveProficiencies, key]
                  : value.saveProficiencies.filter((k) => k !== key),
              })
            }
          />
        ))}
      </div>

      <div className="form-row">
        <Field label="Skills"><input className="input" value={value.skills} onChange={(e) => set({ skills: e.target.value })} placeholder="Arcana +13, History +9" /></Field>
        <Field label="Senses"><input className="input" value={value.senses} onChange={(e) => set({ senses: e.target.value })} placeholder="Passive Perception 16" /></Field>
      </div>
      <div className="form-row">
        <Field label="Resistances"><input className="input" value={value.resistances} onChange={(e) => set({ resistances: e.target.value })} placeholder="Cold; Fire" /></Field>
        <Field label="Immunities"><input className="input" value={value.immunities} onChange={(e) => set({ immunities: e.target.value })} placeholder="Psychic; Charmed" /></Field>
        <Field label="Vulnerabilities"><input className="input" value={value.vulnerabilities} onChange={(e) => set({ vulnerabilities: e.target.value })} placeholder="Radiant" /></Field>
      </div>
      <Field label="Languages"><input className="input" value={value.languages} onChange={(e) => set({ languages: e.target.value })} placeholder="Common plus five other languages" /></Field>

      <div className="form-row">
        <Field label="CR"><input className="input" value={value.cr} onChange={(e) => set({ cr: e.target.value })} placeholder="12" /></Field>
        <Field label="PB (override)"><input className="input" value={value.pb} onChange={(e) => set({ pb: e.target.value })} placeholder={cr != null ? `auto (+${effectivePb(value)})` : 'auto'} /></Field>
      </div>
      {cr != null && (
        <p className="faint" style={{ fontSize: 12, marginTop: -6 }}>
          CR {value.cr.trim()} → {crXpLabel(value)}, PB {signed(effectivePb(value))}
        </p>
      )}
      <div className="form-row">
        <Field label="Habitat"><input className="input" value={value.habitat} onChange={(e) => set({ habitat: e.target.value })} placeholder="Any" /></Field>
        <Field label="Gear"><input className="input" value={value.gear} onChange={(e) => set({ gear: e.target.value })} placeholder="Wand" /></Field>
        <Field label="Treasure"><input className="input" value={value.treasure} onChange={(e) => set({ treasure: e.target.value })} placeholder="Arcana, Individual" /></Field>
      </div>

      {SECTIONS.map(({ key, label }) => (
        <EntrySection
          key={key}
          label={label}
          entries={value[key]}
          onChange={(entries) => set({ [key]: entries } as Partial<StatBlock>)}
        />
      ))}

      <div className="row between" style={{ marginTop: 14 }}>
        <button className="btn small primary" onClick={onDone}>Done</button>
        <button className="btn danger small" onClick={onRemove}>Remove stat block</button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

function AbilityInput({
  label,
  score,
  mod,
  save,
  proficient,
  onScore,
  onProf,
}: {
  label: string
  score: number
  mod: number
  save: number
  proficient: boolean
  onScore: (n: number) => void
  onProf: (on: boolean) => void
}) {
  return (
    <div className="sb-ability-input">
      <div className="sb-ab-label">{label}</div>
      <input
        className="input"
        type="number"
        value={Number.isFinite(score) ? score : ''}
        onChange={(e) => onScore(e.target.value === '' ? 0 : parseInt(e.target.value, 10))}
      />
      <div className="sb-ab-derived faint">{signed(mod)} / <span className={proficient ? 'sb-save-prof' : ''}>{signed(save)}</span></div>
      <label className="sb-ab-prof" title="Proficient in this saving throw">
        <input type="checkbox" checked={proficient} onChange={(e) => onProf(e.target.checked)} /> save
      </label>
    </div>
  )
}

function EntrySection({
  label,
  entries,
  onChange,
}: {
  label: string
  entries: StatBlockEntry[]
  onChange: (entries: StatBlockEntry[]) => void
}) {
  const update = (id: string, patch: Partial<StatBlockEntry>) =>
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const remove = (id: string) => onChange(entries.filter((e) => e.id !== id))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= entries.length) return
    const next = entries.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="sb-entry-section">
      <div className="row between" style={{ alignItems: 'center' }}>
        <label className="sb-form-label" style={{ margin: 0 }}>{label}</label>
        <button className="btn ghost small" onClick={() => onChange([...entries, newEntry()])}>＋ Add</button>
      </div>
      {entries.map((e, i) => (
        <div key={e.id} className="sb-entry-edit">
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input"
              value={e.name}
              onChange={(ev) => update(e.id, { name: ev.target.value })}
              placeholder="Name (e.g. Multiattack)"
              style={{ fontWeight: 600 }}
            />
            <button className="btn ghost small" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button className="btn ghost small" title="Move down" onClick={() => move(i, 1)} disabled={i === entries.length - 1}>↓</button>
            <button className="btn ghost small" title="Remove" onClick={() => remove(e.id)}>✕</button>
          </div>
          <textarea
            className="textarea"
            value={e.text}
            onChange={(ev) => update(e.id, { text: ev.target.value })}
            placeholder="Description…"
            style={{ minHeight: 54, marginTop: 4 }}
          />
        </div>
      ))}
    </div>
  )
}
