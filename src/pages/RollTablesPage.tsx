import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  createRollTable,
  updateRollTable,
  deleteRollTable,
  newRollTableEntry,
} from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { CampaignMarkdown } from '../components/CampaignMarkdown'
import {
  computeRanges,
  formatRange,
  rollOnTable,
  tableSize,
  type RollResult,
} from '../lib/roll'
import type { RollTable, RollTableEntry } from '../db/types'

export function RollTablesPage() {
  const campaign = useCampaign()
  const tables = useLiveQuery(
    () => db.rollTables.where('campaignId').equals(campaign.id).sortBy('name'),
    [campaign.id],
  )

  const [searchParams] = useSearchParams()
  const sel = searchParams.get('sel')
  const [selectedId, setSelectedId] = useState<string | null>(() => sel)
  useEffect(() => {
    if (sel) setSelectedId(sel)
  }, [sel])
  const selected = tables?.find((t) => t.id === selectedId) ?? null

  async function add() {
    const t = await createRollTable(campaign.id)
    setSelectedId(t.id)
  }

  // Group by category for the list.
  const grouped = new Map<string, RollTable[]>()
  for (const t of tables ?? []) {
    const key = t.category || 'Uncategorized'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(t)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <button className="btn primary" style={{ width: '100%', marginBottom: 12 }} onClick={add}>
          ＋ New Table
        </button>
        {tables?.length === 0 && <p className="faint">No roll tables yet.</p>}
        {[...grouped.entries()].map(([category, group]) => (
          <div key={category} style={{ marginBottom: 12 }}>
            <div className="sidebar-heading" style={{ margin: '4px 4px' }}>
              {category}
            </div>
            {group.map((t) => (
              <div
                key={t.id}
                className="list-row"
                style={{ cursor: 'pointer', borderColor: t.id === selectedId ? 'var(--accent)' : undefined }}
                onClick={() => setSelectedId(t.id)}
              >
                <div>
                  <div className="title">🎲 {t.name}</div>
                  <div className="sub">d{tableSize(t.entries)} · {t.entries.length} entries</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div>
        {selected ? (
          <RollTableEditor key={selected.id} table={selected} onDelete={() => setSelectedId(null)} />
        ) : (
          <div className="empty">
            <div className="big">🎲</div>
            <p>Select a table or create one — loot, encounters, rumors, wild magic…</p>
          </div>
        )}
      </div>
    </div>
  )
}

function RollTableEditor({ table, onDelete }: { table: RollTable; onDelete: () => void }) {
  const [name, setName] = useState(table.name)
  const [category, setCategory] = useState(table.category)
  const [description, setDescription] = useState(table.description)
  const [entries, setEntries] = useState<RollTableEntry[]>(table.entries)

  const [result, setResult] = useState<RollResult | null>(null)
  const [history, setHistory] = useState<RollResult[]>([])

  // Debounced autosave.
  useEffect(() => {
    const t = setTimeout(() => {
      updateRollTable(table.id, { name, category, description, entries })
    }, 500)
    return () => clearTimeout(t)
  }, [name, category, description, entries, table.id])

  const ranges = useMemo(() => computeRanges(entries), [entries])
  const size = tableSize(entries)

  function updateEntry(id: string, patch: Partial<RollTableEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }
  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }
  function addEntry() {
    setEntries((prev) => [...prev, newRollTableEntry()])
  }

  function doRoll() {
    // Roll against the freshest in-memory entries, not the debounced DB copy.
    const r = rollOnTable({ ...table, entries })
    if (r) {
      setResult(r)
      setHistory((h) => [r, ...h].slice(0, 6))
    }
  }

  return (
    <div>
      <div className="form-row" style={{ gridTemplateColumns: '1fr 200px' }}>
        <div className="field">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Category</label>
          <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Loot, Encounters…" />
        </div>
      </div>
      <div className="field">
        <label>Description (optional)</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When and how to use this table" />
      </div>

      {/* Roller */}
      <div
        className="card"
        style={{ cursor: 'default', display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}
      >
        <button className="btn primary" style={{ fontSize: 16, padding: '12px 20px' }} onClick={doRoll} disabled={size === 0}>
          🎲 Roll d{size || '—'}
        </button>
        <div style={{ flex: 1 }}>
          {result ? (
            <div>
              <div className="faint" style={{ fontSize: 12 }}>
                Rolled <strong style={{ color: 'var(--accent)' }}>{result.roll}</strong> on d{result.size}
              </div>
              <div style={{ fontSize: 16 }}>
                <CampaignMarkdown campaignId={table.campaignId} text={result.entry.text || '*(empty entry)*'} />
              </div>
            </div>
          ) : (
            <span className="faint">Roll to get a result.</span>
          )}
        </div>
      </div>

      {history.length > 1 && (
        <div className="row wrap" style={{ gap: 6, marginBottom: 20 }}>
          <span className="faint" style={{ fontSize: 12 }}>Recent:</span>
          {history.map((h, i) => (
            <span key={i} className="tag" style={{ fontSize: 11 }}>
              {h.roll}: {h.entry.text.slice(0, 24) || '—'}
            </span>
          ))}
        </div>
      )}

      {/* Entries editor */}
      <label className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
        Entries
      </label>
      <div style={{ marginTop: 8 }}>
        {entries.length === 0 && <p className="faint">No entries. Add one below.</p>}
        {entries.map((entry) => {
          const range = ranges.find((r) => r.entry.id === entry.id)
          const isHit = result?.entry.id === entry.id
          return (
            <div
              key={entry.id}
              className="row"
              style={{
                gap: 8,
                marginBottom: 6,
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                background: isHit ? 'rgba(167,139,250,0.15)' : 'transparent',
                border: isHit ? '1px solid var(--accent)' : '1px solid transparent',
              }}
            >
              <span
                className="tag"
                title="Die range"
                style={{ minWidth: 52, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
              >
                {range ? formatRange(range) : '—'}
              </span>
              <input
                className="input"
                style={{ flex: 1 }}
                value={entry.text}
                placeholder="Result (supports markdown & [[links]])"
                onChange={(e) => updateEntry(entry.id, { text: e.target.value })}
              />
              <input
                className="input"
                type="number"
                min={1}
                title="Weight (how many die numbers this covers)"
                style={{ width: 64 }}
                value={entry.weight}
                onChange={(e) => updateEntry(entry.id, { weight: Math.max(1, Number(e.target.value) || 1) })}
              />
              <button
                className="btn ghost small"
                aria-label="Remove entry"
                onClick={() => removeEntry(entry.id)}
              >
                ✕
              </button>
            </div>
          )
        })}
        <button className="btn small" style={{ marginTop: 6 }} onClick={addEntry}>
          ＋ Add entry
        </button>
      </div>

      <div className="row between" style={{ marginTop: 22 }}>
        <span className="faint" style={{ fontSize: 12 }}>
          Weights set likelihood — the die is their sum (d{size || 0}). Autosaves as you type.
        </span>
        <button
          className="btn danger small"
          onClick={async () => {
            if (confirm(`Delete "${table.name}"?`)) {
              await deleteRollTable(table.id)
              onDelete()
            }
          }}
        >
          Delete table
        </button>
      </div>
    </div>
  )
}
