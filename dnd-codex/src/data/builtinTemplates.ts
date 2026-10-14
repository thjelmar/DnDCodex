import type { TemplateKind } from '../db/types'

// Built-in templates (T-8 sessions, T-30 npc/location). These ship in code — they
// are NOT stored in Dexie and never sync; they just seed a new entity's fields
// when picked from a "New from template" menu, alongside the user's own saved
// templates. Ids are stable strings (prefixed `builtin-`) so they never collide
// with the uuid ids of user templates.

export interface BuiltinTemplate {
  id: string
  kind: TemplateKind
  label: string
  /** One-line hint shown under the label in the menu / manager. */
  description: string
  /** Fields pre-filled into the new entity (same shape as a user template's data). */
  data: Record<string, unknown>
}

// Session `notes`, NPC/Location `description` are all rich-text HTML (the WYSIWYG
// editor's format), so these skeletons are authored as HTML headings + lists.
export const BUILTIN_SESSION_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin-session-prep',
    kind: 'session',
    label: 'Session Prep',
    description: 'A running-session skeleton: recap, scenes, encounters, loot, hooks.',
    data: {
      tags: ['prep'],
      notes:
        '<h3>Recap</h3><p>Where we left off…</p>' +
        '<h3>Scenes &amp; Beats</h3><ul><li></li><li></li></ul>' +
        '<h3>Encounters</h3><ul><li></li></ul>' +
        '<h3>NPCs &amp; Locations in play</h3><ul><li></li></ul>' +
        '<h3>Loot &amp; Rewards</h3><ul><li></li></ul>' +
        '<h3>Hooks / Next time</h3><ul><li></li></ul>',
    },
  },
  {
    id: 'builtin-one-shot',
    kind: 'session',
    label: 'One-Shot',
    description: 'A self-contained adventure: pitch, hook, three acts, climax, rewards.',
    data: {
      tags: ['one-shot'],
      notes:
        '<h3>Pitch</h3><p>The one-line premise…</p>' +
        '<h3>Hook</h3><p>How the party gets involved…</p>' +
        '<h3>Act 1 — Setup</h3><ul><li></li></ul>' +
        '<h3>Act 2 — Complication</h3><ul><li></li></ul>' +
        '<h3>Act 3 — Climax</h3><ul><li></li></ul>' +
        '<h3>Rewards</h3><ul><li></li></ul>',
    },
  },
  {
    id: 'builtin-downtime',
    kind: 'session',
    label: 'Downtime',
    description: 'Between-adventures activities, events, shopping, and carousing.',
    data: {
      tags: ['downtime'],
      notes:
        '<h3>Downtime Activities</h3><ul><li></li></ul>' +
        '<h3>Events &amp; Complications</h3><ul><li></li></ul>' +
        '<h3>Shopping &amp; Crafting</h3><ul><li></li></ul>' +
        '<h3>Carousing / Rumors</h3><ul><li></li></ul>',
    },
  },
]

// NPC archetypes. `role`/`disposition` are seeded; `description` is an HTML
// skeleton. Name is intentionally left blank so each new NPC starts as "New NPC"
// for the DM to name.
export const BUILTIN_NPC_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin-npc-merchant',
    kind: 'npc',
    label: 'Merchant / Shopkeeper',
    description: 'A vendor: what they sell, personality, and a secret.',
    data: {
      role: 'Merchant',
      disposition: 'friendly',
      tags: ['merchant'],
      description:
        '<h3>Appearance</h3><p></p>' +
        '<h3>Personality</h3><p></p>' +
        '<h3>Sells / Services</h3><ul><li></li></ul>' +
        '<h3>Secret / Hook</h3><p></p>',
    },
  },
  {
    id: 'builtin-npc-quest-giver',
    kind: 'npc',
    label: 'Quest Giver',
    description: 'A patron: what they want, the reward, and the catch.',
    data: {
      role: 'Patron',
      disposition: 'friendly',
      tags: ['quest'],
      description:
        '<h3>Who they are</h3><p></p>' +
        '<h3>What they want</h3><p></p>' +
        '<h3>Reward</h3><p></p>' +
        '<h3>Complication</h3><p></p>',
    },
  },
  {
    id: 'builtin-npc-villain',
    kind: 'npc',
    label: 'Villain / Antagonist',
    description: 'An adversary: goal, methods, resources, and weakness.',
    data: {
      role: 'Antagonist',
      disposition: 'hostile',
      tags: ['villain'],
      description:
        '<h3>Goal</h3><p></p>' +
        '<h3>Methods</h3><p></p>' +
        '<h3>Resources / Allies</h3><ul><li></li></ul>' +
        '<h3>Weakness</h3><p></p>',
    },
  },
  {
    id: 'builtin-npc-commoner',
    kind: 'npc',
    label: 'Commoner / Guard',
    description: 'A background NPC: role, demeanor, and a distinguishing trait.',
    data: {
      role: 'Townsfolk',
      disposition: 'neutral',
      description:
        '<h3>Role</h3><p></p>' +
        '<h3>Demeanor</h3><p></p>' +
        '<h3>Distinguishing trait</h3><p></p>',
    },
  },
]

// Location archetypes. `type` is seeded to a valid LocationType; `description` is
// an HTML skeleton. Name is left blank so each starts as "New Location".
export const BUILTIN_LOCATION_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin-loc-tavern',
    kind: 'location',
    label: 'Tavern / Inn',
    description: 'A watering hole: atmosphere, staff, menu, and rumors.',
    data: {
      type: 'landmark',
      tags: ['tavern'],
      description:
        '<h3>Atmosphere</h3><p></p>' +
        '<h3>Staff &amp; Regulars</h3><ul><li></li></ul>' +
        '<h3>Menu / Rooms</h3><ul><li></li></ul>' +
        '<h3>Rumors Overheard</h3><ul><li></li></ul>',
    },
  },
  {
    id: 'builtin-loc-dungeon',
    kind: 'location',
    label: 'Dungeon',
    description: 'A site to delve: history, inhabitants, hazards, and treasure.',
    data: {
      type: 'dungeon',
      tags: ['dungeon'],
      description:
        '<h3>History</h3><p></p>' +
        '<h3>Inhabitants</h3><ul><li></li></ul>' +
        '<h3>Hazards &amp; Traps</h3><ul><li></li></ul>' +
        '<h3>Treasure</h3><ul><li></li></ul>',
    },
  },
  {
    id: 'builtin-loc-shop',
    kind: 'location',
    label: 'Shop',
    description: 'A storefront: wares, proprietor, and pricing.',
    data: {
      type: 'landmark',
      tags: ['shop'],
      description:
        '<h3>Wares</h3><ul><li></li></ul>' +
        '<h3>Proprietor</h3><p></p>' +
        '<h3>Pricing / Haggling</h3><p></p>',
    },
  },
  {
    id: 'builtin-loc-town',
    kind: 'location',
    label: 'Town',
    description: 'A settlement skeleton: overview, notable places, and factions.',
    data: {
      type: 'town',
      description:
        '<h3>Overview</h3><p></p>' +
        '<h3>Notable Places</h3><ul><li></li></ul>' +
        '<h3>Factions &amp; Figures</h3><ul><li></li></ul>' +
        '<h3>Troubles / Hooks</h3><ul><li></li></ul>',
    },
  },
]

/** All built-ins, in one list (used by the Templates manager). */
export const ALL_BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  ...BUILTIN_SESSION_TEMPLATES,
  ...BUILTIN_NPC_TEMPLATES,
  ...BUILTIN_LOCATION_TEMPLATES,
]

/** The built-in templates for one entity kind (used by each page's menu). */
export function builtinTemplatesFor(kind: TemplateKind): BuiltinTemplate[] {
  return ALL_BUILTIN_TEMPLATES.filter((t) => t.kind === kind)
}
