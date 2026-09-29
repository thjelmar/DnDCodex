// The site changelog / "What's New" — a hand-maintained, player-facing list of
// notable changes, newest first. Keep entries in plain language (this is read by
// players, not developers). When you ship something worth mentioning, add an
// entry at the TOP with today's date; the sidebar shows a "new" dot until each
// visitor opens the page (tracked per-browser in localStorage).

export type ChangeKind = 'new' | 'improved' | 'fixed'

export interface ChangelogEntry {
  /** Release date, YYYY-MM-DD. */
  date: string
  /** Short headline for the release. */
  title: string
  changes: { kind: ChangeKind; text: string }[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-09-29',
    title: 'A place to see what’s new',
    changes: [
      { kind: 'new', text: 'This page! A running list of what’s been added and fixed. Find it any time under “What’s New” in the sidebar.' },
    ],
  },
  {
    date: '2026-09-28',
    title: 'Import your character from D&D Beyond',
    changes: [
      { kind: 'new', text: 'Your “My Character” page can now import a public D&D Beyond character by pasting its link — abilities, saves, skills, HP, speed, senses, currency, proficiencies, languages, and inventory all come across.' },
      { kind: 'new', text: 'Attacks, spells, and features & traits import too: weapon attacks show computed to-hit and damage, spells group by level, and class/racial features list with a short description.' },
      { kind: 'new', text: 'Your character’s backstory comes in as well, dropped into the “Backstory & notes” box (only when it’s empty, so it never overwrites what you’ve written).' },
      { kind: 'new', text: 'Prefer building by hand? “My Character” is a full structured sheet with a stat-block view and an edit mode either way.' },
      { kind: 'new', text: 'Run mode: a focused, at-the-table DM screen that pulls together what’s in play, your session notes, combat, and dice on one screen.' },
    ],
  },
  {
    date: '2026-09-25',
    title: 'Shared loot & easier number fields',
    changes: [
      { kind: 'new', text: 'Party loot & gold tracker — the whole table shares one purse and loot list, and everyone sees changes live. Mark who claimed each item.' },
      { kind: 'improved', text: 'Number boxes (HP, initiative, quantities) now have visible up/down arrows and adjust when you scroll over them, like on D&D Beyond.' },
    ],
  },
  {
    date: '2026-09-24',
    title: 'Recaps, combat, and bug reports',
    changes: [
      { kind: 'new', text: '“Story So Far” — a recap timeline on your player home that stitches together the DM’s shared recaps and your own journal entries.' },
      { kind: 'new', text: 'Combat & initiative tracker in the Tools menu — roll initiative, track HP and conditions, and run a saved encounter straight into it.' },
      { kind: 'new', text: 'Report a bug right from the sidebar — it reaches the maintainer and shows up in a triage view, screenshots and all.' },
      { kind: 'new', text: 'Shareable portraits: give NPCs and locations a picture that shows on the card and in the player gallery.' },
    ],
  },
  {
    date: '2026-09-22',
    title: 'Live sharing to players',
    changes: [
      { kind: 'new', text: 'DMs can reveal NPCs, locations, and notes to players, who see them folded into their own sections — with a filter to tell yours from shared, and secrets stay redacted.' },
      { kind: 'new', text: 'A Preferences panel to reset your sharing defaults and prompts.' },
    ],
  },
  {
    date: '2026-09-01',
    title: 'Encounter builder',
    changes: [
      { kind: 'new', text: 'Build encounters with a searchable SRD monster list and 2024 XP-budget difficulty, then save them to a campaign — and later run them into the combat tracker.' },
    ],
  },
]

/** The newest entry's date — used to decide whether to show the "new" dot. */
export const LATEST_CHANGELOG_DATE = CHANGELOG[0]?.date ?? ''
