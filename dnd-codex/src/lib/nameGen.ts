// One-click name generators for the quick stuff a DM invents on the fly — an
// NPC who was just a face in the crowd a second ago, a tavern that needs a sign.
// Pure and dependency-free, so any editor can wire a dice button to it. NPC
// names are ancestry-aware: pass the NPC's race and it leans on a matching pool,
// falling back to a broadly "human" set.

import { pickText, type GenOverrides } from './genTables'

const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]

interface Ancestry {
  /** Matched (case-insensitive substring) against the NPC's race field. */
  match: RegExp
  first: readonly string[]
  surnames: readonly string[]
}

const HUMAN_FIRST = [
  'Mara', 'Edrin', 'Sella', 'Bram', 'Yorick', 'Nessa', 'Corin', 'Hale', 'Dara', 'Pell',
  'Rowan', 'Isolde', 'Garret', 'Linnea', 'Tomas', 'Verity', 'Aldous', 'Katla', 'Rennick', 'Ophelia',
]
const HUMAN_SUR = [
  'Holt', 'Vance', 'Mercer', 'Thorne', 'Ashby', 'Crane', 'Harlow', 'Quill', 'Dunmore', 'Bevan',
  'Oswin', 'Faring', 'Marsh', 'Calder', 'Winters', 'Rook', 'Sedge', 'Larch',
]

const ANCESTRIES: Ancestry[] = [
  {
    match: /elf|eladrin|drow/,
    first: ['Aelar', 'Thia', 'Caelynn', 'Faelar', 'Sariel', 'Mirelle', 'Ivellios', 'Naivara', 'Rolen', 'Lia'],
    surnames: ['Moonwhisper', 'Starfall', 'Nightbreeze', 'Siannodel', 'Amakiir', 'Galanodel', 'Holimion', 'Liadon'],
  },
  {
    match: /dwarf|dwarv/,
    first: ['Balin', 'Dwalin', 'Nori', 'Thrain', 'Hilda', 'Vistra', 'Brottor', 'Gurdis', 'Orsik', 'Torgga'],
    surnames: ['Ironfist', 'Stonebeard', 'Deepdelver', 'Battlehammer', 'Fireforge', 'Rumnaheim', 'Holderhek'],
  },
  {
    match: /halfling|hobbit/,
    first: ['Milo', 'Poppy', 'Rosie', 'Lyle', 'Pip', 'Marigold', 'Osborn', 'Bree', 'Cade', 'Nedda'],
    surnames: ['Underbough', 'Greenbottle', 'Tealeaf', 'Goodbarrel', 'Thorngage', 'Highhill', 'Brushgather'],
  },
  {
    match: /orc|goblin|half-orc/,
    first: ['Grosh', 'Mazga', 'Thokk', 'Ravok', 'Shump', 'Yevelda', 'Karg', 'Ownka', 'Dench', 'Baggi'],
    surnames: ['Skullsplitter', 'the Red', 'Ironjaw', 'Bonegrinder', 'the Scarred', 'Gutripper'],
  },
  {
    match: /tiefling|infernal/,
    first: ['Akmenos', 'Damaia', 'Kallista', 'Mordai', 'Nemeia', 'Leucis', 'Rieta', 'Therai', 'Barakas', 'Ea'],
    surnames: ['the Hollow', 'Nightseeker', 'Ashveil', 'of the Last Ember', 'Sorrow', 'the Unbound'],
  },
]

/** A random given + family name, biased by the NPC's race if it's a known one.
 *  A per-world `npc-name` table overrides the default (human) pool; ancestry
 *  pools (elf/dwarf/…) keep their built-in flavor. */
export function randomPersonName(race?: string, ov?: GenOverrides): string {
  const r = (race ?? '').toLowerCase().trim()
  const a = r ? ANCESTRIES.find((x) => x.match.test(r)) : undefined
  if (a) return `${pick(a.first)} ${pick(a.surnames)}`
  const override = ov?.['npc-name']
  if (override?.length) return pickText(override)
  return `${pick(HUMAN_FIRST)} ${pick(HUMAN_SUR)}`
}

const TAVERN_ADJ = ['Rusty', 'Prancing', 'Gilded', 'Drowned', 'Laughing', 'Silver', 'Crooked', 'Salty', 'Weary', 'Wild', 'Sleeping', 'Broken', 'Golden', 'Hungry']
const TAVERN_NOUN = ['Tankard', 'Pony', 'Griffon', 'Lantern', 'Anchor', 'Hart', 'Crown', 'Barrel', 'Dragon', 'Rose', 'Boar', 'Kettle', 'Mermaid', 'Whistle']

/** A random tavern/inn name, e.g. "The Rusty Tankard". A per-world `tavern-name`
 *  table overrides the built-in adjective/noun composition. */
export function randomTavernName(ov?: GenOverrides): string {
  const override = ov?.['tavern-name']
  if (override?.length) return pickText(override)
  return `The ${pick(TAVERN_ADJ)} ${pick(TAVERN_NOUN)}`
}

// Plot hooks are built call-and-response: a patron needs a task done, with a
// twist that complicates it. Each slot is drawn independently so the pieces
// recombine into a fresh, table-ready prompt every click.
const HOOK_PATRON = [
  'A desperate merchant',
  'The captain of the town guard',
  'A hooded stranger at the bar',
  'The local priest',
  'A grieving widow',
  'A nervous innkeeper',
  'A retired adventurer',
  'An orphaned child',
  'The mayor',
  'A rival adventuring party',
  'A tax collector far from home',
  'A scholar with ink-stained hands',
]
const HOOK_TASK = [
  'recover a stolen heirloom',
  'escort a caravan through the pass',
  'clear something out of the old mine',
  'find a person who went missing three days ago',
  'deliver a sealed letter before dawn',
  'investigate the strange lights over the moor',
  'guard a ritual through the night',
  'retrieve a body for a proper burial',
  'break a curse on the harvest',
  'collect a debt from someone who can fight back',
  'map a stretch of road no one returns from',
  'quietly make a problem disappear',
]
const HOOK_TWIST = [
  'but the pay is suspiciously high',
  'and someone else is already looking for it',
  'though the client is lying about why',
  'before a storm closes the roads',
  'but the target is not what it seems',
  'and the deadline is almost up',
  'though the law is already involved',
  'and one of them is a traitor',
  'but no one else will admit it is happening',
  'and failure means the whole town pays',
  'though the last group to try never came back',
  'and the truth is worse than the rumor',
]

/** A ready-to-use plot hook, e.g. "The mayor needs the party to … — but …".
 *  A per-world `plot-hook` table overrides the built-in patron/task/twist mix. */
export function randomPlotHook(ov?: GenOverrides): string {
  const override = ov?.['plot-hook']
  if (override?.length) return pickText(override)
  return `${pick(HOOK_PATRON)} needs the party to ${pick(HOOK_TASK)}, ${pick(HOOK_TWIST)}.`
}

/** A short summary of a hook for a note/card title — the patron and the task,
 *  dropping the twist and trailing punctuation. Falls back to a trimmed hook
 *  if the shape isn't recognized. */
export function plotHookTitle(hook: string): string {
  const [patron, rest] = hook.split(' needs the party to ')
  if (!rest) return hook.replace(/\.$/, '').slice(0, 70)
  const task = rest.split(', ')[0].replace(/\.$/, '').trim()
  return `${patron.trim()} — ${task}`
}
