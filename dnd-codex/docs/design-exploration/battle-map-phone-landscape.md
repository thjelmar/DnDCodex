# Battle map on a phone: landscape full screen (T-96)

Status: proposal for the owner's approval. No application code changed yet.
Mockup: [`round-2/battle-map-phone-landscape.html`](round-2/battle-map-phone-landscape.html)
(open it in a browser and resize, or use the buttons at the top).

## Findings

I ran the demo's battle map (WebKit and Chromium, `isMobile`, `hasTouch`) at
390 by 844, 844 by 390 and 667 by 375, in the page and in full screen, and
measured each element's rectangle. "Map share" is the board's area divided by
the viewport area.

| Size | Mode | Map share | What takes the rest |
| --- | --- | --- | --- |
| 390 × 844 | page | 72% | 40px demo banner, 55px app header, 48px bar, 52px rail |
| 390 × 844 | full screen | **6%** | The 340px session notes panel opens by default and squeezes the map to 26px wide |
| 844 × 390 | page | 25% | App sidebar (220px), banner, bar, rail, 300px docked inspector |
| 844 × 390 | full screen | 42% | 340px notes panel, 48px bar, 48px rail, banner |
| 667 × 375 | page | 57% | Banner, app header, bar, rail |
| 667 × 375 | full screen | 32% | 340px notes panel, bar, rail, banner |

Results are identical in WebKit and Chromium. What wastes space or breaks:

1. **A landscape phone is not treated as a phone.** `useIsPhone` in
   `BattleMapPage.tsx` is `(max-width: 820px)`, and so are all the `.bm-*`
   touch rules (38px targets, icon-only buttons). An 844 by 390 phone (any
   iPhone from 12 up, in landscape) gets the desktop layout: a docked 300px
   inspector, the app sidebar, 34px controls. Only a 667-wide phone counts.
2. **Session notes open by default in full screen** and take 340px as a flex
   column. In portrait that leaves a 26px map (6%). In landscape it takes 40%
   of the width. Players have the same problem: `PlayerLiveBoard` uses
   `with-notes` by default, and below 820px the grid stacks notes above the
   board.
3. **The top bar is 48px** (12% of a 390px-tall screen) and holds controls
   that a player at the table rarely needs while the map fills the screen.
4. **The demo banner is 40px** and full screen starts below it. Real users
   don't see it, but the demo is where the owner tests.
5. **No safe areas.** `index.html` has no `viewport-fit=cover`, and no CSS uses
   `env(safe-area-inset-*)`. On a notched iPhone, Safari letterboxes the page
   in landscape (about 47px lost each side). If we only add `viewport-fit=cover`,
   the rail, zoom buttons and turn strip would sit under the notch and the home
   indicator.
6. **Smaller items.** The hint chip reads "Drag tokens to move. Arrow keys
   nudge." (arrow keys mean nothing on touch) and wraps to two lines
   (64px tall) in 844 by 390. The zoom control is 125 by 38 and the turn strip
   sit in the map's bottom corners with fixed 14px offsets, below the home
   indicator's safe area. Nothing uses `100dvh`; `.bm-studio.expanded` is
   `position: fixed; inset: 0`, and `.bm-window-body` uses `100vh`.
7. **Full screen on iPhone is only the in-page overlay.** iPhone Safari
   doesn't support the Fullscreen API for documents, so Safari's toolbar still
   takes room. I can't fix that in code; Add to Home Screen (standalone) is
   the only way to remove it. I can't test it here either.

Side scrolling is already 0 in all six cases (`docScrollW` equals the viewport
width).

## Proposed layout

A "phone" becomes: `(max-width: 820px)` **or** `(pointer: coarse) and
(max-height: 500px)`. The second part is a touch device turned sideways. A
desktop browser window that is short but has a mouse stays on the desktop
layout. A tablet (iPad landscape is 1024 × 768 or taller) is unchanged.

The studio gets a `compact` class from the same hook, so the JavaScript and the
CSS agree.

### Landscape phone, full screen (844 × 390 with notch)

```
 safe-left 47            844 CSS px wide                 safe-right 47
┌──────┬──────────────────────────────────────────────────────┬──────┐
│ rail │ │            [Edit|Preview][inspector][notes][▶][⋯]   │     │  floating pill,
│ 44px │ │                                       top: 8px, right: 47+8 │
│ +47  │ │                  MAP  (touch-action: none)           │     │
│      │ │              fills to the right edge                 │     │
│ ⤢ ex │ │        hint chip, one line, top center,              │     │
│ ⌖ sel│ │        shows once, dismisses on first touch          │     │
│ 📏   │ │                                                      │     │
│ ☁ fog│ │                                                      │     │
│ ◔ tpl│ │ [R3 · ● ● ● Next]  turn strip              [+][−][Fit]│     │
│ ⊕ tok│ │ bottom-left,                      bottom-right,       │     │
│ ▣ obj│ │ bottom: 8 + safe-bottom 21        right: 47+8          │     │
└──────┴──────────────────────────────────────────────────────┴──────┘
 no top bar row · no banner · 100dvh × 100dvw · every target ≥ 38px
```

| Element | Today | Proposed |
| --- | --- | --- |
| Top bar row (48px) | Full-width row | Removed in landscape full screen. Its controls become a floating pill, top right, 38px tall, translucent `var(--bg-elev)` with a border. Controls: Edit/Preview, inspector, notes, Run, More (map name, Maps, New map and Live live in More). |
| Tool rail | 48px column under the bar | 44px column from top to bottom, background bleeds under the notch, content padded by `env(safe-area-inset-left)`. Adds **Exit full screen** at the top. Scrolls vertically if the screen is shorter than 8 buttons × 42px. |
| Map | Right of rail, under bar | Fills everything right of the rail, full height. Pan, pinch and token drag unchanged. |
| Inspector | Desktop: docked 300px. Full screen: drawer | Always a drawer in landscape phone: slides from the right, `min(340px, 45vw)` wide, padded by the right safe inset. **No scrim** in landscape so the other 55% of the map stays usable. The inspector button, Esc and its close button dismiss it. |
| Session notes | Open by default, 340px flex column | Closed by default on every phone. Opens as the same right drawer; opening one drawer closes the other. |
| Turn strip | Bottom-left 14px, covers the map bottom | Bottom-left, offset by safe insets, smaller (round and Next, chips scroll). Next stays 38px. |
| Zoom control | Bottom-right 125 × 38 | Bottom-right, 38px buttons, offset by safe insets. |
| Hint chip | Two lines, mentions arrow keys | Touch wording ("Drag a token to move it. Pinch to zoom."), one line, `white-space: nowrap`, top center. Dismisses on first touch and after 12s (as now). |
| Demo banner | 40px, map starts below it | Hidden while a phone is in full screen (an attribute on `<html>` set by the hook). It returns when you exit full screen. |
| Height | `inset: 0` | `height: 100dvh; width: 100dvw`, plus `inset: 0` as the fallback. |
| Viewport | No `viewport-fit` | Add `viewport-fit=cover` **only while a phone is in battle map full screen** (the hook edits the meta tag and restores it on exit), so the rest of the app is unchanged. |

### Expected map share (map view area ÷ viewport area)

| Case | Today | Proposed |
| --- | --- | --- |
| 844 × 390, notch (47px sides, 21px bottom inset), full screen | 42% | **89%** (≈84% if Safari ignores the dynamic `viewport-fit`) |
| 844 × 390, no banner, no notch | 42% | 95% |
| 667 × 375, no notch | 32% | 93% |
| 390 × 844 portrait, full screen | 6% | 82% |

Alternative I considered and rejected: a thinner 40px top bar kept in landscape.
It is simpler (about 80% share on the notch phone) but costs one tenth of the
height on every screen, and the pill covers only about 3% of the map.

### Portrait phone, full screen (390 × 844)

Keeps the current structure (48px bar, 52px rail) with these fixes: notes closed
by default (6% → about 82% with the banner hidden), safe-area padding on all
sides (top inset for the status bar), 38px targets, and a dismissible chip,
shown once, "Rotate for more room". It uses `localStorage`
(`codex-bm-rotate-hint`), so it doesn't repeat. There is no orientation lock and
no Screen Orientation API.

### Players

`PlayerLiveBoard` (the Run session and player session pages) does **not** share
the studio layout. It has its own bar (name, color swatches, Measure, Spell
areas, Notes, Full screen), `padding: 12px 16px`, and a footer line. It does
share `Tabletop`, `useFullscreen` and the same "notes open by default" problem.
For a phone (same hook) in full screen I would:

- default the notes closed, and open them as a right drawer (not a stacked grid);
- turn the bar into the same left rail (Measure, Spell areas, Notes, Exit) plus a
  small floating "Your color" button that opens the swatches;
- drop the footer line and apply the safe areas, `100dvh` and 38px targets.

`/player/:id/battlemap` only redirects, so there's nothing to change there.

## Touch and safe-area rules

- Every button, tool, menu item and drawer control is at least 38 × 38 CSS px.
- `padding: env(safe-area-inset-top/right/bottom/left)` on the rail, the pill,
  the turn strip, the zoom control, the hint chip and both drawers.
- No horizontal overflow: the existing `expectNoSideScroll` helper runs in
  every new test.
- Reuse existing variables (`--bg-elev`, `--border`, `--accent`,
  `--accent-strong`). No hard-coded accent.
- Desktop and tablet: unchanged (the new rules only apply under the `compact`
  class and the media query above).

## Test plan (step 2)

Playwright WebKit and Chromium, `isMobile` and `hasTouch`, at 844 × 390,
667 × 375 and 390 × 844:

- map share of the viewport ≥ 80% (landscape) and ≥ 75% (portrait) in full screen;
- no side scrolling; every visible control ≥ 38px; no control overlaps the
  map's center point;
- safe areas: emulate by injecting `--bm-safe-*` fallbacks (the CSS reads
  `env()` through custom properties), then assert the rail, pill, zoom control
  and turn strip stay inside the insets;
- the inspector and notes drawers open, cover ≤ 45% of the width, and close;
- pinch, pan and token drag still pass (`battlemap-phone.spec.ts`);
- the rotate hint shows once.

## Cannot test here

Real iPhone behavior: actual safe-area values, whether Safari applies
`viewport-fit=cover` set after load, the dynamic toolbar (`100dvh` changes),
Safari's landscape chrome, and touch feel. I will emulate insets in tests and
say so in the report.

## Decisions for the owner

1. **Pill vs. thin bar** in landscape (recommended: pill, no bar row).
2. **Should the player's full screen get the same treatment now** (recommended)
   or after the studio?
3. **App shell in landscape (not full screen):** at 844 wide the app sidebar
   (220px) still shows. I would not change it in this ticket; say if you want
   landscape phones to use the phone drawer there too.

## Safe areas and viewport (first deliverable, done)

The owner's screenshot showed the dark app area stopping short of both side
edges. Cause: `index.html` had no `viewport-fit=cover`, so iOS letterboxed the
page away from the notch and home indicator. The fix is a separate small diff:

- `index.html`: `viewport-fit=cover`, and a `theme-color` meta (dark `#14121a`,
  light `#f6f4fb`). The boot script and `applyTheme` in `src/lib/theme.ts` keep
  it in step with the theme, so Safari's toolbar tints to the app.
- `src/styles.css`, "Safe areas" block at the end: custom properties `--sat`,
  `--sar`, `--sab`, `--sal` (`env(safe-area-inset-*, 0px)`) and `--demo-h`;
  `html` paints `var(--bg)`; the demo banner, sidebar and phone drawer, phone
  top bar, `.content`, side panels, toasts, the old full screen editor
  (`.battlemap-editor.expanded`, which the player board uses) and the studio's
  bar, rail, inspector, zoom control and turn strip clear the insets. Bars and
  the rail still paint under the notch; only their controls move in. On desktop
  and devices without a notch the values are `0px`, so nothing changes.
- `e2e/safe-area.spec.ts` (Chromium and WebKit, 844 × 390, `isMobile`,
  `hasTouch`): viewport meta, `theme-color`, shell width equals viewport width,
  no horizontal overflow, matching `html` and `body` background, and, with the
  four properties overridden to 47/47/21/47px, banner text, sidebar, rail, bar
  and zoom control stay inside the insets.

A browser can't emulate a real notch, so the real `env()` values are untested.

### Checklist to verify on the phone

1. Open the live site in Safari on an iPhone, landscape, notch on the **left**.
   The dark background reaches both screen edges; no light or black bar.
2. Turn the phone so the notch is on the **right**. Same check. Sidebar text,
   page content and the demo banner text don't touch the notch or the rounded
   corners.
3. Open a battle map, then **Full screen**. The tool rail's icons sit clear of
   the notch, the zoom buttons clear the home indicator, and the map reaches the
   edge.
4. Repeat 1 to 3 with Safari's toolbar shown and hidden (scroll the address
   bar away, or use the Safari full screen option). The toolbar area takes the
   app's color.
5. Turn to portrait. Nothing sits under the status bar or Dynamic Island, and
   the bottom controls clear the home indicator.
6. Switch the app theme to light. The toolbar tint follows.

## Add to Home Screen: what exists today

Found in `index.html` and `public/`: only `favicon.svg`. There is **no** web
app manifest, no `apple-mobile-web-app-capable` meta, no `apple-touch-icon` PNG,
and no service worker. So Add to Home Screen opens the site in a normal Safari
tab with the browser chrome, and iOS uses a screenshot as the icon.

Safari-only options today, with no code: the owner can use Safari's full screen
view (reader-style toolbar hiding) for about 50 to 100px more height.

To get a chrome-free standalone app I would add a `manifest.webmanifest`
(`display: standalone`, `background_color` and `theme_color` from `--bg`, a
192 and 512px PNG icon), `apple-mobile-web-app-capable`,
`apple-mobile-web-app-status-bar-style=black-translucent` and a 180px
`apple-touch-icon`. Risks to check first, which I can't test: Google sign-in
(works on the production domain only) must complete inside a standalone iOS
web app, and the app needs the safe-area work above (done here) because
`black-translucent` puts content under the status bar. I did not add these
unasked; say if you want them.

## Landscape across the app (ranked, proposal only)

Measured in WebKit at 844 × 390 and 667 × 375 (the owner's phone is about 812
wide and gets the phone top bar), demo data. Viewport height available after
Safari's own toolbar is even smaller than these numbers. Nothing below is
fixed yet except the battle map (above) and the safe areas.

| # | Page or shared part | What wastes space in landscape | Fix idea |
| --- | --- | --- | --- |
| 1 | **Demo banner** (all pages) | Fixed 40px strip, 10% of 390px, always visible. | In landscape phones, make it a 24px strip or scroll it away with the page; hide it in any full screen view. |
| 2 | **App shell** (all pages) | At 667 to 820px wide: 54px top bar (14% of the height) plus the demo banner. At 821 to 932px (iPhone Plus, Pro and Pro Max in landscape): the 220px docked sidebar eats 26% of the width, because the breakpoint is width only. | Use the same "touch and short" test as the battle map: drawer instead of docked sidebar, a 40px top bar that hides on scroll down and returns on scroll up. |
| 3 | **Run mode** (`/run/:id`, Notes and Battle Map tabs) | One column below 1050px: header, "Session" select, In play, tab switcher and Show panel, Upload map, Delete, a tip paragraph and a map picker come before the map. The map starts at y = 549 and is 380px tall (`100vh - 250px`, `min-height: 380px`) in a 280 to 350px viewport. This is the screen in the owner's screenshot. | In landscape, show the board at the top, full height under a slim bar. Put the toolbar, session and map pickers, In play and notes in drawers. Show the tip once, dismissible, and move Upload and Delete into the overflow menu. Use `dvh`. |
| 4 | **Campaign header and sub-navigation** (every campaign page) | Campaign name row and tabs sit above every page: about 68px of the 350px viewport before content. | Collapse to a single 36px row, or move the page title into the top bar. |
| 5 | **Overview** | One column of cards: 2,688px of content for a 280px viewport. | Two columns from 600px up in landscape, smaller card padding, no change to edit mode. |
| 6 | **World map** (`/campaign/:id/worldmap`) | `.wm-stage` is `100vh - 260px` with `min-height: 420px`, taller than the viewport. | Fill the visible height (`dvh`), drop the minimum, add a full screen like the battle map. |
| 7 | **Daily Duel** (`/daily`) | 444px of content in 350px, single column. | Arena and log side by side from 600px wide in landscape. |
| 8 | **Player session page and player board** | Notes open by default and stack above the board; old bar wraps to several rows. | Same treatment as the studio: rail, notes drawer, color picker button. |
| 9 | **List pages** (NPCs, Sessions, Locations, and so on) | Header, filters and "New" button before the first row; one column. | Sticky one-line header, two-column lists in landscape. Low value on its own once #2 and #4 land. |
| 10 | **`100vh` everywhere** | Safari's dynamic toolbar changes the visible height, so `100vh` is taller than what you see (for example `.wm-stage`, `.run-map`, `.session-map`, modals' `max-height`, `.bm-window-body`, `.duel-log-body`). | Replace with `100dvh` behind an `@supports (height: 100dvh)` fallback, in one pass. |
| 11 | **Modals, side panels, toasts** | Modals use `calc(100vh - 40px)`; a short screen leaves little room and the bottom buttons can fall under the home indicator. | `dvh`, safe-area padding on the footer (side panel and toast insets done in the safe-area diff). |

**Status (T-97):** rows 1, 2 (the 40px hide-on-scroll top bar and the 24px banner), 4, 5 and
10 are fixed for a touch screen turned sideways. The 821 to 932px docked-sidebar case of row 2
already uses the drawer through the `pointer: coarse` and `max-height: 500px` query. Rows 3, 6
to 9 and 11 are still open.

Suggested order after the battle map: 2 and 1 together (shell and banner, since
they hit every page), then 3 (Run mode, the owner's screen), then 10, 4, 5, 6,
7 and 8. Items 9 and 11 can wait. I'll change none of these until you and the
owner approve the list.
