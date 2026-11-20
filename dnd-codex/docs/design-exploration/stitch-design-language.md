---
name: D&D Codex Spellbook
colors:
  surface: '#14121a'
  surface-container-low: '#1c1926'
  surface-container: '#262233'
  surface-container-high: '#352f45'
  outline-variant: '#352f45'
  on-surface: '#ece9f1'
  on-surface-variant: '#a49fb5'
  outline: '#726d82'
  primary: '#a78bfa'
  primary-container: '#7c3aed'
  on-primary: '#ffffff'
  error: '#f87171'
  error-container: '#dc2626'
  success: '#4ade80'
  light-surface: '#f6f4fb'
  light-surface-container-low: '#ffffff'
  light-surface-container: '#ecebf4'
  light-on-surface: '#1d1a27'
  light-outline-variant: '#dbd6e8'
typography:
  display:
    fontFamily: Iowan Old Style, Palatino Linotype, Georgia, serif
    fontWeight: '600'
  body:
    fontFamily: system-ui, -apple-system, Segoe UI, Roboto, sans-serif
    fontSize: 15px
    lineHeight: 1.5
rounded:
  sm: 7px
  md: 10px
spacing:
  content-max: 980px
  sidebar: 220px
---

# Design system: D&D Codex

Source: `dnd-codex/src/styles.css` (4,335 lines of plain CSS, no Tailwind, no
CSS-in-JS) plus the shell components `App.tsx`, `CampaignLayout.tsx`,
`CampaignNav.tsx`, and `OverviewPage.tsx`. Extracted on 2026-11-20 from the
`main` checkout at commit `bd0eb73`.

## 1. Visual theme and atmosphere

A dark "spellbook": near-black violet surfaces (`#14121a`), cool purple-tinted
neutrals, and a single bright accent that the player chooses. Headings use a
serif (Iowan Old Style or Palatino or Georgia) so the app reads like a rulebook.
Body text uses the system sans for dense tables and forms. Light mode exists
(`:root[data-theme="light"]`) with the same structure on pale lavender-white
surfaces.

The density is moderate. Cards and list rows have 16px padding, but the
campaign screen stacks many small sections vertically in a single 980px column
(cover, next session, links, voice, stat tiles, world overview, recent sessions,
linked campaigns, danger zone). On a wide monitor, roughly half of the viewport
stays empty.

## 2. Color palette and roles

All colors are CSS custom properties on `:root`. Components never hard-code
hex values for chrome, which is what makes the per-user accent and theme work.

### Primary foundation

| Token | Hex (dark) | Role |
| --- | --- | --- |
| `--bg` | `#14121a` | Page background ("Midnight Ink") |
| `--bg-elev` | `#1c1926` | Sidebar, cards, inputs ("Raised Vellum") |
| `--bg-elev-2` | `#262233` | Buttons, hover rows, active nav ("Dusk Violet") |
| `--border` | `#352f45` | Hairline borders on every surface |

### Accent and interactive

| Token | Hex | Role |
| --- | --- | --- |
| `--accent` | `#a78bfa` | Icons, active nav marker, stat numerals, highlights |
| `--accent-strong` | `#7c3aed` | Primary buttons, active segmented control |
| `--link` | `--accent` (dark), `--accent-strong` (light) | Text links |

The accent is per user. Presets: violet (default), emerald `#34d399`/`#059669`,
sky `#38bdf8`/`#0284c7`, amber `#fbbf24`/`#b45309`, rose `#fb7185`/`#e11d48`.
A custom `#rrggbb` is allowed, and `lib/theme.ts` derives both tokens from it.
Any new layout must derive every highlight from `--accent`, never a fixed hue.

### Typography and text hierarchy

| Token | Hex | Role |
| --- | --- | --- |
| `--text` | `#ece9f1` | Primary text |
| `--text-dim` | `#a49fb5` | Secondary text, inactive nav |
| `--text-faint` | `#726d82` | Captions, empty states, section labels |

### Functional states

`--danger #f87171` (strong `#dc2626`), `--good #4ade80`. Campaigns also carry a
user-chosen `color` shown as a 14px dot beside the name.

## 3. Typography rules

- Headings (h1 to h4): serif, weight 600, line-height 1.2. Campaign title is
  about 26px. Stat numerals are 30px serif in the accent color.
- Body: system sans, 15px, line-height 1.5, antialiased.
- Section labels (`.sidebar-heading`): small, uppercase, faint, letter-spaced.
- Buttons and nav links: weight 500, sentence case.

## 4. Component stylings

### Buttons

`.btn`: 7px radius, 1px `--border`, `--bg-elev-2` fill, 8px by 14px padding,
120ms background and border transition. Variants: `.primary` (accent-strong
fill, white text), `.ghost` (transparent), `.danger`, `.small`.

### Cards

`.card`: 10px radius, 1px border, `--bg-elev` fill, 16px padding. On hover the
border brightens and the card lifts. No resting shadow. Used for campaign
tiles, stat tiles, and many entity grids (`.grid` with `auto-fill, minmax`).

### Navigation

- App sidebar: 220px, `--bg-elev`, collapsible on desktop (edge handle with
  hover peek), off-canvas drawer below 820px behind a 54px top bar. Items
  (`.nav-link`) have an 18px icon, and the active item gets a 3px accent inset
  bar. It holds search, four icon buttons, Home, Daily Duel, DM and Player
  folders (expandable), Tools, and footer links.
- Campaign tab bar (`.subnav`): Overview, Sessions, Timeline, then three
  hover-or-click dropdown groups: Codex (World, NPCs, Families, Races,
  Locations, Items, Tables, Tags), Maps (Map, World Map, Battle Map), Players
  (Gallery, Handouts, Loot). The group label stays highlighted on child pages.
  Another worktree (T-50) is regrouping this into Prep, Run, World, Reference.

### Inputs and forms

`.input`, `.select`: same 7px radius and border, accent focus ring. Fields use
a stacked label.

### Domain-specific components

- Next-session card with schedule status, RSVP, and a Set date action.
- Run mode (`/run/:id`): at-the-table screen with session notes, combat, dice,
  live battle map, and a voice roster. Uses `.run-grid` and a map mode with a
  180px, fluid, 320px three-column grid.
- Daily Duel (`/daily`): a Wordle-style 1v1 with a right column holding the next
  move and a collapsible battle log.
- Battle map and world map pages drop the 980px cap (`.content-wide`).

## 5. Layout principles

- Shell: CSS grid `220px 1fr`, `height: 100%`, all scrolling inside `.main`
  (the document never scrolls; `html, body { overflow: clip }`).
- Content: `.content` is `max-width: 980px`, centered, `28px 32px 80px` padding.
- Breakpoints in use: 820px (drawer shell), 640px and 760px (page tweaks),
  1050 to 1280px (Run grid). Desktop-first CSS with `max-width` overrides.
- Spacing is ad hoc (inline `marginBottom: 20` or `24` is common), roughly a
  4px base.
- Touch: drawer closes on any link tap; targets are 38px or larger in the top
  bar.

## 6. Design system notes for Stitch generation

### Language to use

"Dark fantasy spellbook, midnight violet surfaces, hairline borders, serif
headings over a clean sans, one bright purple accent, calm and dense but not
cramped. No parchment textures, no skeuomorphic frames."

### Color references

Midnight Ink `#14121a`, Raised Vellum `#1c1926`, Dusk Violet `#262233`, Rune
Border `#352f45`, Moon Text `#ece9f1`, Fog Text `#a49fb5`, Arcane Violet
`#a78bfa`, Deep Arcane `#7c3aed`.

### Component prompts

1. "A 220px sidebar on `#1c1926` with serif wordmark, search field, nav links
   with 18px line icons, and a 3px violet bar on the active link."
2. "A stat tile: 10px radius, 1px `#352f45` border, 30px serif violet number over
   a dim label."
3. "A primary button: 7px radius, `#7c3aed` fill, white 500-weight label, 8px by
   14px padding."

### Incremental iteration

Keep the accent as a single variable. Always ask for a phone variant at 375px
with an off-canvas drawer and a 54px top bar. Keep reading width near 980px for
prose pages and full width for maps.
