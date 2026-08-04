import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createItem, updateItem, deleteItem } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { Modal } from '../components/Modal'
import { CampaignMarkdown } from '../components/CampaignMarkdown'
import type { Item, ItemRarity } from '../db/types'

const RARITIES: ItemRarity[] = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact']
const RARITY_COLOR: Record<ItemRarity, string> = {
  common: '#9ca3af',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  'very rare': '#a78bfa',
  legendary: '#fbbf24',
  artifact: '#f87171',
}

export function ItemsPage() {
  const campaign = useCampaign()
  const items = useLiveQuery(
    () => db.items.where('campaignId').equals(campaign.id).sortBy('name'),
    [campaign.id],
  )
  // A ?sel=<id> param (from search or a wiki link) opens that item for editing,
  // on mount and whenever the param changes.
  const [searchParams] = useSearchParams()
  const sel = searchParams.get('sel')
  const [editingId, setEditingId] = useState<string | null>(() => sel)
  useEffect(() => {
    if (sel) setEditingId(sel)
  }, [sel])
  const editing = items?.find((i) => i.id === editingId) ?? null

  const [filter, setFilter] = useState('')
  const shown = (items ?? []).filter(
    (i) =>
      !filter ||
      i.name.toLowerCase().includes(filter.toLowerCase()) ||
      i.category.toLowerCase().includes(filter.toLowerCase()),
  )

  async function add() {
    const i = await createItem(campaign.id)
    setEditingId(i.id)
  }

  return (
    <div>
      <div className="row between" style={{ marginBottom: 14 }}>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          placeholder="Filter items…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="btn primary" onClick={add}>
          ＋ New Item
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <div className="big">⚔️</div>
          <p>{items?.length ? 'No items match your filter.' : 'No items yet.'}</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 13 }}>
                <th style={cellHead}>Name</th>
                <th style={cellHead}>Type</th>
                <th style={cellHead}>Rarity</th>
                <th style={cellHead}>Attune</th>
                <th style={cellHead}>Value</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => setEditingId(i.id)}
                  style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
                >
                  <td style={cell}><strong>{i.name}</strong></td>
                  <td style={cell}>{i.category || '—'}</td>
                  <td style={{ ...cell, color: RARITY_COLOR[i.rarity], textTransform: 'capitalize' }}>
                    {i.rarity}
                  </td>
                  <td style={cell}>{i.attunement ? 'Yes' : '—'}</td>
                  <td style={cell}>{i.value || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ItemModal item={editing} onClose={() => setEditingId(null)} />
      )}
    </div>
  )
}

const cellHead: React.CSSProperties = { padding: '8px 10px', fontWeight: 600 }
const cell: React.CSSProperties = { padding: '10px' }

function ItemModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState(item.category)
  const [rarity, setRarity] = useState<ItemRarity>(item.rarity)
  const [attunement, setAttunement] = useState(item.attunement)
  const [value, setValue] = useState(item.value)
  const [description, setDescription] = useState(item.description)
  const [preview, setPreview] = useState(false)

  async function save() {
    await updateItem(item.id, { name, category, rarity, attunement, value, description })
    onClose()
  }

  return (
    <Modal
      title="Item"
      onClose={onClose}
      footer={
        <>
          <button
            className="btn danger"
            style={{ marginRight: 'auto' }}
            onClick={async () => {
              if (confirm(`Delete "${item.name}"?`)) {
                await deleteItem(item.id)
                onClose()
              }
            }}
          >
            Delete
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="form-row">
        <div className="field">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Type / category</label>
          <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Weapon, Potion…" />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label>Rarity</label>
          <select className="select" value={rarity} onChange={(e) => setRarity(e.target.value as ItemRarity)}>
            {RARITIES.map((r) => (
              <option key={r} value={r} style={{ textTransform: 'capitalize' }}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Value</label>
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="500 gp" />
        </div>
      </div>
      <label className="row" style={{ gap: 8, marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={attunement} onChange={(e) => setAttunement(e.target.checked)} />
        Requires attunement
      </label>
      <div className="field">
        <div className="row between">
          <label>Description (markdown)</label>
          <button className="btn ghost small" onClick={() => setPreview((p) => !p)}>
            {preview ? '✎ Edit' : '👁 Preview'}
          </button>
        </div>
        {preview ? (
          <div className="card" style={{ cursor: 'default' }}>
            <CampaignMarkdown campaignId={item.campaignId} text={description} />
          </div>
        ) : (
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        )}
      </div>
    </Modal>
  )
}
