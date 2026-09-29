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

// Heavy arrays we don't use — drop them so the payload isn't ~300KB. Spells,
// spell slots and actions are re-added below in slimmed form (for Tier 2). The
// rest (identity, stats, modifiers, hp inputs, currencies, speeds, avatar, and
// race/classes which carry racial traits + class features) stays.
const DROP = new Set([
  'inventory', 'spells', 'classSpells', 'customItems', 'actions', 'customActions',
  'features', 'options', 'choices', 'characterValues', 'optionalClassFeatures',
  'optionalOrigins', 'pactMagic', 'spellSlots', 'creatures', 'configuration',
  'preferences', 'conditions', 'deathSaves', 'campaign', 'campaignSetting',
])

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>

// Slim one spell entry to just what the sheet shows.
function slimSpell(s: Any, source: string): Any {
  const def = s?.definition || {}
  return {
    name: def.name,
    level: def.level ?? 0,
    school: def.school,
    prepared: !!(s?.prepared || s?.alwaysPrepared),
    concentration: !!def.concentration,
    ritual: !!def.ritual,
    saveDcAbilityId: def.saveDcAbilityId ?? null,
    castAbilityId: s?.spellCastingAbilityId ?? null,
    source,
  }
}

// Collect spells from every source (class list, item/feat/race grants).
function collectSpells(data: Any): Any[] {
  const out: Any[] = []
  const sp = data.spells || {}
  const push = (arr: any, source: string) => {
    if (Array.isArray(arr)) for (const s of arr) out.push(slimSpell(s, source))
  }
  push(sp.race, 'Race'); push(sp.feat, 'Feat'); push(sp.item, 'Item'); push(sp.background, 'Background')
  // Class spellbooks live under classSpells[].spells, keyed to a class id.
  const classNameById: Record<number, string> = {}
  for (const c of (data.classes || []) as Any[]) if (c?.id) classNameById[c.id] = c?.definition?.name || 'Class'
  for (const cs of (data.classSpells || []) as Any[]) {
    push(cs?.spells, classNameById[cs?.characterClassId] || 'Class')
  }
  return out
}

// Slim slot ladders to the levels that actually have slots.
function slimSlots(arr: any): Any[] {
  if (!Array.isArray(arr)) return []
  return arr
    .filter((s: Any) => (s?.available ?? 0) > 0)
    .map((s: Any) => ({ level: s.level, total: s.available }))
}

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

  // A slim inventory — enough for the mapper to (a) know which item "set"
  // modifiers (Belt/Gauntlets/Amulet ability overrides) are active, and (b)
  // build weapon attacks (damage / properties / magic bonus).
  const inv = Array.isArray(data.inventory) ? data.inventory : []
  trimmed.inventory = inv.map((it: Any) => {
    const def = it?.definition || {}
    const isWeapon = def.filterType === 'Weapon'
    const base: Any = {
      id: it?.id,
      defId: def.id,
      name: def.name,
      equipped: !!it?.equipped,
      isAttuned: !!it?.isAttuned,
      canAttune: !!def.canAttune,
      qty: it?.quantity ?? 1,
      rarity: def.rarity,
      type: def.filterType,
    }
    if (isWeapon) {
      base.weapon = {
        categoryId: def.categoryId, // 1 = simple, 2 = martial
        weaponType: def.type, // e.g. "Greataxe", "Handaxe"
        attackType: def.attackType, // 1 = melee, 2 = ranged
        damage: def.damage?.diceString || null,
        fixedDamage: def.damage?.fixedValue ?? null,
        damageType: def.damageType || null,
        range: def.range ?? null,
        longRange: def.longRange ?? null,
        properties: Array.isArray(def.properties) ? def.properties.map((p: Any) => p?.name).filter(Boolean) : [],
        // Magic to-hit/damage bonuses baked into the item.
        grantedModifiers: Array.isArray(def.grantedModifiers)
          ? def.grantedModifiers
              .filter((m: Any) => m?.type === 'bonus' && (m?.subType === 'magic' || m?.subType === 'damage'))
              .map((m: Any) => ({ subType: m.subType, value: m.value }))
          : [],
      }
    }
    return base
  })

  // Tier 2: spells + slot ladders + attack-type actions (all slimmed).
  trimmed.spells = collectSpells(data)
  trimmed.spellSlots = slimSlots(data.spellSlots)
  trimmed.pactMagic = slimSlots(data.pactMagic)
  const actionAttacks: Any[] = []
  const acts = data.actions || {}
  for (const key of ['class', 'race', 'feat', 'item'] as const) {
    for (const a of (acts[key] || []) as Any[]) {
      if (!a?.displayAsAttack && a?.attackTypeRange == null) continue
      actionAttacks.push({
        name: a.name,
        dice: a.dice?.diceString || null,
        fixedToHit: a.fixedToHit ?? null,
        abilityModifierStatId: a.abilityModifierStatId ?? null,
        damageTypeId: a.damageTypeId ?? null,
        range: a.range ?? null,
        source: key,
      })
    }
  }
  trimmed.actionAttacks = actionAttacks

  // The primary class spellcasting ability (for save DC / attack bonus). Null
  // for non-casters (their only spells, if any, come from items and carry their
  // own DC on the item, not a character stat).
  let castAbilityId: number | null = null
  for (const c of (data.classes || []) as Any[]) {
    castAbilityId = c?.definition?.spellCastingAbilityId ?? c?.subclassDefinition?.spellCastingAbilityId ?? castAbilityId
    if (castAbilityId) break
  }
  trimmed.spellcastingAbilityId = castAbilityId

  return json(200, { ok: true, id: data.id, name: data.name, character: trimmed })
}
