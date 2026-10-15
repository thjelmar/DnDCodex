import type {
  DatabaseSnapshot,
  Campaign,
  Session,
  NPC,
  Location,
  Item,
  Note,
  RollTable,
  PlotThread,
  TimelineEvent,
  StoredImage,
  Scene,
  SceneToken,
  WorldMap,
} from '../db/types'
import { DEMO_IMG_WORLDMAP, DEMO_IMG_DECREE, DEMO_IMG_WANTED, DEMO_IMG_SIGIL } from './demoSeedImages'

// Sample campaign for the interactive demo (T-32, enriched in T-34). Loaded into
// the throwaway demo database on entry via importSnapshot('replace'). Images are
// small embedded WebP data URLs (demoSeedImages.ts) — the demo never touches
// Storage. Ids are stable strings; timestamps are fixed so the seed is deterministic.

const CID = 'demo-campaign-0001'
const T = '2026-02-14T18:00:00.000Z'

// NPC ids (referenced by locations + timeline).
const NPC_KING = 'demo-npc-king'
const NPC_ROGUE = 'demo-npc-rogue'
const NPC_VILLAIN = 'demo-npc-villain'
const NPC_INNKEEP = 'demo-npc-innkeep'

// Location ids.
const LOC_CITY = 'demo-loc-city'
const LOC_TAVERN = 'demo-loc-tavern'
const LOC_RUIN = 'demo-loc-ruin'
const LOC_FOREST = 'demo-loc-forest'

const THREAD = 'demo-thread-crown'

const campaign: Campaign = {
  id: CID,
  name: 'The Hollow Crown',
  summary: 'A kingdom on the edge of civil war, a stolen crown, and a party caught in the middle.',
  description:
    '<p>Welcome to the demo! This is a sample campaign showing what D&amp;D Codex can do — browse the ' +
    'NPCs, locations, sessions, timeline, and more. <strong>Saving is turned off in the demo</strong>, ' +
    'so poke around freely; nothing you change sticks.</p>',
  color: '#7c3aed',
  relatedCampaignIds: [],
  archived: false,
  coverImageId: null,
  role: 'dm',
  externalLinks: [{ id: 'demo-link-ddb', label: 'D&D Beyond', url: 'https://www.dndbeyond.com' }],
  linkedCampaignId: null,
  createdAt: T,
  updatedAt: T,
}

function npc(
  id: string,
  name: string,
  role: string,
  race: string,
  disposition: NPC['disposition'],
  locationId: string | null,
  description: string,
  tags: string[],
): NPC {
  return {
    id,
    campaignId: CID,
    name,
    role,
    race,
    imageId: null,
    description,
    locationId,
    statBlockData: null,
    statBlock: '',
    disposition,
    tags,
    createdAt: T,
    updatedAt: T,
  }
}

const npcs: NPC[] = [
  npc(
    NPC_KING,
    'King Aldric III',
    'Ailing monarch',
    'Human',
    'friendly',
    LOC_CITY,
    '<p>The old king clings to a throne he can barely rise from. He knows the crown was a fake long before it ' +
      'was stolen — and that the truth could topple him.</p><p>Secretly sympathetic to the party, if they keep his secret.</p>',
    ['royalty', 'quest-giver'],
  ),
  npc(
    NPC_ROGUE,
    'Sable',
    'Information broker',
    'Half-elf',
    'neutral',
    LOC_TAVERN,
    '<p>Runs the city’s whisper-network out of a corner booth at the Gilded Stag. Sells secrets, never loyalty.</p>',
    ['contact', 'thieves-guild'],
  ),
  npc(
    NPC_VILLAIN,
    'Lord Mordrek',
    'The usurper',
    'Human',
    'hostile',
    null,
    '<p>A silver-tongued noble assembling a private army in the hills. He holds the <em>true</em> crown and ' +
      'means to be seen taking it.</p>',
    ['villain', 'faction-leader'],
  ),
  npc(
    NPC_INNKEEP,
    'Bram Tolliver',
    'Innkeeper',
    'Dwarf',
    'friendly',
    LOC_TAVERN,
    '<p>Pours a stiff ale and hears everything. Lost a son to Mordrek’s levies and holds a grudge.</p>',
    ['ally'],
  ),
]

function loc(
  id: string,
  name: string,
  type: Location['type'],
  parentLocationId: string | null,
  rulerNpcId: string | null,
  description: string,
  tags: string[],
  extra: Partial<Location> = {},
): Location {
  return {
    id,
    campaignId: CID,
    name,
    type,
    imageId: null,
    description,
    parentLocationId,
    tags,
    governmentType: '',
    rulerNpcId,
    currency: '',
    religion: '',
    departments: '',
    population: '',
    prosperity: '',
    imports: '',
    exports: '',
    pointsOfInterest: '',
    allyIds: [],
    enemyIds: [],
    createdAt: T,
    updatedAt: T,
    ...extra,
  }
}

const locations: Location[] = [
  loc(
    LOC_CITY,
    'Caldemar',
    'city',
    null,
    NPC_KING,
    '<p>The capital — tiered white stone climbing to the royal keep. Tense since the crown vanished; the City Watch ' +
      'stops strangers at every gate.</p>',
    ['capital'],
    { governmentType: 'Monarchy', currency: 'Royal crowns (gp)', population: '~40,000', prosperity: 'Wealthy but anxious' },
  ),
  loc(
    LOC_TAVERN,
    'The Gilded Stag',
    'landmark',
    LOC_CITY,
    null,
    '<p>A smoky two-story tavern in Caldemar’s merchant quarter. The party’s home base — and Sable’s office.</p>',
    ['tavern', 'safe-house'],
    { pointsOfInterest: 'The corner booth (Sable); the cellar (smuggling tunnel)' },
  ),
  loc(
    LOC_RUIN,
    'The Sunken Vault',
    'dungeon',
    null,
    null,
    '<p>A flooded pre-kingdom vault beneath the hills, where the first crowns were forged. Something still guards it.</p>',
    ['dungeon'],
  ),
  loc(
    LOC_FOREST,
    'The Thornwood',
    'region',
    null,
    null,
    '<p>Dense woodland between Caldemar and the hills. Mordrek’s levies drill in its clearings.</p>',
    ['wilderness'],
  ),
]

function session(id: string, title: string, date: string, notes: string, tags: string[]): Session {
  return { id, campaignId: CID, title, date, notes, dmNotes: '', tags, createdAt: T, updatedAt: T }
}

const sessions: Session[] = [
  session(
    'demo-session-1',
    'Session 1 — The Empty Vault',
    '2026-01-10',
    '<h3>Recap</h3><p>The party was hired to guard a royal procession and watched the crown vanish in plain sight.</p>' +
      '<h3>Scenes &amp; Beats</h3><ul><li>Chaos at the procession; a rooftop figure in grey.</li>' +
      '<li>First meeting with Sable at the Gilded Stag.</li></ul>' +
      '<h3>Hooks</h3><ul><li>Who was the rooftop thief?</li><li>Why did the king look <em>relieved</em>?</li></ul>',
    ['prep'],
  ),
  session(
    'demo-session-2',
    'Session 2 — Whispers in the Stag',
    '2026-01-24',
    '<h3>Recap</h3><p>Sable traded a name — Lord Mordrek — for a favor the party will come to regret.</p>' +
      '<h3>Scenes &amp; Beats</h3><ul><li>Bram’s grudge and the cellar tunnel.</li>' +
      '<li>An ambush by Mordrek’s agents in the merchant quarter.</li></ul>',
    [],
  ),
  session(
    'demo-session-3',
    'Session 3 — The Sunken Vault',
    '2026-02-07',
    '<h3>Recap</h3><p>Down into the flooded vault, where the crowns were first forged — and first faked.</p>' +
      '<h3>Encounters</h3><ul><li>The drowned guardian.</li></ul>' +
      '<h3>Loot &amp; Rewards</h3><ul><li>The Tidecaller’s Signet.</li></ul>',
    [],
  ),
]

function item(
  id: string,
  name: string,
  rarity: Item['rarity'],
  category: string,
  attunement: boolean,
  description: string,
  tags: string[],
): Item {
  return {
    id,
    campaignId: CID,
    name,
    rarity,
    category,
    imageId: null,
    description,
    attunement,
    value: '',
    tags,
    createdAt: T,
    updatedAt: T,
  }
}

const items: Item[] = [
  item(
    'demo-item-signet',
    "The Tidecaller's Signet",
    'rare',
    'Wondrous item',
    true,
    '<p>A ring of black pearl recovered from the Sunken Vault. Lets the wearer part shallow water and breathe beneath it.</p>',
    ['magic', 'quest'],
  ),
  item(
    'demo-item-crown',
    'The False Crown',
    'uncommon',
    'Wondrous item',
    false,
    '<p>The decoy taken from the procession — fine work, but the gems are glass. Its very existence is a scandal.</p>',
    ['plot'],
  ),
  item(
    'demo-item-blade',
    "Watchman's Blade",
    'common',
    'Weapon (longsword)',
    false,
    '<p>Standard City Watch issue. Nothing magical — but a Watch blade opens doors a drawn weapon would close.</p>',
    [],
  ),
]

const notes: Note[] = [
  {
    id: 'demo-note-factions',
    campaignId: CID,
    title: 'Factions at a glance',
    body:
      '<ul><li><strong>The Crown</strong> — King Aldric, failing, secretly glad the fake is gone.</li>' +
      '<li><strong>Mordrek’s levies</strong> — a private army in the Thornwood.</li>' +
      '<li><strong>The Whisper-network</strong> — Sable’s, loyal to coin.</li></ul>',
    tags: ['reference'],
    createdAt: T,
    updatedAt: T,
  },
  {
    id: 'demo-note-truth',
    campaignId: CID,
    title: 'The secret of the crowns',
    body:
      '<p>The real crown was swapped for a fake generations ago. The original sits in the Sunken Vault; whoever ' +
      'produces it can claim the throne is a fraud — or claim it for themselves.</p>',
    tags: ['secret'],
    createdAt: T,
    updatedAt: T,
  },
]

const rollTables: RollTable[] = [
  {
    id: 'demo-table-rumors',
    campaignId: CID,
    name: 'Caldemar street rumors (d6)',
    category: '',
    description: '',
    entries: [
      { id: 'r1', weight: 1, text: 'The king hasn’t been seen at a window in a month.' },
      { id: 'r2', weight: 1, text: 'A grey-cloaked thief can walk through walls, they say.' },
      { id: 'r3', weight: 1, text: 'Lord Mordrek pays double for Thornwood timber — or for silence.' },
      { id: 'r4', weight: 1, text: 'The Gilded Stag’s cellar floods at the same hour as the harbor.' },
      { id: 'r5', weight: 1, text: 'A Watch sergeant took a bribe and then took his own name off the roster.' },
      { id: 'r6', weight: 1, text: 'The real crown was never real. (Whoever says this disappears.)' },
    ],
    tags: [],
    createdAt: T,
    updatedAt: T,
  },
]

const plotThreads: PlotThread[] = [
  {
    id: THREAD,
    campaignId: CID,
    name: 'Who holds the true crown?',
    status: 'open',
    color: '#db2777',
    description: 'The race for the original crown between the party, Mordrek, and the Crown itself.',
    createdAt: T,
    updatedAt: T,
  },
]

function event(id: string, title: string, dateLabel: string, sortKey: number, body: string): TimelineEvent {
  return {
    id,
    campaignId: CID,
    title,
    dateLabel,
    sortKey,
    body,
    threadId: THREAD,
    refs: [],
    createdAt: T,
    updatedAt: T,
  } as TimelineEvent
}

const timelineEvents: TimelineEvent[] = [
  event('demo-ev-1', 'The crown vanishes', '1st of Deepwinter', 1, 'Stolen in plain sight during the royal procession.'),
  event('demo-ev-2', 'Mordrek surfaces', '3rd of Deepwinter', 2, 'Sable names the usurper gathering men in the Thornwood.'),
  event('demo-ev-3', 'Into the Sunken Vault', '5th of Deepwinter', 3, 'The party learns the crowns were faked from the start.'),
]

// Embedded images (T-34). Small stylized WebP data URLs (see demoSeedImages.ts),
// so the world map, handouts, and gallery have real content without the demo
// touching Storage. The world-map background is referenced by the WorldMap below.
const IMG_WORLDMAP = 'demo-img-worldmap'

function image(
  id: string,
  name: string,
  img: { dataUrl: string; width: number; height: number; bytes: number },
  extra: Partial<StoredImage> = {},
): StoredImage {
  return {
    id,
    campaignId: CID,
    name,
    mime: 'image/webp',
    dataUrl: img.dataUrl,
    width: img.width,
    height: img.height,
    bytes: img.bytes,
    createdAt: T,
    updatedAt: T,
    ...extra,
  }
}

const images: StoredImage[] = [
  image(IMG_WORLDMAP, 'realm-of-caldemar.webp', DEMO_IMG_WORLDMAP),
  image('demo-img-decree', 'royal-proclamation.webp', DEMO_IMG_DECREE, {
    isHandout: true,
    caption: 'Royal proclamation — posted in Caldemar’s square.',
  }),
  image('demo-img-wanted', 'wanted-mordrek.webp', DEMO_IMG_WANTED, {
    isHandout: true,
    caption: 'Wanted poster — Lord Mordrek, “The Usurper.”',
  }),
  image('demo-img-sigil', 'hollow-crown-sigil.webp', DEMO_IMG_SIGIL, {
    inGallery: true,
    caption: 'The royal sigil — the Hollow Crown.',
  }),
]

// Battle map (T-34): a blank-grid skirmish at the Gilded Stag. Tokens link to the
// demo NPCs (npcId) so clicking one opens its sheet; no map image needed.
function tok(id: string, label: string, color: string, col: number, row: number, extra: Partial<SceneToken> = {}): SceneToken {
  return { id, label, color, col, row, size: 1, ...extra }
}

const scenes: Scene[] = [
  {
    id: 'demo-scene-stag',
    campaignId: CID,
    name: 'The Gilded Stag — Brawl',
    imageId: null,
    width: 770,
    height: 560,
    grid: { cellPx: 70, offsetX: 0, offsetY: 0, show: true, color: '#3a2f1f' },
    tokens: [
      tok('demo-tok-bram', 'Bram', '#16a34a', 1, 1, { npcId: NPC_INNKEEP, friendly: true }),
      tok('demo-tok-sable', 'Sable', '#3b82f6', 9, 1, { npcId: NPC_ROGUE }),
      tok('demo-tok-vara', 'Vara', '#14b8a6', 3, 5),
      tok('demo-tok-pip', 'Pip', '#eab308', 4, 6),
      tok('demo-tok-mordrek', 'Mordrek', '#dc2626', 9, 6, { npcId: NPC_VILLAIN }),
      tok('demo-tok-thug1', 'Thug', '#b91c1c', 7, 5),
      tok('demo-tok-thug2', 'Thug', '#b91c1c', 8, 6),
      tok('demo-tok-crate', 'Crate', '#92400e', 5, 3, { icon: '📦', shape: 'square' }),
    ],
    createdAt: T,
    updatedAt: T,
  },
]

// World map (T-34): the stylized realm background with pins linked to the demo's
// locations and the villain. Pin x/y are fractions of the image (0–1).
const worldMaps: WorldMap[] = [
  {
    id: 'demo-worldmap',
    campaignId: CID,
    name: 'The Realm of Caldemar',
    imageId: IMG_WORLDMAP,
    width: DEMO_IMG_WORLDMAP.width,
    height: DEMO_IMG_WORLDMAP.height,
    pins: [
      { id: 'demo-pin-city', x: 0.285, y: 0.42, label: 'Caldemar', color: '#eab308', ref: { kind: 'location', id: LOC_CITY } },
      { id: 'demo-pin-stag', x: 0.31, y: 0.49, label: 'The Gilded Stag', color: '#a16207', ref: { kind: 'location', id: LOC_TAVERN } },
      { id: 'demo-pin-forest', x: 0.58, y: 0.69, label: 'The Thornwood', color: '#16a34a', ref: { kind: 'location', id: LOC_FOREST } },
      { id: 'demo-pin-vault', x: 0.875, y: 0.54, label: 'The Sunken Vault', color: '#475569', ref: { kind: 'location', id: LOC_RUIN } },
      { id: 'demo-pin-mordrek', x: 0.82, y: 0.40, label: 'Mordrek’s camp', color: '#dc2626', ref: { kind: 'npc', id: NPC_VILLAIN } },
    ],
    createdAt: T,
    updatedAt: T,
  },
]

export const DEMO_SNAPSHOT: DatabaseSnapshot = {
  version: 8,
  exportedAt: T,
  campaigns: [campaign],
  sessions,
  locations,
  npcs,
  items,
  notes,
  playerNotes: [],
  rollTables,
  images,
  links: [],
  encounters: [],
  scenes,
  worldMaps,
  plotThreads,
  timelineEvents,
  genTables: [],
  templates: [],
}
