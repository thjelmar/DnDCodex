# Campaign shell and Overview: layout exploration

Design exploration only. No application code changed. Written 2026-11-20 on
branch `claude/reverent-ritchie-d23680` from `main` at `bd0eb73`. Everything
uploaded to Stitch came from the built-in demo campaign ("The Hollow Crown"),
never real campaign data.

## What is wrong today

Measured on the demo at 1440x900 and 375x812 (see `baseline/`).

- **Wasted width.** `.content` caps at 980px, so a wide monitor shows about
  half-empty space beside one long column.
- **Nine sections in one scroll.** Overview stacks cover, next session, links,
  voice, stat tiles, world overview, recent sessions, linked campaigns, and a
  danger zone. The next action isn't visually first.
- **Heavy header.** One row holds the title, rename, **Run session**, push,
  invite, sync, and **All campaigns**. A second row holds the tab bar.
- **Phone chrome.** At 375px, the demo banner, top bar, title block, **Run
  session**, summary, and two tab rows (Overview/Sessions/Timeline, then three
  dropdown chips) sit above the first card. The cover and next-session cards
  push stats below the first screen.
- **Hidden destinations.** 16 pages hide behind hover dropdowns (Codex, Maps,
  Players). Hover menus don't work on touch, and users can't scan what exists.
  Another worktree (T-50) is regrouping into Prep, Run, World, Reference.

## Goals and non-goals (my proposals)

- Goals: put the next action first (Run session, next session, what to prep);
  reach any page in at most two taps; use the full width on desktop; keep the
  phone usable one-handed.
- Constraints: React and Dexie, local-first, no new heavy dependencies, the
  accent derives from `--accent`, light and dark both work.
- Non-goals: a new visual language, new data, or changing Run mode, Daily Duel,
  or the battle map internals.

## Directions

Screenshots and Stitch HTML are in `concepts/`. The desktop views are 1440 wide,
the phone views 390 wide.

### A. Command centre (`concepts/A-command-centre-*`)

Overview becomes a 12-column bento dashboard. A hero "Next session" card with
Start Run mode, a prep checklist, six stat tiles, recent sessions, a
recently-edited feed, and a right column for links and voice. The tab bar
shrinks to one row of grouped chips (Prep, Run, World, Reference). Archive and
delete move behind a "Campaign settings" link.

- Phone: a single stack with horizontally scrolling chips that open a bottom
  sheet, and collapsible Links, Voice, World overview, and Linked campaigns.
- Trade-offs: best use of a wide screen and the strongest "what do I do next"
  answer. It needs two new data features (a prep checklist and a
  recently-edited feed derived from `updatedAt`), and the shell chrome is
  otherwise unchanged, so the phone gains less.

### B. Sidebar-first (`concepts/B-sidebar-first-*`)

The campaign's pages live in the existing left sidebar as a tree grouped Prep,
Run, World, Reference, with count badges. The tab bar disappears. The page header
becomes a breadcrumb plus **Run session**, with a "Jump to anything" bar (a
command palette; `Ctrl+K` search already exists in the sidebar).

- Phone: the existing drawer holds the same tree, so there's one navigation
  model on both sizes.
- Trade-offs: removes hover menus, shows every destination, needs no new data,
  and reuses the drawer, search, and collapse code. The cost: a taller sidebar
  (needs collapsible groups and scroll), and Overview itself changes least, so
  the "next action first" gain is small unless combined with A's cards.

### C. Hub (`concepts/C-hub-*`)

Overview becomes a hub of four large section cards (Prep, Run, World,
Reference) under a cover hero with **Run session**. Each card lists its pages
with counts and one contextual action ("Plan next session", "Start Run mode").

- Phone: stacked section cards plus a fixed bottom tab bar (Overview, Prep, Run,
  World, More).
- Trade-offs: friendliest for new users and the best touch targets, but it
  adds a hub click before every page, duplicates the tab bar's job, and a bottom
  tab bar competes with Run mode's own screen and the drawer.

## Recommendation

**B as the shell, with A's hero and stat row on Overview** (a staged path:
B first, then A's cards).

- B solves the navigation problem on every screen, not only Overview, and it
  fixes phone and desktop together. It reuses components that exist (sidebar,
  collapse, drawer, search), so it fits a small React and Dexie app and the T-50
  grouping maps one to one onto its tree (Prep, Run, World, Reference).
- A's bento Overview is the right content for the wide column, but on its own
  it leaves the hover-menu problem. Adopt it second, in pieces: next-session
  hero and stats first, prep checklist and activity feed only if wanted.
- C is the fallback if user testing shows the tree is too long. It costs the
  most extra clicks.

Suggested order if you proceed: (1) move the T-50 groups into the sidebar tree;
(2) retire the tab bar below 820px first, since the drawer exists; (3) widen the
Overview and add the hero and stat row.

## Stitch

- Project: **D&D Codex layout exploration (demo data only)**, ID
  `2859264352860049331`. Open it from the Stitch home page, or at
  `https://stitch.withgoogle.com/projects/2859264352860049331` (the pattern
  from the Stitch site; I couldn't open it from here).
- Design system: "D&D Codex Spellbook", asset `e28438bf2192421d923b1fc59c076d46`,
  made from `DESIGN.md`.
- Screens:

| Screen | Stitch screen ID |
| --- | --- |
| Baseline Overview (`/campaign/:id`) | `15204709528263156169` |
| Baseline Run mode (`/run/:id`) | `1239215425981327347` |
| Baseline Daily Duel (`/daily`) | `16826604982354180211` |
| A desktop | `afd8dcf8ce454f698c001c229b273ae1` |
| A phone | `434c0dd8f9b34517933b800e5f86e278` |
| B desktop (dark, after one edit) | `58af44d487e042108ed8458684cb41ea` |
| B desktop (first, light, superseded) | `e48f1e39d0a84e3f87799f107bfecf4a` |
| B phone | `1518656c1af34e5a850e0f300ebc800f` |
| C desktop | `9252c5a908c1483d999c661123cff841` |
| C phone | `fd86b2a8864346c0a085482fd453d32b` |
| Duplicate of A desktop (from a retry) | `889bff7dc259420f9d43b11861b46f5e` |

Stitch titles every generated screen "Command Centre" regardless of direction;
use the table above, not the titles.

## Caveats

- **Invented content.** Stitch added features and data that don't exist: an
  RSVP list with names, a "Spell Archive", "Party Roster", "Character Vault",
  "Dice Vault", a "Curse of Strand" breadcrumb, a bottom tab bar on B phone
  (Codex, Spells, Combat, Party, Notes), a cover image, and "Grimoire
  Whisper". Treat the mockups as layout and hierarchy only.
- **Phone checks.** The screenshots in `concepts/` are rendered locally from
  Stitch's HTML at 390px wide (full page), so fixed elements such as A's
  sticky **Run session** bar don't show. I didn't test any touch behavior.
- **Not done.** I skipped `taste-design` (the existing look is deliberate and
  the aim was layout, not a restyle), and I didn't generate Run mode or Daily
  Duel redesigns. Light theme is untested in the concepts.
- **Static HTML capture.** `snapshot.ts` needs Puppeteer and `tsx`, which
  aren't installed. I used the repo's Playwright to capture the same output
  (CSSOM inlined, scripts removed). Files in `baseline/` are that output.
  The skill's strategy checkpoint (owner confirmation) was skipped because the
  owner was unavailable; I took its recommended default.
- Another worktree has uncommitted T-50 work on `CampaignNav.tsx`; this
  exploration didn't touch it.

## Files

- `DESIGN.md`: design language extracted from `styles.css` and the shell.
- `baseline/`: `overview-desktop`, `overview-phone`, `run-desktop`,
  `daily-desktop` (HTML plus PNG; demo data only).
- `concepts/`: six HTML and PNG pairs (A, B, C, desktop and phone).
