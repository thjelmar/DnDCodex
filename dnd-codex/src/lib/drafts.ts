import { db } from '../db/db'
import type { SyncTable } from '../db/types'

// Blank-draft ledger (T-125).
//
// A "New …" button creates a record straight away so the editor has something to
// bind to. Until the user enters something, that record is a *draft*:
//   - it is never queued for sync (see `holdBack`, called by the sync outbox),
//   - it is deleted again if the user leaves without filling it in (see
//     `purgeBlankDrafts`), so no empty rows pile up in IndexedDB.
//
// "Blank" means "unchanged since creation". The ledger stores a snapshot of the
// record as created, so template-seeded content and default values (default
// title, default dates, the two empty roll-table rows) all count as blank until
// the user changes something. Once a draft gets content it is released from the
// ledger for good: clearing a saved record back to empty never deletes it.
//
// The ledger lives in localStorage so a crash or closed tab can't strand a blank
// row forever; each entry records which tab created it, so one tab never purges
// a sheet another tab is still editing.

type Snapshot = Record<string, unknown>

interface DraftEntry {
  table: SyncTable
  id: string
  /** Normalized record as created (the "blank" baseline). */
  base: Snapshot
  owner: string
  at: number
}

const KEY = 'dndcodex.drafts.v1'
const TAB_ID = Math.random().toString(36).slice(2)
/** Entries from other tabs are only purged once they are this old (ms). */
const STALE_MS = 10 * 60 * 1000

/** Owner value for drafts whose tab has closed; the next boot sweeps them at once. */
const GONE = 'gone'

const IGNORED = new Set(['id', 'createdAt', 'updatedAt', 'campaignId'])
const TITLE_KEYS = new Set(['name', 'title'])

// An editor may write its fields back on mount (a rich-text editor turns '' into
// '<p></p>', a form turns a missing field into null). None of that is content, so
// empty-ish values are dropped before two snapshots are compared.
const MEDIA = /<(img|iframe|video|audio|hr|table|svg|canvas)\b/i

function prune(v: unknown): unknown {
  if (v === undefined || v === null || v === false) return undefined
  if (typeof v === 'string') {
    if (!v.includes('<')) return v.trim() === '' ? undefined : v
    const text = v.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
    return text === '' && !MEDIA.test(v) ? undefined : v
  }
  if (Array.isArray(v)) {
    const items = v.map(prune).filter((x) => x !== undefined)
    return items.length ? items : undefined
  }
  if (typeof v === 'object') {
    const out: Snapshot = {}
    for (const [k, x] of Object.entries(v as Snapshot)) {
      const p = prune(x)
      if (p !== undefined) out[k] = p
    }
    return Object.keys(out).length ? out : undefined
  }
  return v
}

function normalize(rec: object): Snapshot {
  const out: Snapshot = {}
  for (const [k, v] of Object.entries(rec as Snapshot)) {
    if (IGNORED.has(k)) continue
    const p = prune(TITLE_KEYS.has(k) && typeof v === 'string' ? v.trim() : v)
    if (p !== undefined) out[k] = p
  }
  return out
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * True when `rec` still equals the creation baseline. An emptied title also counts
 * as blank (the default title is not content, and neither is no title).
 */
export function isUnchangedSinceCreation(base: Snapshot, rec: object): boolean {
  const now = normalize(rec)
  for (const k of new Set([...Object.keys(base), ...Object.keys(now)])) {
    if (TITLE_KEYS.has(k) && (now[k] === undefined || now[k] === base[k])) continue
    if (!same(base[k], now[k])) return false
  }
  return true
}

let cache: DraftEntry[] | null = null

function load(): DraftEntry[] {
  if (cache) return cache
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? (JSON.parse(raw) as DraftEntry[]) : []
  } catch {
    cache = []
  }
  return cache
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache ?? []))
  } catch {
    /* storage blocked: the in-memory ledger still works for this tab */
  }
}

/** Re-read the ledger from storage (another tab may have changed it). */
function refresh(): DraftEntry[] {
  cache = null
  return load()
}

function find(table: SyncTable, id: string): DraftEntry | undefined {
  return load().find((e) => e.table === table && e.id === id)
}

function drop(table: SyncTable, id: string): void {
  cache = refresh().filter((e) => !(e.table === table && e.id === id))
  save()
}

/** Registers a freshly created record as a draft. Call right after adding it. */
export function markDraft(table: SyncTable, rec: { id: string }): void {
  // Re-read first so another tab's entries are not overwritten by a stale cache.
  refresh().push({ table, id: rec.id, base: normalize(rec), owner: TAB_ID, at: Date.now() })
  save()
}

export function isDraft(table: SyncTable, id: string): boolean {
  return !!find(table, id)
}

/**
 * Sync gate. Returns true when the record is a draft that is still blank and so
 * must not be pushed. A draft that now has content is released and returns false.
 */
export async function holdBack(table: SyncTable, id: string): Promise<boolean> {
  const entry = find(table, id)
  if (!entry) return false
  const rec = (await db.table(table).get(id)) as object | undefined
  if (!rec) {
    drop(table, id)
    return false
  }
  if (isUnchangedSinceCreation(entry.base, rec)) return true
  drop(table, id)
  return false
}

export interface PurgeOptions {
  /** `own` (default): drafts this tab created. `stale`: old drafts from any tab (boot sweep). */
  scope?: 'own' | 'stale'
  /** Only consider these draft ids (the drafts that existed when the user left). */
  only?: string[]
  /** Skip drafts whose id appears in this text (the route the user is moving to). */
  keepIfIn?: string
}

/** Records another record still points at (a foreign key, a link, a pin, a map parent). */
async function isReferenced(id: string, ignore: Set<string>): Promise<boolean> {
  for (const t of db.tables) {
    if (t.name === 'pending' || t.name === 'syncState') continue
    const hit = await t.filter((row) => {
      const r = row as { id?: string }
      if (r.id === id || (r.id && ignore.has(r.id))) return false
      return JSON.stringify(row).includes(id)
    }).count()
    if (hit > 0) return true
  }
  return false
}

/** Keeps a draft for good (it gained content or something points at it) and queues it for sync. */
async function release(entry: DraftEntry): Promise<void> {
  drop(entry.table, entry.id)
  const { enqueuePutById } = await import('./syncQueue') // lazy: syncQueue imports this module
  await enqueuePutById(entry.table, entry.id)
}

/**
 * Deletes still-blank drafts. A draft that gained content, or that anything
 * references (a link, a foreign key such as `threadId` or `parentLocationId`, a
 * pin), is released instead and syncs like any record. Drafts that only point at
 * each other (a blank child under a blank parent) are deleted together.
 */
export async function purgeBlankDrafts(opts: PurgeOptions = {}): Promise<number> {
  const scope = opts.scope ?? 'own'
  const t = Date.now()
  const candidates: DraftEntry[] = []
  for (const entry of [...refresh()]) {
    if (scope === 'own' ? entry.owner !== TAB_ID : entry.owner !== GONE && t - entry.at < STALE_MS) continue
    if (opts.only && !opts.only.includes(entry.id)) continue
    if (opts.keepIfIn && opts.keepIfIn.includes(entry.id)) continue
    const rec = (await db.table(entry.table).get(entry.id)) as object | undefined
    if (!rec) {
      drop(entry.table, entry.id)
      continue
    }
    if (!isUnchangedSinceCreation(entry.base, rec)) {
      await release(entry)
      continue
    }
    candidates.push(entry)
  }
  const blankIds = new Set(candidates.map((c) => c.id))
  let removed = 0
  for (const entry of candidates) {
    if (await isReferenced(entry.id, blankIds)) {
      await release(entry)
      continue
    }
    // Never synced (holdBack kept it out of the outbox), so no tombstone is needed.
    await db.table(entry.table).delete(entry.id)
    drop(entry.table, entry.id)
    removed++
  }
  return removed
}

/** Ids of this tab's drafts right now. */
export function ownDraftIds(): string[] {
  return refresh().filter((e) => e.owner === TAB_ID).map((e) => e.id)
}

let abandoned: string[] = []

/** Marks this tab's drafts as abandoned. Synchronous, so it can run in `pagehide`. */
export function abandonOwnDrafts(): void {
  abandoned = []
  for (const e of refresh()) {
    if (e.owner === TAB_ID) {
      e.owner = GONE
      abandoned.push(e.id)
    }
  }
  if (abandoned.length) save()
}

/** The page came back from the back/forward cache: take its drafts back. */
export function resumeOwnDrafts(): void {
  if (!abandoned.length) return
  for (const e of refresh()) if (abandoned.includes(e.id) && e.owner === GONE) e.owner = TAB_ID
  abandoned = []
  save()
}
