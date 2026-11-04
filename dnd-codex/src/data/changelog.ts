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
    date: '2026-11-04',
    title: 'Daily Duel: a much bigger cast',
    changes: [
      { kind: 'new', text: 'Daily Duel now has 20 heroes and 40 opponents, from kobold champions and dire wolves to wyverns and fallen knights, so duels stay fresh for months.' },
    ],
  },
  {
    date: '2026-11-04',
    title: 'Daily Duel battle history',
    changes: [
      { kind: 'new', text: 'Daily Duel now keeps a battle history: every duel you finish, with the matchup, the result, and your roll-by-roll grid, plus your wins and win streak. Sign in and your history follows you across your devices.' },
    ],
  },
  {
    date: '2026-11-04',
    title: 'Daily Duel gets harder as the week goes on',
    changes: [
      { kind: 'improved', text: 'Daily Duel now has three difficulties. Early in the week your opponent is easy to beat, and by the weekend it has stronger attacks and more hit points. Each turn it picks one attack from the ones it knows at that difficulty.' },
      { kind: 'improved', text: 'Duels now run turn by turn until one fighter reaches 0 HP, with no draws. Attacks hit when the d20 roll plus the attack bonus meets or beats the target’s Armor Class.' },
    ],
  },
  {
    date: '2026-11-04',
    title: 'Daily Duel',
    changes: [
      { kind: 'new', text: 'Daily Duel is a quick one-on-one fight that’s the same for everyone each day. Pick your attacks, the Codex rolls the dice, and your opponent strikes back. You get one try a day, and it resets at midnight UTC.' },
      { kind: 'new', text: 'When your duel ends, copy your result as a colorful grid, along with a link. A friend who opens the link plays the same duel and sees if they can beat your score.' },
    ],
  },
  {
    date: '2026-11-02',
    title: 'The phone menu gets out of your way',
    changes: [
      { kind: 'fixed', text: 'On a phone, the menu now closes whenever you tap a link in it, including a link to the page you’re already on, so it no longer covers the page.' },
    ],
  },
  {
    date: '2026-11-02',
    title: 'Easier sign-in on phones',
    changes: [
      { kind: 'improved', text: 'On a phone, a Sign in button now sits in the top bar whenever you’re signed out, so you no longer have to open the menu to find it.' },
      { kind: 'fixed', text: 'The Sign in window no longer gets cut off at the edge of the phone menu, and the menu now scrolls only up and down instead of drifting sideways.' },
      { kind: 'fixed', text: 'If signing in took too long to check your account, the Sign in option could stay hidden. It now always appears.' },
    ],
  },
  {
    date: '2026-11-02',
    title: 'Smoother pop-ups',
    changes: [
      { kind: 'improved', text: 'Pop-up windows and side panels now slide and fade in and out instead of appearing all at once. If you prefer less motion, your system’s reduced-motion setting turns the movement off.' },
    ],
  },
  {
    date: '2026-11-02',
    title: 'Invite links no longer trap you',
    changes: [
      { kind: 'fixed', text: 'Pressing Cancel on a campaign invite now takes you back home instead of reopening the invite, and you can browse other pages without being sent back to it.' },
    ],
  },
  {
    date: '2026-10-27',
    title: 'Voice, right in your session',
    changes: [
      { kind: 'new', text: 'Link your campaign’s Discord voice channel, then jump into voice with one click from the session page.' },
      { kind: 'new', text: 'During a game, see a live roster of who’s in voice — with a glow around whoever’s talking and muted/deafened badges — in both Run mode and the player view. If you record with Craig, a Recording badge appears automatically.' },
    ],
  },
  {
    date: '2026-10-26',
    title: 'Group your NPCs — and a clearer map',
    changes: [
      { kind: 'new', text: 'Families: group NPCs into families, give each a color, and watch them cluster together (and share that color) on the Thought Map.' },
      { kind: 'new', text: 'Race groups: organize your world’s races under Codex → Races. An NPC’s race is now a pick-or-type box that suggests your groups’ races, and a world-map pin can point at a race group.' },
      { kind: 'improved', text: 'When two people or places have several connections, the Thought Map now fans them out into separate labeled arcs instead of stacking them into one line.' },
    ],
  },
  {
    date: '2026-10-26',
    title: 'Invite players with a link',
    changes: [
      { kind: 'new', text: 'Share a campaign with a single invite link — players open it, sign in, and confirm to join. No more reading out a code.' },
      { kind: 'new', text: 'See who has joined your campaign, and when, right from the invite panel.' },
      { kind: 'improved', text: 'Set your display name in Preferences — it’s how you show up to the rest of your group.' },
      { kind: 'fixed', text: 'Safari: fixed a “Something went wrong” that could appear right after an update, plus a couple of collapsed-sidebar and scrolling glitches.' },
    ],
  },
  {
    date: '2026-10-23',
    title: 'Monsters, colors & backlinks',
    changes: [
      { kind: 'new', text: 'Monster stat blocks: search the SRD and all of Open5e and import a full stat block in a click, add a spellcasting section, and keep DM-only reference links — or paste one in from elsewhere.' },
      { kind: 'new', text: 'Pick any accent color you like, not just the presets, under Preferences → Appearance.' },
      { kind: 'new', text: '“Linked from”: every NPC, location, item, note and session now shows everywhere it’s mentioned, so you can hop straight to what references it.' },
    ],
  },
  {
    date: '2026-10-15',
    title: 'More room to run the table',
    changes: [
      { kind: 'improved', text: 'Collapse the sidebar for a wider workspace — hover the left edge to peek, click to bring it back. Your choice is remembered.' },
      { kind: 'new', text: 'Battle-map tokens can show condition art: a character’s most important condition appears as cover art on the token instead of just a pip.' },
      { kind: 'new', text: 'Reusable templates for NPCs, locations and sessions, so you can start a new one from a ready-made starting point.' },
    ],
  },
  {
    date: '2026-10-13',
    title: 'Take it for a spin',
    changes: [
      { kind: 'new', text: 'Try the live demo from the home page — explore a fully built example campaign (world, maps, battle map and handouts) without signing up. Nothing you do in the demo touches real data.' },
      { kind: 'improved', text: 'Your generators and templates now follow your account across devices.' },
    ],
  },
  {
    date: '2026-10-12',
    title: 'Codex on your phone',
    changes: [
      { kind: 'improved', text: 'D&D Codex now works on phones and tablets. The sidebar tucks away behind a menu button in the top bar, and pages reflow to fit a small screen — campaign lists, notes and editors show one at a time with a “back” button instead of being squeezed side by side.' },
      { kind: 'new', text: 'Maps are touch-friendly: pinch to zoom on the world map and battle map, drag to pan, and move pins and tokens with a finger. There are also +/- and “Fit” buttons if you’d rather tap.' },
    ],
  },
  {
    date: '2026-10-12',
    title: 'A proper home page',
    changes: [
      { kind: 'new', text: 'A new home page greets you when you open D&D Codex — your campaigns at a glance (with their next session and a few quick stats), your soonest game with its date, and quick links to your tools. New here? You get a friendly welcome that shows off everything the app can do.' },
      { kind: 'improved', text: 'The sidebar is tidier: your campaigns now tuck into collapsible lists, with a Home button up top to get back to the overview anytime.' },
    ],
  },
  {
    date: '2026-10-09',
    title: 'Make it yours — and never miss a session',
    changes: [
      { kind: 'new', text: 'Themes: pick a Light or Dark look and an accent color under Preferences → Appearance. Your choice follows you across devices.' },
      { kind: 'new', text: 'Session reminders: get a nudge before a game — in the app and by email — a day before, an hour before, or right at start time. Choose which ones (and how) in Preferences.' },
    ],
  },
  {
    date: '2026-10-08',
    title: 'Scheduling, RSVPs & reminders',
    changes: [
      { kind: 'new', text: 'Session scheduling — DMs set the next session date and time; everyone sees a live “next session” indicator and can RSVP Going, Maybe, or Can’t.' },
      { kind: 'new', text: 'Add the campaign’s sessions to your own calendar (Google / Apple / Outlook) with a subscribe link that auto-updates when the date changes.' },
      { kind: 'new', text: 'Can’t make the date? Suggest another day right on the calendar, and the DM can float backup days for the group to weigh in on.' },
      { kind: 'new', text: 'A notification bell in the sidebar keeps you posted on session plans and RSVPs.' },
    ],
  },
  {
    date: '2026-09-30',
    title: 'See what’s on the way',
    changes: [
      { kind: 'new', text: 'A new “Roadmap” page in the sidebar shows the fixes and features being worked on, with a progress bar for each one from Planned through to Released.' },
      { kind: 'improved', text: '“Report a bug” is now “Report something”: tell us whether it’s an issue, an enhancement to something that exists, or a brand-new feature.' },
    ],
  },
  {
    date: '2026-09-29',
    title: 'Battle maps',
    changes: [
      { kind: 'new', text: 'DMs get a new “Battle Map” tab: upload a map, line the grid up with it (or use a blank grid), and drag tokens around. Tokens snap to squares, and big creatures take up 2×2 or more.' },
      { kind: 'new', text: 'Drop an NPC onto the map as a token with its portrait, and double-click it to see its stat block.' },
      { kind: 'new', text: 'Battle maps in live sessions: when the DM starts a session they can put a map on the table, and players see it live in their session’s Tabletop. The DM can hand a token to a player to move, and each player picks the color their tokens wear. Ending the session takes the map down.' },
      { kind: 'new', text: 'Run mode can switch its center pane to the battle map, and full screen keeps your session notes beside the map.' },
      { kind: 'new', text: 'Align the grid by boxing a few squares: it snaps to the grid lines drawn on your map so the grid lines up edge to edge. Resize tokens by dragging their corner, and go full screen for more room.' },
    ],
  },
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
