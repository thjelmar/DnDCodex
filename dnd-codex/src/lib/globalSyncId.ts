// Cloud ids for the account-level `user_records` table (T-93).
//
// `user_records.id` is a Postgres uuid, but two synced Dexie tables use short
// string primary keys: generator tables by `slot` ("tavern-name") and Daily Duel
// history by `day` ("2026-11-18"). Postgres rejects those with error 22P02. The
// Dexie keys stay as they are; only at the cloud boundary is a key mapped to a
// deterministic uuid, so every device derives the same cloud id for the same slot
// or day. A key that already is a uuid (templates, the Overview layout) is used as
// it is. The record body carries the real key (`slot` / `day`), so the pull side
// maps back from the body and never needs to invert the cloud id.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Fixed namespace for the version 5 ids. Never change it: it would orphan every cloud row. */
export const GLOBAL_ID_NAMESPACE = '6f1d3c52-8a47-4b9e-9d0a-2e5c7b81f4a3'

export function isUuid(s: string): boolean {
  return UUID_RE.test(s)
}

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function formatUuid(b: Uint8Array): string {
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** UUID v5 (RFC 4122): SHA-1 over the namespace bytes followed by the UTF-8 name. */
export async function uuidV5(name: string, namespace: string = GLOBAL_ID_NAMESPACE): Promise<string> {
  const ns = uuidBytes(namespace)
  const nm = new TextEncoder().encode(name)
  const input = new Uint8Array(ns.length + nm.length)
  input.set(ns)
  input.set(nm, ns.length)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', input))
  const b = hash.slice(0, 16)
  b[6] = (b[6] & 0x0f) | 0x50
  b[8] = (b[8] & 0x3f) | 0x80
  return formatUuid(b)
}

/**
 * The cloud `id` for a record: the key itself (lowercased) when it is already a
 * uuid, otherwise a deterministic v5 uuid of `kind:key`.
 */
export async function cloudIdFor(kind: string, key: string): Promise<string> {
  return isUuid(key) ? key.toLowerCase() : uuidV5(`${kind}:${key}`)
}
