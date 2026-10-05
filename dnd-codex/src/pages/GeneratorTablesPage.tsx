import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import { newRollTableEntry, saveGenTable } from '../db/repo'
import { Icon, type IconName } from '../components/Icon'
import { GeneratorsPanel } from '../components/Generators'
import {
  GEN_SLOTS,
  effectiveEntries,
  pendingForSlot,
  pendingSuggestions,
  prunedDismissals,
  pickText,
  genSlotDef,
  type GenSlot,
} from '../lib/genTables'
import type { GenTable, RollTableEntry } from '../db/types'

/** Tools → Generators: the universal word lists behind the one-click generators.
 *  These are global (shared by every campaign), stored locally in this browser. */
type Selection = 'roller' | GenSlot

// A distinct icon per list so each is identifiable at a glance.
const SLOT_ICON: Record<GenSlot, IconName> = {
  'tavern-name': 'beer',
  'plot-hook': 'scroll',
  'npc-name': 'user',
  'settlement-government': 'crown',
  'settlement-religion': 'church',
  'settlement-trade': 'coins',
  'settlement-prosperity': 'gem',
}

export function GeneratorTablesPage() {
  const rows = useLiveQuery(() => db.genTables.toArray(), [])
  const [sel, setSel] = useState<Selection>('roller')

  return (
    <div>
      <div className="row between" style={{ alignItems: 'baseline', marginBottom: 4 }}>
        <h1 className="mb-0">Generators</h1>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 18 }}>
        Quick names and hooks for the table, plus the word lists behind them — shared across all your
        campaigns. Edit a list to change what rolls everywhere. Stored on this device.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'start' }}>
        <div>
          <div
            className="list-row"
            style={{ cursor: 'pointer', marginBottom: 10, borderColor: sel === 'roller' ? 'var(--accent)' : undefined }}
            onClick={() => setSel('roller')}
          >
            <div style={{ flex: 1 }}>
              <div className="title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={14} /> Names &amp; hooks</div>
              <div className="sub">Roll a tavern or plot hook</div>
            </div>
          </div>

          <div className="sidebar-heading" style={{ margin: '4px 4px' }}>Word lists</div>
          {GEN_SLOTS.map((def) => {
            const n = pendingForSlot(def.slot, rows)
            return (
              <div
                key={def.slot}
                className="list-row"
                style={{ cursor: 'pointer', borderColor: def.slot === sel ? 'var(--accent)' : undefined }}
                onClick={() => setSel(def.slot)}
              >
                <div style={{ flex: 1 }}>
                  <div className="row between" style={{ alignItems: 'center', gap: 6 }}>
                    <div className="title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={SLOT_ICON[def.slot]} size={14} /> {def.name}</div>
                    {n.length > 0 && (
                      <span className="gen-badge" title={`${n.length} suggestion${n.length === 1 ? '' : 's'} to review`}>{n.length}</span>
                    )}
                  </div>
                  <div className="sub">{def.blurb}</div>
                </div>
              </div>
            )
          })}
        </div>

        {sel === 'roller' ? (
          <div>
            <h2 className="mb-0" style={{ marginBottom: 12 }}>Names &amp; hooks</h2>
            <GeneratorsPanel />
          </div>
        ) : (
          rows !== undefined && (
            <GenTableEditor key={sel} slot={sel} row={rows.find((r) => r.slot === sel)} />
          )
        )}
      </div>
    </div>
  )
}

function GenTableEditor({ slot, row }: { slot: GenSlot; row: GenTable | undefined }) {
  const def = genSlotDef(slot)
  const makeEntry = (text: string, weight: number) => newRollTableEntry(text, weight)
  const [entries, setEntries] = useState<RollTableEntry[]>(() => effectiveEntries(slot, row, makeEntry))
  const [dismissed, setDismissed] = useState(row?.dismissedSuggestions ?? [])
  const [preview, setPreview] = useState<string | null>(null)

  // Persist to the global store (debounced). Seeding from built-ins on first
  // open also snapshots them, so future built-in additions surface as suggestions.
  useEffect(() => {
    const t = setTimeout(() => {
      saveGenTable(slot, { entries, dismissedSuggestions: dismissed })
    }, 500)
    return () => clearTimeout(t)
  }, [entries, dismissed, slot])

  const pending = useMemo(
    () => pendingSuggestions({ slot, entries, dismissedSuggestions: dismissed }),
    [slot, entries, dismissed],
  )

  const updateEntry = (id: string, patch: Partial<RollTableEntry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id))
  const addEntry = () => setEntries((prev) => [...prev, { id: newId(), text: '', weight: 1 }])

  const addSuggestion = (text: string) => setEntries((prev) => [...prev, makeEntry(text, 1)])
  const addAllSuggestions = () => setEntries((prev) => [...prev, ...pending.map((t) => makeEntry(t, 1))])
  const dismissSuggestion = (text: string) =>
    setDismissed((prev) => [...prunedDismissals({ dismissedSuggestions: prev }).filter((d) => d.text !== text), { text, dismissedAt: new Date().toISOString() }])
  const dismissAllSuggestions = () =>
    setDismissed((prev) => {
      const kept = prunedDismissals({ dismissedSuggestions: prev }).filter((d) => !pending.includes(d.text))
      const at = new Date().toISOString()
      return [...kept, ...pending.map((text) => ({ text, dismissedAt: at }))]
    })

  const live = entries.filter((e) => e.text.trim())
  const rollPreview = () => setPreview(live.length ? pickText(live.map((e) => ({ text: e.text, weight: e.weight }))) : null)

  return (
    <div>
      <div className="row between" style={{ alignItems: 'center', marginBottom: 10 }}>
        <h2 className="mb-0" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={SLOT_ICON[slot]} size={18} /> {def.name}
        </h2>
        <button className="btn small" onClick={rollPreview} disabled={!live.length}>
          <Icon name="dice" size={14} /> Preview roll
        </button>
      </div>
      {preview && (
        <div className="card" style={{ cursor: 'default', marginBottom: 16, fontFamily: 'var(--serif)', fontSize: 17, color: 'var(--accent)' }}>
          {preview}
        </div>
      )}

      {pending.length > 0 && (
        <div className="card gen-suggest" style={{ cursor: 'default', marginBottom: 20 }}>
          <div className="row between" style={{ alignItems: 'center', marginBottom: 4 }}>
            <div className="row" style={{ gap: 6, alignItems: 'center' }}>
              <Icon name="sparkles" size={15} />
              <strong style={{ fontSize: 14 }}>Suggestions ({pending.length})</strong>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small" onClick={addAllSuggestions}>Add all</button>
              <button className="btn ghost small" onClick={dismissAllSuggestions}>Dismiss all</button>
            </div>
          </div>
          <p className="faint" style={{ fontSize: 12, margin: '0 0 10px' }}>
            Built-in entries this list doesn't have yet. Add the ones you want; dismissed ones stay hidden for six months.
          </p>
          {pending.map((text) => (
            <div key={text} className="row between gen-suggest-row" style={{ alignItems: 'center', gap: 8, padding: '5px 8px' }}>
              <span style={{ fontSize: 13.5 }}>{text}</span>
              <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                <button className="btn small" onClick={() => addSuggestion(text)}>
                  <Icon name="plus" size={13} /> Add
                </button>
                <button className="btn ghost small" onClick={() => dismissSuggestion(text)}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="muted" style={{ fontSize: 13, fontWeight: 500 }}>Entries</label>
      <div style={{ marginTop: 8 }}>
        {entries.length === 0 && <p className="faint">No entries. Add one below.</p>}
        {entries.map((entry) => (
          <div key={entry.id} className="row" style={{ gap: 8, marginBottom: 6 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={entry.text}
              placeholder="A result (e.g. The Rusty Tankard)"
              onChange={(e) => updateEntry(entry.id, { text: e.target.value })}
            />
            <input
              className="input"
              type="number"
              min={1}
              title="Weight (how likely this entry is)"
              style={{ width: 64 }}
              value={entry.weight}
              onChange={(e) => updateEntry(entry.id, { weight: Math.max(1, Number(e.target.value) || 1) })}
            />
            <button className="btn ghost small" aria-label="Remove entry" onClick={() => removeEntry(entry.id)}>
              <Icon name="x" size={13} />
            </button>
          </div>
        ))}
        <button className="btn small" style={{ marginTop: 6 }} onClick={addEntry}>
          <Icon name="plus" size={14} /> Add entry
        </button>
      </div>

      <p className="faint" style={{ fontSize: 12, marginTop: 18 }}>
        Weights set likelihood. Autosaves as you type. These lists apply to every campaign.
      </p>
    </div>
  )
}
