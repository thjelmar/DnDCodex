import { useState } from 'react'
import { Icon } from './Icon'
import { useRevealConfirm } from './ConfirmDialog'
import type { StatBlock, StatBlockEntry, StatBlockReference, StatBlockSectionSpoilers } from '../db/types'
import { fetchOpen5eMonster, searchOpen5e, searchSrd } from '../lib/monsters'
import type { Monster } from '../lib/monsters'
import {
  ABILITIES,
  abilityMod,
  crXpLabel,
  effectivePb,
  emptyStatBlock,
  parseCr,
  parseStatBlockText,
  saveValue,
  signed,
  statBlockFromMonster,
  statBlockFromOpen5e,
  statBlockHasContent,
} from '../lib/statblock'

// The repeatable stat-block sections, in D&D Beyond order. Spellcasting sits
// with the actions (spells count as actions).
type SectionKey = 'traits' | 'actions' | 'spellcasting' | 'bonusActions' | 'reactions' | 'legendaryActions'
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'traits', label: 'Traits' },
  { key: 'actions', label: 'Actions' },
  { key: 'spellcasting', label: 'Spellcasting' },
  { key: 'bonusActions', label: 'Bonus Actions' },
  { key: 'reactions', label: 'Reactions' },
  { key: 'legendaryActions', label: 'Legendary Actions' },
]

/** Entries for a section, tolerating blocks saved before the section existed. */
function sectionEntries(block: StatBlock, key: SectionKey): StatBlockEntry[] {
  return block[key] ?? []
}

function newEntry(): StatBlockEntry {
  return { id: crypto.randomUUID(), name: '', text: '' }
}

function newReference(): StatBlockReference {
  return { id: crypto.randomUUID(), label: '', url: '' }
}

export function StatBlockEditor({
  name,
  value,
  onChange,
  revealNeedsConfirm = false,
}: {
  /** The NPC's name, shown as the block's title. */
  name: string
  value: StatBlock | null | undefined
  onChange: (block: StatBlock | null) => void
  /** When true (NPC already shared), un-hiding a spoilered section/entry asks first. */
  revealNeedsConfirm?: boolean
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
        revealNeedsConfirm={revealNeedsConfirm}
      />
    )
  }

  return (
    <div>
      <StatBlockView name={name} block={value} onChange={onChange} showReferences revealNeedsConfirm={revealNeedsConfirm} />
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button className="btn small" onClick={() => setEditing(true)}><Icon name="pencil" size={13} /> Edit stat block</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state: build from scratch, or import a monster — search first (bundled
// SRD, then all of Open5e), and if nothing turns up, paste the stat block text.
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
  const [online, setOnline] = useState<Monster[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState('')

  const srdResults = picking && query.trim() ? searchSrd({ query }).slice(0, 8) : []
  // Online results that aren't already in the SRD list (SRD comes first).
  const srdSlugs = new Set(srdResults.map((m) => m.slug))
  const onlineExtra = (online ?? []).filter((m) => !srdSlugs.has(m.slug)).slice(0, 12)
  const noResults = query.trim() !== '' && srdResults.length === 0 && onlineExtra.length === 0
  const searchedOnline = online != null

  const reset = () => {
    setPicking(false); setQuery(''); setOnline(null)
    setSearching(false); setShowPaste(false); setPasted(''); setError('')
  }

  // Pull the full record and map a complete stat block; fall back to a
  // basics-only fill if the fetch fails (offline, blocked, missing slug).
  const importMonster = async (m: Monster) => {
    setImporting(m.slug)
    setError('')
    try {
      const full = await fetchOpen5eMonster(m.slug)
      onPrefill(statBlockFromOpen5e(full))
    } catch {
      onPrefill(statBlockFromMonster(m))
      setError(`Couldn’t fetch ${m.name}’s full stat block — filled the basics instead.`)
    } finally {
      setImporting(null)
    }
  }

  const searchMoreOnline = async () => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setError('')
    try {
      setOnline(await searchOpen5e(q))
    } catch {
      setError('Couldn’t reach Open5e. Check your connection and try again.')
    } finally {
      setSearching(false)
    }
  }

  const importPasted = () => {
    const block = parseStatBlockText(pasted)
    if (!statBlockHasContent(block)) {
      setError('Couldn’t find a stat block in that text. Paste the whole block — AC, HP, speed, abilities, and actions.')
      return
    }
    onPrefill(block)
  }

  const Result = ({ m, badge }: { m: Monster; badge?: string }) => (
    <button key={m.slug} className="sb-result" disabled={importing != null} onClick={() => importMonster(m)}>
      <span>{m.name}{importing === m.slug ? ' — importing…' : ''}</span>
      <span className="faint" style={{ fontSize: 12 }}>{m.type} · CR {m.cr}{badge ? ` · ${badge}` : ''}</span>
    </button>
  )

  if (!picking) {
    return (
      <div className="sb-empty">
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn small primary" onClick={onBuild}><Icon name="plus" size={14} color="inherit" /> Build a stat block</button>
          <button className="btn small" onClick={() => setPicking(true)}><Icon name="download" size={13} /> Import a monster</button>
        </div>
      </div>
    )
  }

  return (
    <div className="sb-empty">
      <form className="row" style={{ gap: 8, marginBottom: 8 }} onSubmit={(e) => { e.preventDefault(); void searchMoreOnline() }}>
        <input
          className="input"
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOnline(null) }}
          placeholder="Search a monster (e.g. Archmage)…"
        />
        <button type="button" className="btn small" onClick={reset}>Cancel</button>
      </form>
      {error && <p className="faint" style={{ fontSize: 13, color: 'var(--danger, #e2857f)' }}>{error}</p>}

      {query.trim() === '' ? (
        <p className="faint" style={{ fontSize: 13 }}>Type to search the 322 bundled SRD monsters. Importing fills the full stat block — stats, traits, actions, and spells.</p>
      ) : (
        <>
          {srdResults.length > 0 && (
            <div className="sb-results">
              {srdResults.map((m) => <Result key={m.slug} m={m} />)}
            </div>
          )}
          {onlineExtra.length > 0 && (
            <>
              <div className="faint" style={{ fontSize: 12, margin: '8px 0 4px' }}>More from Open5e</div>
              <div className="sb-results">
                {onlineExtra.map((m) => <Result key={m.slug} m={m} badge="online" />)}
              </div>
            </>
          )}

          {/* Not found yet: offer the wider online search, then fall back to paste. */}
          {noResults && (
            <p className="faint" style={{ fontSize: 13 }}>
              {searchedOnline
                ? `No match for “${query}” in the SRD or Open5e. If it’s from another source, paste its stat block below.`
                : `No SRD monster matches “${query}”.`}
            </p>
          )}
          {!searchedOnline && (
            <button className="btn ghost small" style={{ marginTop: 8, marginRight: 8 }} disabled={searching} onClick={() => void searchMoreOnline()}>
              <Icon name="search" size={13} /> {searching ? 'Searching Open5e…' : 'Search all of Open5e'}
            </button>
          )}
          {noResults && !showPaste && (
            <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => { setShowPaste(true); setError('') }}>
              <Icon name="text" size={13} /> Can’t find it? Paste the stat block
            </button>
          )}
        </>
      )}

      {showPaste && (
        <div className="sb-paste">
          <p className="faint" style={{ fontSize: 13, margin: '0 0 6px' }}>
            Copy the stat block from D&amp;D Beyond (or a book, or homebrew) and paste it here. It fills everything it recognizes and leaves the rest for you.
          </p>
          <textarea
            className="textarea"
            autoFocus
            value={pasted}
            onChange={(e) => { setPasted(e.target.value); setError('') }}
            placeholder={'Paste the full stat block, e.g.\n\nArchmage\nMedium humanoid (any race), any alignment\nArmor Class 12 (15 with mage armor)\nHit Points 99 (18d8 + 18)\nSpeed 30 ft.\n…'}
            style={{ minHeight: 160, width: '100%' }}
          />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button className="btn small primary" disabled={!pasted.trim()} onClick={importPasted}>
              <Icon name="download" size={13} color="inherit" /> Import from text
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rendered stat block (read view). Only non-empty lines/sections show.
// ---------------------------------------------------------------------------

/** Compact spoiler toggle shown on a section of the rendered stat block, so the
 *  DM can hide/reveal a piece without opening the edit form. */
function SbSpoilerControl({ spoiled, onToggle }: { spoiled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`sb-view-spoiler${spoiled ? ' on' : ''}`}
      title={spoiled ? 'Hidden from players — click to reveal' : 'Hide this from players'}
      onClick={onToggle}
    >
      {spoiled ? <><Icon name="lock" size={12} /> Hidden</> : <Icon name="unlock" size={12} />}
    </button>
  )
}

/** A section of the rendered block, with an optional spoiler toggle (DM only). */
function SbGroup({
  spoiled,
  onToggle,
  children,
}: {
  spoiled: boolean
  onToggle?: () => void
  children: React.ReactNode
}) {
  return (
    <div className={`sb-view-group${spoiled ? ' spoiled' : ''}`}>
      {onToggle && (
        <div className="sb-view-group-head">
          <SbSpoilerControl spoiled={spoiled} onToggle={onToggle} />
        </div>
      )}
      {children}
    </div>
  )
}

/** Player-side marker where a stat-block section was redacted by the DM. */
function HiddenMarker({ label }: { label: string }) {
  return (
    <div className="sb-hidden-row">
      <span className="sb-hidden-label">{label}</span>
      <span className="spoiler-hidden">Hidden by your DM</span>
    </div>
  )
}

export function StatBlockView({
  name,
  block,
  onChange,
  hideAbilities,
  hidden,
  showReferences = false,
  revealNeedsConfirm = false,
}: {
  name: string
  block: StatBlock
  /** When provided (DM view), sections show spoiler toggles. */
  onChange?: (block: StatBlock) => void
  /** Player view: omit the ability grid (it was spoilered). */
  hideAbilities?: boolean
  /** Player view: fixed rows the DM hid — render a "hidden" marker for each. */
  hidden?: StatBlockSectionSpoilers
  /** DM-only contexts pass true to show reference links; players never see them. */
  showReferences?: boolean
  /** When true (entity already shared), un-hiding a section/entry asks first. */
  revealNeedsConfirm?: boolean
}) {
  const revealConfirm = useRevealConfirm()
  const pb = effectivePb(block)
  const crLine = crXpLabel(block)
  const header = [block.size, block.creatureType].filter(Boolean).join(' ') +
    (block.alignment ? `, ${block.alignment}` : '')
  const spoilers = block.sectionSpoilers ?? {}
  const h = hidden ?? {}
  const set = (patch: Partial<StatBlock>) => onChange?.({ ...block, ...patch })
  const toggle = async (k: keyof StatBlockSectionSpoilers) => {
    if (!(await revealConfirm(!!spoilers[k], revealNeedsConfirm))) return
    set({ sectionSpoilers: { ...spoilers, [k]: !spoilers[k] } })
  }
  const toggleEntry = async (key: SectionKey, id: string) => {
    const entries = sectionEntries(block, key)
    const cur = entries.find((e) => e.id === id)
    if (!(await revealConfirm(!!cur?.spoiler, revealNeedsConfirm))) return
    set({ [key]: entries.map((e) => (e.id === id ? { ...e, spoiler: !e.spoiler } : e)) } as Partial<StatBlock>)
  }

  const initiative = block.initiative || (block.abilities.dex ? signed(abilityMod(block.abilities.dex)) : '')
  const crText = crLine ? `${crLine}${parseCr(block.cr) != null ? `; PB ${signed(pb)}` : ''}` : ''
  const has = (...vs: string[]) => vs.some((v) => v.trim())

  return (
    <div className="sb">
      <div className="sb-name">{name || 'Unnamed'}</div>
      {header.trim() && <div className="sb-sub">{header}</div>}

      {h.core ? (
        <><div className="sb-rule" /><HiddenMarker label="Core stats" /></>
      ) : has(block.ac, initiative, block.hp, block.speed) ? (
        <>
          <div className="sb-rule" />
          <SbGroup spoiled={!!spoilers.core} onToggle={onChange && (() => toggle('core'))}>
            <SbLine label="AC" value={block.ac} />
            <SbLine label="Initiative" value={initiative} />
            <SbLine label="HP" value={block.hp} />
            <SbLine label="Speed" value={block.speed} />
          </SbGroup>
        </>
      ) : null}

      {h.abilities ? (
        <><div className="sb-rule" /><HiddenMarker label="Ability scores" /></>
      ) : !hideAbilities ? (
        <>
          <div className="sb-rule" />
          <SbGroup spoiled={!!spoilers.abilities} onToggle={onChange && (() => toggle('abilities'))}>
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
          </SbGroup>
        </>
      ) : null}

      {h.secondary ? (
        <><div className="sb-rule" /><HiddenMarker label="Skills, senses &amp; defenses" /></>
      ) : has(block.skills, block.resistances, block.immunities, block.vulnerabilities, block.senses, block.languages) ? (
        <>
          <div className="sb-rule" />
          <SbGroup spoiled={!!spoilers.secondary} onToggle={onChange && (() => toggle('secondary'))}>
            <SbLine label="Skills" value={block.skills} />
            <SbLine label="Resistances" value={block.resistances} />
            <SbLine label="Immunities" value={block.immunities} />
            <SbLine label="Vulnerabilities" value={block.vulnerabilities} />
            <SbLine label="Senses" value={block.senses} />
            <SbLine label="Languages" value={block.languages} />
          </SbGroup>
        </>
      ) : null}

      {h.cr ? (
        <HiddenMarker label="Challenge rating" />
      ) : crText.trim() ? (
        <SbGroup spoiled={!!spoilers.cr} onToggle={onChange && (() => toggle('cr'))}>
          <SbLine label="CR" value={crText} />
        </SbGroup>
      ) : null}

      {h.gear ? (
        <HiddenMarker label="Habitat, gear &amp; treasure" />
      ) : has(block.habitat, block.gear, block.treasure) ? (
        <SbGroup spoiled={!!spoilers.gear} onToggle={onChange && (() => toggle('gear'))}>
          <SbLine label="Habitat" value={block.habitat} />
          <SbLine label="Gear" value={block.gear} />
          <SbLine label="Treasure" value={block.treasure} />
        </SbGroup>
      ) : null}

      {SECTIONS.map(({ key, label }) => {
        const entries = sectionEntries(block, key)
        if (entries.length === 0) return null
        return (
          <div key={key} className="sb-section">
            <div className="sb-section-title">{label}</div>
            {entries.map((e) => (
              <div key={e.id} className={`sb-entry-row${e.spoiler ? ' spoiled' : ''}`}>
                {e.hidden ? (
                  <span className="spoiler-hidden">Hidden by your DM</span>
                ) : (
                  <>
                    <p className="sb-entry">
                      {e.name && <strong>{e.name}. </strong>}
                      <span style={{ whiteSpace: 'pre-wrap' }}>{e.text}</span>
                    </p>
                    {onChange && <SbSpoilerControl spoiled={!!e.spoiler} onToggle={() => toggleEntry(key, e.id)} />}
                  </>
                )}
              </div>
            ))}
          </div>
        )
      })}

      {showReferences && (block.referenceLinks?.length ?? 0) > 0 && (
        <div className="sb-section sb-references">
          <div className="sb-section-title">References <span className="faint" style={{ fontWeight: 400, fontSize: 11 }}>· DM only</span></div>
          {block.referenceLinks!.map((r) => (
            <a key={r.id} className="sb-reference-link" href={r.url} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={13} /> {r.label.trim() || r.url}
            </a>
          ))}
        </div>
      )}
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
  revealNeedsConfirm,
}: {
  value: StatBlock
  onChange: (block: StatBlock) => void
  onDone: () => void
  onRemove: () => void
  revealNeedsConfirm: boolean
}) {
  const revealConfirm = useRevealConfirm()
  const set = (patch: Partial<StatBlock>) => onChange({ ...value, ...patch })
  const cr = parseCr(value.cr)
  const spoilers = value.sectionSpoilers ?? {}
  const toggleSpoiler = async (k: keyof StatBlockSectionSpoilers) => {
    if (!(await revealConfirm(!!spoilers[k], revealNeedsConfirm))) return
    set({ sectionSpoilers: { ...spoilers, [k]: !spoilers[k] } })
  }

  return (
    <div className="sb-form">
      <div className="form-row">
        <Field label="Size"><input className="input" value={value.size} onChange={(e) => set({ size: e.target.value })} placeholder="Medium" /></Field>
        <Field label="Type"><input className="input" value={value.creatureType} onChange={(e) => set({ creatureType: e.target.value })} placeholder="Humanoid (Wizard)" /></Field>
        <Field label="Alignment"><input className="input" value={value.alignment} onChange={(e) => set({ alignment: e.target.value })} placeholder="Neutral" /></Field>
      </div>

      <SpoilerGroup label="Core stats" spoiled={!!spoilers.core} onToggle={() => toggleSpoiler('core')}>
        <div className="form-row">
          <Field label="AC"><input className="input" value={value.ac} onChange={(e) => set({ ac: e.target.value })} placeholder="17" /></Field>
          <Field label="HP"><input className="input" value={value.hp} onChange={(e) => set({ hp: e.target.value })} placeholder="170 (31d8 + 31)" /></Field>
          <Field label="Speed"><input className="input" value={value.speed} onChange={(e) => set({ speed: e.target.value })} placeholder="30 ft." /></Field>
          <Field label="Initiative"><input className="input" value={value.initiative} onChange={(e) => set({ initiative: e.target.value })} placeholder="auto from DEX" /></Field>
        </div>
      </SpoilerGroup>

      <SpoilerGroup label="Ability scores" spoiled={!!spoilers.abilities} onToggle={() => toggleSpoiler('abilities')}>
      <div className="faint" style={{ fontSize: 12, margin: '0 0 4px' }}>Check the box for save-proficient abilities; modifiers &amp; saves compute automatically.</div>
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
      </SpoilerGroup>

      <SpoilerGroup label="Skills, senses &amp; defenses" spoiled={!!spoilers.secondary} onToggle={() => toggleSpoiler('secondary')}>
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
      </SpoilerGroup>

      <SpoilerGroup label="Challenge rating" spoiled={!!spoilers.cr} onToggle={() => toggleSpoiler('cr')}>
        <div className="form-row">
          <Field label="CR"><input className="input" value={value.cr} onChange={(e) => set({ cr: e.target.value })} placeholder="12" /></Field>
          <Field label="PB (override)"><input className="input" value={value.pb} onChange={(e) => set({ pb: e.target.value })} placeholder={cr != null ? `auto (+${effectivePb(value)})` : 'auto'} /></Field>
        </div>
        {cr != null && (
          <p className="faint" style={{ fontSize: 12, marginTop: -6 }}>
            CR {value.cr.trim()} → {crXpLabel(value)}, PB {signed(effectivePb(value))}
          </p>
        )}
      </SpoilerGroup>

      <SpoilerGroup label="Habitat, gear &amp; treasure" spoiled={!!spoilers.gear} onToggle={() => toggleSpoiler('gear')}>
        <div className="form-row">
          <Field label="Habitat"><input className="input" value={value.habitat} onChange={(e) => set({ habitat: e.target.value })} placeholder="Any" /></Field>
          <Field label="Gear"><input className="input" value={value.gear} onChange={(e) => set({ gear: e.target.value })} placeholder="Wand" /></Field>
          <Field label="Treasure"><input className="input" value={value.treasure} onChange={(e) => set({ treasure: e.target.value })} placeholder="Arcana, Individual" /></Field>
        </div>
      </SpoilerGroup>

      {SECTIONS.map(({ key, label }) => (
        <EntrySection
          key={key}
          label={label}
          entries={value[key] ?? []}
          onChange={(entries) => set({ [key]: entries } as Partial<StatBlock>)}
          revealNeedsConfirm={revealNeedsConfirm}
        />
      ))}

      <ReferencesSection
        references={value.referenceLinks ?? []}
        onChange={(referenceLinks) => set({ referenceLinks })}
      />

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

/** A group of stat-block fields with a spoiler toggle that hides the whole row
 *  from players when the block is shared. */
function SpoilerGroup({
  label,
  spoiled,
  onToggle,
  children,
}: {
  label: string
  spoiled: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className={`sb-group${spoiled ? ' sb-group-spoiled' : ''}`}>
      <div className="sb-group-head">
        <span className="sb-group-label">{label}</span>
        <button
          type="button"
          className={`sb-spoiler-toggle${spoiled ? ' on' : ''}`}
          title={spoiled ? 'Hidden from players — click to reveal' : 'Hide this from players'}
          onClick={onToggle}
        >
          <Icon name={spoiled ? 'lock' : 'unlock'} size={12} /> {spoiled ? 'Hidden' : 'Visible'}
        </button>
      </div>
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
  revealNeedsConfirm,
}: {
  label: string
  entries: StatBlockEntry[]
  onChange: (entries: StatBlockEntry[]) => void
  revealNeedsConfirm: boolean
}) {
  const revealConfirm = useRevealConfirm()
  const update = (id: string, patch: Partial<StatBlockEntry>) =>
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const toggleEntrySpoiler = async (e: StatBlockEntry) => {
    if (!(await revealConfirm(!!e.spoiler, revealNeedsConfirm))) return
    update(e.id, { spoiler: !e.spoiler })
  }
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
        <button className="btn ghost small" onClick={() => onChange([...entries, newEntry()])}><Icon name="plus" size={13} /> Add</button>
      </div>
      {entries.map((e, i) => (
        <div key={e.id} className={`sb-entry-edit${e.spoiler ? ' spoiled' : ''}`}>
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input"
              value={e.name}
              onChange={(ev) => update(e.id, { name: ev.target.value })}
              placeholder="Name (e.g. Multiattack)"
              style={{ fontWeight: 600 }}
            />
            <button
              className={`btn ghost small${e.spoiler ? ' active' : ''}`}
              title={e.spoiler ? 'Hidden from players — click to reveal' : 'Hide from players'}
              onClick={() => toggleEntrySpoiler(e)}
            >
              <Icon name={e.spoiler ? 'lock' : 'unlock'} size={14} />
            </button>
            <button className="btn ghost small" title="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button className="btn ghost small" title="Move down" onClick={() => move(i, 1)} disabled={i === entries.length - 1}>↓</button>
            <button className="btn ghost small" title="Remove" onClick={() => remove(e.id)}><Icon name="x" size={13} /></button>
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

/** DM-only reference links (label + URL). Never shared with players. */
function ReferencesSection({
  references,
  onChange,
}: {
  references: StatBlockReference[]
  onChange: (references: StatBlockReference[]) => void
}) {
  const update = (id: string, patch: Partial<StatBlockReference>) =>
    onChange(references.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const remove = (id: string) => onChange(references.filter((r) => r.id !== id))

  return (
    <div className="sb-entry-section">
      <div className="row between" style={{ alignItems: 'center' }}>
        <label className="sb-form-label" style={{ margin: 0 }}>
          References <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}>· DM only, never shared</span>
        </label>
        <button className="btn ghost small" onClick={() => onChange([...references, newReference()])}><Icon name="plus" size={13} /> Add</button>
      </div>
      {references.map((r) => (
        <div key={r.id} className="sb-reference-edit">
          <div className="row" style={{ gap: 6 }}>
            <input
              className="input"
              value={r.label}
              onChange={(ev) => update(r.id, { label: ev.target.value })}
              placeholder="Label (e.g. D&D Beyond)"
              style={{ flex: '0 1 220px' }}
            />
            <input
              className="input"
              value={r.url}
              onChange={(ev) => update(r.id, { url: ev.target.value })}
              placeholder="https://…"
              style={{ flex: 1 }}
            />
            <button className="btn ghost small" title="Remove" onClick={() => remove(r.id)}><Icon name="x" size={13} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}
