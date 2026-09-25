import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { newId } from '../db/db'
import { Icon } from './Icon'
import { useConfirm } from './ConfirmDialog'
import {
  getTreasury, setTreasury, getLoot, addLootItem, updateLootItem, deleteLootItem,
  EMPTY_TREASURY, type Treasury, type CoinKey, type LootItem,
} from '../auth/cloud'

// Shared, live party loot + gold tracker. Both the DM and players read AND write
// the same cloud rows (party_treasury + party_loot, member-writable RLS) and see
// each other's edits over Realtime. Inputs commit on blur and only re-sync from
// the server while NOT focused, so a teammate's live update can't clobber what
// you're mid-typing (last write wins on save). See migration 0011.

const COINS: { key: CoinKey; label: string }[] = [
  { key: 'pp', label: 'PP' },
  { key: 'gp', label: 'GP' },
  { key: 'ep', label: 'EP' },
  { key: 'sp', label: 'SP' },
  { key: 'cp', label: 'CP' },
]
// Coin → gp for the running total.
const IN_GP: Record<CoinKey, number> = { pp: 10, gp: 1, ep: 0.5, sp: 0.1, cp: 0.01 }

function totalGp(t: Treasury): number {
  return COINS.reduce((sum, c) => sum + (t[c.key] || 0) * IN_GP[c.key], 0)
}

/** Live subscription to a campaign's shared treasury + loot, with a refresh(). */
function usePartyLoot(cloudCampaignId: string | null | undefined) {
  const { session } = useAuth()
  const token = session?.access_token ?? null
  const [treasury, setTreasuryState] = useState<Treasury>(EMPTY_TREASURY)
  const [items, setItems] = useState<LootItem[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useRef(async () => {})
  refresh.current = async () => {
    if (!cloudCampaignId) return
    const [t, l] = await Promise.all([getTreasury(cloudCampaignId), getLoot(cloudCampaignId)])
    setTreasuryState(t)
    setItems(l)
  }

  useEffect(() => {
    if (!cloudCampaignId) {
      setItems([])
      setTreasuryState(EMPTY_TREASURY)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const load = async () => {
      await refresh.current()
      if (!cancelled) setLoading(false)
    }
    load()
    if (!supabase || !token) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => refresh.current(), 250)
    }
    const channel = supabase
      .channel(`party-loot-${cloudCampaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_treasury', filter: `campaign_id=eq.${cloudCampaignId}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'party_loot', filter: `campaign_id=eq.${cloudCampaignId}` }, schedule)
      .subscribe()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      supabase!.removeChannel(channel)
    }
  }, [cloudCampaignId, token])

  return { treasury, items, loading, refresh: () => refresh.current() }
}

export function PartyLoot({ cloudCampaignId }: { cloudCampaignId: string }) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const confirm = useConfirm()
  const { treasury, items, loading, refresh } = usePartyLoot(cloudCampaignId)

  // Local coin drafts — synced from the server only while not being edited.
  const [coins, setCoins] = useState<Treasury>(treasury)
  const editing = useRef(false)
  useEffect(() => {
    if (!editing.current) setCoins(treasury)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treasury.pp, treasury.gp, treasury.ep, treasury.sp, treasury.cp])

  async function saveCoins(next: Treasury) {
    setCoins(next)
    try {
      await setTreasury(cloudCampaignId, next, userId)
      refresh()
    } catch { /* transient — a later edit or realtime tick reconciles */ }
  }

  function commitCoins() {
    editing.current = false
    const changed = COINS.some((c) => (coins[c.key] || 0) !== (treasury[c.key] || 0))
    if (changed) saveCoins(coins)
  }

  async function addItem(item: { name: string; qty: number; value: string; claimedBy: string; notes: string }) {
    await addLootItem(cloudCampaignId, newId(), item, userId)
    refresh()
  }

  async function removeItem(it: LootItem) {
    const ok = await confirm({
      title: 'Remove item?',
      message: `Remove “${it.name || 'this item'}” from the party loot?`,
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    await deleteLootItem(it.id)
    refresh()
  }

  const total = totalGp(coins)

  return (
    <div className="loot">
      <div className="loot-purse">
        <div className="loot-purse-coins">
          {COINS.map((c) => (
            <label key={c.key} className="loot-coin">
              <span className="loot-coin-label">{c.label}</span>
              <input
                className="input loot-coin-input"
                type="number"
                min={0}
                value={coins[c.key]}
                onFocus={() => { editing.current = true }}
                onChange={(e) => setCoins((prev) => ({ ...prev, [c.key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                onBlur={commitCoins}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                aria-label={`${c.label} coins`}
              />
            </label>
          ))}
        </div>
        <div className="loot-total" title="Total value in gold">
          ≈ {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} gp
        </div>
      </div>

      <div className="loot-items">
        {loading && items.length === 0 ? (
          <p className="faint" style={{ margin: '8px 0' }}>Loading…</p>
        ) : items.length === 0 ? (
          <p className="faint" style={{ margin: '8px 0' }}>No loot yet. Add the party’s treasure below.</p>
        ) : (
          <div className="loot-table">
            <div className="loot-row loot-head">
              <span>Item</span><span>Qty</span><span>Value</span><span>Claimed by</span><span></span>
            </div>
            {items.map((it) => (
              <LootRow key={it.id} item={it} onRemove={() => removeItem(it)} onRefresh={refresh} />
            ))}
          </div>
        )}
      </div>

      <AddLoot onAdd={addItem} />
    </div>
  )
}

/** One loot row. Local drafts commit on blur; the row re-syncs from the server
 *  copy only when the user isn't editing, so a teammate's edit won't clobber a
 *  field mid-type. */
function LootRow({ item, onRemove, onRefresh }: { item: LootItem; onRemove: () => void; onRefresh: () => void }) {
  const editing = useRef(false)
  const [draft, setDraft] = useState(item)
  useEffect(() => {
    if (!editing.current) setDraft(item)
  }, [item])

  async function commit<K extends keyof LootItem>(key: K) {
    editing.current = false
    if (draft[key] === item[key]) return
    try {
      await updateLootItem(item.id, { [key]: draft[key] } as never)
      onRefresh()
    } catch { setDraft(item) }
  }

  return (
    <div className="loot-row">
      <input
        className="input" value={draft.name} placeholder="Item"
        onFocus={() => { editing.current = true }}
        onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        onBlur={() => commit('name')} aria-label="Item name"
      />
      <input
        className="input" type="number" min={0} value={draft.qty}
        onFocus={() => { editing.current = true }}
        onChange={(e) => setDraft((d) => ({ ...d, qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
        onBlur={() => commit('qty')} aria-label="Quantity"
      />
      <input
        className="input" value={draft.value} placeholder="—"
        onFocus={() => { editing.current = true }}
        onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
        onBlur={() => commit('value')} aria-label="Value"
      />
      <input
        className="input" value={draft.claimedBy} placeholder="—"
        onFocus={() => { editing.current = true }}
        onChange={(e) => setDraft((d) => ({ ...d, claimedBy: e.target.value }))}
        onBlur={() => commit('claimedBy')} aria-label="Claimed by"
      />
      <button className="btn ghost small" onClick={onRemove} aria-label="Remove item" title="Remove">
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}

function AddLoot({ onAdd }: { onAdd: (item: { name: string; qty: number; value: string; claimedBy: string; notes: string }) => void }) {
  const [name, setName] = useState('')
  const [qty, setQty] = useState('1')
  const [value, setValue] = useState('')
  const [claimedBy, setClaimedBy] = useState('')

  function submit() {
    if (!name.trim()) return
    onAdd({ name: name.trim(), qty: Math.max(1, Math.floor(Number(qty) || 1)), value: value.trim(), claimedBy: claimedBy.trim(), notes: '' })
    setName(''); setQty('1'); setValue(''); setClaimedBy('')
  }

  return (
    <div className="loot-add" onKeyDown={(e) => { if (e.key === 'Enter') submit() }}>
      <input className="input" placeholder="Add item…" value={name} onChange={(e) => setName(e.target.value)} aria-label="New item name" />
      <input className="input" type="number" min={1} placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="New item quantity" />
      <input className="input" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} aria-label="New item value" />
      <input className="input" placeholder="Claimed by" value={claimedBy} onChange={(e) => setClaimedBy(e.target.value)} aria-label="New item claimed by" />
      <button className="btn small primary" onClick={submit} disabled={!name.trim()}>Add</button>
    </div>
  )
}
