// Default token icons (T-64). A keyword map over an NPC's name, role, race and
// creature type picks one of the bundled game-icons.net glyphs (CC BY 3.0, see
// the Credits page). The glyph path data lives in a lazy JSON chunk
// (src/data/tokenIconPaths.json); everything here is cheap and synchronous.
import { useEffect, useState } from 'react'
import { TOKEN_ICON_CATALOG } from './tokenIconCatalog'

export { TOKEN_ICON_CATALOG }

export interface TokenIconGlyph {
  /** Author folder the icon came from (for the Credits page). */
  a: string
  /** SVG path data on a 512×512 viewBox (glyph only, no background square). */
  d: string
}

/** Authors whose icons are bundled, with their sites. Keep in step with the
 *  AUTHORS list in scripts/build-token-icons.mjs. */
export const TOKEN_ICON_AUTHORS: ReadonlyArray<{ name: string; url: string }> = [
  { name: 'Lorc', url: 'http://lorcblog.blogspot.com' },
  { name: 'Delapouite', url: 'http://delapouite.com' },
]

const LABELS = new Map(TOKEN_ICON_CATALOG.map(([id, label]) => [id, label]))
export function isTokenIcon(id: string | null | undefined): id is string {
  return !!id && LABELS.has(id)
}
export function tokenIconLabel(id: string): string {
  return LABELS.get(id) ?? id
}

// Ordered rules, first match wins. A word ending in `*` is a prefix match.
// Tiers: specific creatures → roles/classes → races → generic creature types.
type Rule = readonly [icon: string, words: readonly string[]]
export const TOKEN_ICON_RULES: ReadonlyArray<Rule> = [
  // Specific creatures
  ['goblin-head', ['goblin*', 'hobgoblin', 'kobold']],
  ['orc-head', ['orc', 'orog', 'half-orc', 'half orc', 'uruk']],
  ['ogre', ['ogre', 'oni']],
  ['croc-jaws', ['crocodile', 'alligator']],
  ['cyclops', ['cyclops']],
  ['minotaur', ['minotaur']],
  ['lizardman', ['lizardfolk', 'lizardman', 'lizard folk', 'dragonborn', 'kenku']],
  ['golem-head', ['golem', 'animated armor', 'construct', 'homunculus']],
  ['gargoyle', ['gargoyle']],
  ['imp', ['imp', 'quasit', 'tiefling']],
  ['devil-mask', ['devil', 'fiend', 'succubus', 'incubus', 'hellhound']],
  ['horned-skull', ['demon', 'balor', 'marilith', 'vrock']],
  ['centaur', ['centaur']],
  ['mermaid', ['merfolk', 'mermaid', 'merman', 'sahuagin', 'triton']],
  ['fairy', ['fairy', 'pixie', 'sprite', 'dryad', 'satyr', 'fey', 'eladrin']],
  ['wyvern', ['wyvern', 'drake']],
  ['dragon-head', ['dragon*', 'wyrm', 'dracolich']],
  ['hydra', ['hydra']],
  ['werewolf', ['werewolf', 'lycanthrope', 'wererat', 'werebear', 'weretiger']],
  ['vampire-dracula', ['vampire', 'strahd']],
  ['unicorn', ['unicorn', 'pegasus']],
  ['shambling-zombie', ['zombie', 'ghoul', 'ghast', 'wight']],
  ['skeleton-inside', ['skelet*']],
  ['ghost', ['ghost', 'specter', 'spectre', 'wraith', 'banshee', 'poltergeist', 'shadow']],
  ['mummy-head', ['mummy']],
  ['crowned-skull', ['lich']],
  ['skull-staff', ['necromancer', 'death knight']],
  ['slime', ['ooze', 'slime', 'jelly', 'pudding', 'blob']],
  ['shambling-mound', ['shambling mound', 'treant', 'ent', 'blight', 'myconid']],
  ['mushroom', ['mushroom', 'fungus', 'fungi']],
  ['fire-silhouette', ['fire elemental', 'salamander', 'azer', 'efreeti', 'magmin', 'flame*']],
  ['ice-bolt', ['ice', 'frost*', 'yeti', 'winter wolf']],
  ['kraken-tentacle', ['kraken', 'roper']],
  ['giant-squid', ['squid']],
  ['octopus', ['octopus']],
  ['angry-eyes', ['beholder', 'gazer', 'evil eye', 'death tyrant']],
  ['tentacles-skull', ['mind flayer', 'illithid', 'aboleth', 'cthulhu', 'intellect devourer']],
  ['fish-monster', ['fish', 'shark', 'piranha', 'bullywug']],
  ['wolf-head', ['wolf', 'wolves', 'worg', 'jackal', 'hyena', 'dog', 'hound', 'mastiff']],
  ['bear-head', ['bear', 'owlbear']],
  ['lion', ['lion', 'tiger', 'panther', 'leopard', 'sphinx', 'manticore']],
  ['boar-tusks', ['boar', 'pig', 'hog']],
  ['spider-web', ['spider', 'drider']],
  ['bat', ['bat']],
  ['snake', ['snake', 'serpent', 'naga', 'viper', 'yuan ti', 'yuan-ti', 'basilisk']],
  ['scorpion', ['scorpion']],
  ['rat', ['rat', 'mouse', 'swarm of rat', 'rodent']],
  ['raven', ['raven', 'crow', 'vulture']],
  ['owl', ['owl']],
  ['eagle-head', ['eagle', 'hawk', 'falcon', 'griffon', 'griffin', 'roc', 'aarakocra']],
  ['horse-head', ['horse', 'steed', 'warhorse', 'pony', 'mule', 'donkey', 'nightmare']],
  ['cow', ['cow', 'ox', 'bull', 'cattle', 'yak']],
  ['sheep', ['sheep', 'goat', 'ram']],
  ['chicken', ['chicken', 'rooster', 'hen', 'duck', 'goose']],
  ['cat', ['cat', 'kitten', 'lynx']],
  ['monkey', ['monkey', 'ape', 'baboon', 'gorilla']],
  ['turtle', ['turtle', 'tortoise']],
  ['frog', ['frog', 'toad']],
  ['bee', ['bee', 'wasp', 'hornet']],
  ['ant', ['ant', 'giant ant']],
  ['beetle-shell', ['beetle', 'crab']],
  ['insect-jaws', ['insect', 'centipede', 'mantis', 'swarm']],
  ['elephant', ['elephant', 'mammoth', 'mastodon']],
  ['rabbit-head', ['rabbit', 'hare']],
  ['lizard-tongue', ['lizard', 'gecko', 'chameleon', 'dinosaur', 'raptor']],
  // Roles and classes
  ['crowned-skull', ['skull lord']],
  ['crown', ['noble', 'lord', 'lady', 'baron', 'duke', 'duchess', 'count', 'countess', 'prince', 'princess', 'regent']],
  ['king', ['king', 'monarch', 'sovereign']],
  ['queen-crown', ['queen', 'empress']],
  ['imperial-crown', ['emperor']],
  ['beer-stein', ['innkeeper', 'barkeep*', 'bartender', 'tavern*', 'publican', 'brewer', 'barmaid']],
  ['coins', ['merchant', 'shopkeeper', 'trader', 'vendor', 'banker', 'peddler', 'broker']],
  ['anvil', ['blacksmith', 'smith', 'armorer', 'weaponsmith', 'forgemaster']],
  ['wheat', ['farmer', 'peasant', 'villager', 'commoner', 'shepherd']],
  ['fishing-pole', ['fisher', 'fisherman', 'angler']],
  ['bread', ['baker', 'miller']],
  ['spell-book', ['scholar', 'sage', 'librarian', 'historian', 'professor', 'tutor', 'archivist']],
  ['quill-ink', ['scribe', 'clerk', 'notary', 'bureaucrat', 'secretary']],
  ['lyre', ['bard', 'minstrel', 'musician', 'singer', 'troubadour', 'performer']],
  ['drum', ['drummer']],
  ['jester-hat', ['jester', 'fool', 'clown', 'entertainer']],
  ['stethoscope', ['healer', 'doctor', 'physician', 'surgeon', 'apothecary', 'herbalist']],
  ['pirate-captain', ['pirate', 'privateer', 'buccaneer', 'corsair']],
  ['pirate-hat', ['sailor', 'captain', 'deckhand', 'ferryman', 'smuggler']],
  ['dig-dug', ['miner', 'digger', 'quarryman']],
  ['hunter-eyes', ['hunter', 'trapper', 'tracker', 'scout']],
  ['chef-toque', ['cook', 'chef', 'butcher', 'innkeeper’s cook']],
  ['spy', ['spy', 'informant', 'infiltrator']],
  ['prisoner', ['prisoner', 'captive', 'slave', 'inmate', 'convict']],
  ['executioner-hood', ['executioner', 'torturer', 'inquisitor']],
  ['bandit', ['bandit', 'brigand', 'highwayman', 'outlaw', 'raider', 'thug']],
  ['assassin-pocket', ['assassin', 'cutthroat']],
  ['ninja-mask', ['ninja', 'shinobi']],
  ['rogue', ['rogue', 'thief', 'burglar', 'pickpocket', 'cutpurse', 'swashbuckler', 'scoundrel']],
  ['crested-helmet', ['fighter', 'gladiator', 'champion', 'warrior', 'mercenary', 'soldier', 'legionnaire']],
  ['visored-helm', ['knight', 'cavalier', 'paladin', 'templar', 'commander', 'captain of the guard']],
  ['static-guard', ['guard', 'watchman', 'sentry', 'sentinel', 'warden', 'constable', 'jailer']],
  ['barbarian', ['barbarian', 'berserker', 'tribal', 'savage', 'chieftain']],
  ['horned-helm', ['viking', 'raider chief', 'reaver']],
  ['archer', ['archer', 'bowman', 'sniper', 'crossbowman']],
  ['robin-hood-hat', ['ranger', 'huntsman', 'forester']],
  ['wizard-face', ['wizard', 'mage', 'archmage', 'sorcerer', 'sorceress', 'warlock', 'enchanter', 'illusionist', 'conjurer', 'diviner', 'evoker', 'abjurer', 'transmuter']],
  ['witch-flight', ['witch', 'hag', 'crone', 'sea hag', 'green hag', 'night hag', 'warlock’s patron']],
  ['monk-face', ['monk', 'hermit', 'ascetic', 'friar']],
  ['cowled', ['cultist', 'acolyte', 'fanatic', 'zealot', 'heretic']],
  ['pope-crown', ['cleric', 'bishop', 'priest', 'priestess', 'pontiff', 'high priest', 'prelate', 'abbot', 'chaplain']],
  ['holy-grail', ['pastor', 'preacher', 'deacon']],
  ['angel-wings', ['angel', 'celestial', 'archon', 'deva', 'planetar', 'solar', 'seraph*']],
  ['skull-crossed-bones', ['undead']],
  ['warlock-hood', ['druid', 'shaman', 'oracle', 'seer', 'mystic', 'diviner']],
  // Races
  ['elf-ear', ['elf', 'elves', 'elven', 'half-elf', 'half elf', 'drow', 'high elf', 'wood elf', 'shadar-kai']],
  ['dwarf-face', ['dwarf', 'dwarves', 'dwarven', 'duergar']],
  ['beard', ['gnome', 'svirfneblin', 'halfling', 'hobbit']],
  // Generic creature types (Open5e / stat-block "creature type")
  ['tentacles-skull', ['aberration']],
  ['claw-slashes', ['beast', 'animal']],
  ['dragon-head', ['dragon']],
  ['fire-silhouette', ['elemental', 'genie']],
  ['fanged-skull', ['monstrosity', 'monster']],
  ['slime', ['ooze']],
  ['mushroom', ['plant']],
  ['giant', ['giant', 'titan', 'jotun']],
  ['spiked-halo', ['aasimar']],
]

function stem(w: string): string {
  return w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w
}
function normalize(text: string): string {
  const words = text.toLowerCase().replace(/[’']/g, '').split(/[^a-z-]+/).filter(Boolean)
  return ' ' + words.map(stem).join(' ') + ' '
}
function matches(haystack: string, word: string): boolean {
  if (word.endsWith('*')) return haystack.includes(' ' + stem(word.slice(0, -1)))
  return haystack.includes(' ' + word.split(' ').map(stem).join(' ') + ' ')
}

export interface TokenIconSource {
  name?: string | null
  role?: string | null
  race?: string | null
  /** Stat-block creature type, e.g. "Humanoid (Wizard)" or an Open5e type. */
  creatureType?: string | null
}

/** Pick a default icon id from keywords, or null when nothing matches (the
 *  token then keeps its initials). The name is searched first so "Goblin
 *  Shaman" beats a wizard-ish role; then role, race and creature type. */
export function pickTokenIcon(src: TokenIconSource): string | null {
  const fields = [src.name, src.role, src.race, src.creatureType].map((f) => normalize(f ?? ''))
  // Searching field by field keeps an explicit name like "Wolf" ahead of a
  // generic creature type like "Beast".
  for (const h of fields) {
    if (h.trim() === '') continue
    for (const [icon, words] of TOKEN_ICON_RULES) {
      if (words.some((w) => matches(h, w))) return icon
    }
  }
  return null
}

/** The icon for an NPC: its saved override, else the keyword pick. */
export function npcTokenIcon(npc: {
  name: string
  role: string
  race: string
  tokenIcon?: string | null
  statBlockData?: { creatureType?: string } | null
}): string | null {
  if (isTokenIcon(npc.tokenIcon)) return npc.tokenIcon
  return pickTokenIcon({ name: npc.name, role: npc.role, race: npc.race, creatureType: npc.statBlockData?.creatureType })
}

let cache: Record<string, TokenIconGlyph> | null = null
let loading: Promise<Record<string, TokenIconGlyph>> | null = null

/** Lazy-load the glyph data (its own chunk, fetched on first use). */
export function loadTokenIconPaths(): Promise<Record<string, TokenIconGlyph>> {
  if (cache) return Promise.resolve(cache)
  loading ??= import('../data/tokenIconPaths.json').then((m) => (cache = m.default as Record<string, TokenIconGlyph>))
  return loading
}

/** Glyph data, or null until the chunk has loaded. */
export function useTokenIconPaths(): Record<string, TokenIconGlyph> | null {
  const [paths, setPaths] = useState(cache)
  useEffect(() => {
    if (paths) return
    let live = true
    loadTokenIconPaths().then((p) => live && setPaths(p)).catch(() => {})
    return () => {
      live = false
    }
  }, [paths])
  return paths
}
