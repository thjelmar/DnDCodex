// One-click name generators for the quick stuff a DM invents on the fly — an
// NPC who was just a face in the crowd a second ago, a tavern that needs a sign.
// Pure and dependency-free, so any editor can wire a dice button to it. NPC
// names are ancestry-aware: pass the NPC's race and it leans on a matching pool,
// falling back to a broadly "human" set.

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

/** A random given + family name, biased by the NPC's race if it's a known one. */
export function randomPersonName(race?: string): string {
  const r = (race ?? '').toLowerCase().trim()
  const a = r ? ANCESTRIES.find((x) => x.match.test(r)) : undefined
  return `${pick(a?.first ?? HUMAN_FIRST)} ${pick(a?.surnames ?? HUMAN_SUR)}`
}

const TAVERN_ADJ = ['Rusty', 'Prancing', 'Gilded', 'Drowned', 'Laughing', 'Silver', 'Crooked', 'Salty', 'Weary', 'Wild', 'Sleeping', 'Broken', 'Golden', 'Hungry']
const TAVERN_NOUN = ['Tankard', 'Pony', 'Griffon', 'Lantern', 'Anchor', 'Hart', 'Crown', 'Barrel', 'Dragon', 'Rose', 'Boar', 'Kettle', 'Mermaid', 'Whistle']

/** A random tavern/inn name, e.g. "The Rusty Tankard". */
export const randomTavernName = () => `The ${pick(TAVERN_ADJ)} ${pick(TAVERN_NOUN)}`
