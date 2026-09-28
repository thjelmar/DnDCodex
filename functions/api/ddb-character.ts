// Cloudflare Pages Function: GET /api/ddb-character?id=<numericId>
//
// Server-side proxy to D&D Beyond's UNOFFICIAL public character-service endpoint.
// The browser can't fetch it directly (CORS), so we fetch it here (same-origin
// with the site, no CORS handling needed) and return a trimmed JSON payload the
// client mapper (src/lib/ddb.ts) turns into a CharacterSheet.
//
// Read-only, PUBLIC characters only (a private/invalid id comes back as not
// available). Unofficial + ToS-gray + can break without notice — the feature is
// shipped behind an "experimental" label. No secrets/env needed.

const DDB_BASE = 'https://character-service.dndbeyond.com/character/v5/character/'

// Heavy arrays we don't use in v1 — drop them so the payload isn't ~300KB. The
// rest (identity, stats, modifiers, hp inputs, currencies, speeds, avatar) stays.
const DROP = new Set([
  'inventory', 'spells', 'classSpells', 'customItems', 'actions', 'customActions',
  'features', 'options', 'choices', 'characterValues', 'optionalClassFeatures',
  'optionalOrigins', 'pactMagic', 'spellSlots', 'creatures', 'configuration',
  'preferences', 'conditions', 'deathSaves', 'campaign', 'campaignSetting',
])

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const onRequestGet: (context: { request: Request }) => Promise<Response> = async ({ request }) => {
  const id = (new URL(request.url).searchParams.get('id') || '').trim()
  if (!/^\d{1,15}$/.test(id)) return json(400, { error: 'A numeric character id is required.' })

  let res: Response
  try {
    res = await fetch(DDB_BASE + id, {
      headers: {
        'user-agent': 'Mozilla/5.0 (D&D Codex character import)',
        accept: 'application/json',
      },
    })
  } catch {
    return json(502, { error: 'Could not reach D&D Beyond.' })
  }
  if (res.status === 404) return json(404, { error: 'Character not found or not public.' })
  if (!res.ok) return json(502, { error: `D&D Beyond returned ${res.status}.` })

  let body: { success?: boolean; data?: Record<string, unknown> }
  try {
    body = (await res.json()) as typeof body
  } catch {
    return json(502, { error: 'D&D Beyond returned a non-JSON response.' })
  }
  if (!body?.success || !body?.data) {
    return json(404, { error: 'Character is not available (private or invalid id).' })
  }

  const data = body.data
  const trimmed: Record<string, unknown> = {}
  for (const k of Object.keys(data)) if (!DROP.has(k)) trimmed[k] = data[k]

  // A slim inventory — just what the mapper needs to know which item "set"
  // modifiers (Belt/Gauntlets/Amulet ability overrides) are actually active.
  const inv = Array.isArray(data.inventory) ? data.inventory : []
  trimmed.inventory = inv.map((it: Record<string, any>) => ({
    id: it?.id,
    defId: it?.definition?.id,
    name: it?.definition?.name,
    equipped: !!it?.equipped,
    isAttuned: !!it?.isAttuned,
    canAttune: !!it?.definition?.canAttune,
    qty: it?.quantity ?? 1,
    rarity: it?.definition?.rarity,
    type: it?.definition?.filterType,
  }))

  return json(200, { ok: true, id: data.id, name: data.name, character: trimmed })
}
