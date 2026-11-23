# Map pings and colored cursors (T-102)

Status: **approved by the owner** (decisions below). No application code changed yet. The build waits for T-99 to land on `dev`.
Mockup: [`round-2/map-pings-mockup.html`](round-2/map-pings-mockup.html)
(open it in a browser; it has two simulated users, light and dark maps, and the DM toggle).

Owner requirement: a ping system and a cursor color system on the map. A single
right click is a ping. A right-click drag shows that user's colored cursor.

## Decisions (owner, 2026-11-23)

1. Players ping and show cursors by default, with the DM toggle and a per-player mute.
2. The DM toggle is session-only, sent as a broadcast `ctl` message. No extra migration or column.
3. The picker keeps the 8 token colors. Okabe-Ito is only the fallback for users with no saved color.
4. Private channels, with the `realtime.messages` SQL migration.
5. The P key ping and off-screen edge arrows stay.
6. The cursor sends at 20/s, with 12/s kept as a switch (a constant in `pings.ts`) for the free tier.

The migration number is a placeholder (`NNNN`) in this note. The hub assigns it at build time,
because T-100 also plans a migration.

## What the code does today

| Question | Finding |
| --- | --- |
| How the live scene reaches players | `useLiveScene` in `src/auth/liveScene.ts` reads `shared_scenes` and `shared_scene_tokens`, then subscribes to `postgres_changes` on both tables. The DM side (`src/pages/useDmLiveScene.ts`) pushes a debounced diff (250 ms). |
| Is Broadcast or Presence used? | Broadcast is used once: `useVoiceRoster` listens on a public `voice:<id>` channel that the Discord bot writes to. Presence is not used. Every other channel is `postgres_changes`. |
| Channel naming | Each subscriber adds a random suffix (`live-scene-<id>-<rand>`), because `supabase.channel()` returns the existing channel for a repeated name. A broadcast channel must be the opposite: all clients share one name. |
| Player identity and color | `campaign_members.color` (migration 0016). `getMyColor` and `setMyColor` (RPC `set_my_color`) in `src/auth/cloud.ts`. The player board shows a swatch picker from `TOKEN_COLORS` (8 colors in `src/lib/tabletop.ts`). The DM already reads every member's color through `getCampaignMembers` (`Member.color`, `Member.userId`, display name), so colors are already shared with the DM. Players read their own color only. |
| Pointer handling in `Tabletop.tsx` | `onBgPointerDown` returns unless `e.button === 0`. Token and resize handlers do the same. There is no `contextmenu` handler anywhere, so a right click opens the browser menu today. Pan, token drag, fog, measure, template and align share one `drag` ref. A two-finger pinch is captured in `onViewPointerDownCapture` (touch and pen only). `toBoard(clientX, clientY)` already converts to board pixels using `transform`. Pointer capture is set on the pressed element. |
| Where `Tabletop` renders | `BattleMapPage` (studio and the DM's live preview), `RunPage` (through the same board component) and `PlayerLiveBoard` (player board, also in full screen and landscape). One board, three hosts. |
| Demo | `demoSkipsCloud()` in `cloud.ts` and `isDemo()` guard every cloud call. `useLiveSession` and `useVoiceRoster` return early in the demo. |
| Reduced motion | Existing CSS already uses `@media (prefers-reduced-motion: reduce)` (for example `.tabletop-turn-halo`). There is no JS hook for it yet. |

## 1. Interaction

### Mouse

| Input | Result |
| --- | --- |
| Right button down, release within 6 px and 350 ms | **Ping** at the pointer, in board coordinates. |
| Right button down, move more than 6 px, hold | **Cursor** mode: send the position while the button is down. The cursor fades 600 ms after release or after pointer cancel. No ping drops on release. |
| Left drag, wheel, two-finger scroll | Unchanged (pan, zoom). |
| Left drag on a token or a tool (measure, fog, template, align) | Unchanged. Right button does nothing to these tools. |

Rules:

- The board calls `preventDefault()` on `contextmenu` only on the map surface and
  only when the live channel is available (signed in, not demo, user can send).
  Elsewhere the browser menu stays. A right click on a token also pings the board
  point under it, because the token menu is a separate click flow.
- Right-button tracking uses `pointerdown` with `e.button === 2`, plus
  `setPointerCapture`, so the drag keeps working when the pointer leaves the
  board. `buttons & 2` on `pointermove` is the source of truth, so a lost
  `pointerup` (for example, a menu opens) ends the cursor instead of leaving it stuck.
- A ping starts on `pointerup`, not `pointerdown`, because the browser can't tell a
  ping from a cursor drag until release.

### Trackpads and Ctrl+click on Mac

- A two-finger tap (the Mac secondary click) fires `contextmenu` with
  `button === 2` and behaves as a right click: a ping.
- Ctrl+click on Mac fires `contextmenu` and `pointerdown` with `button === 0` and
  `ctrlKey`. Treat `ctrlKey && button === 0` as a right button, but only on macOS
  (`navigator.platform`), and not while a tool is active. This gives Mac
  trackpad users a ping. The cursor drag works with Ctrl held while dragging.
- Two-finger *scroll* on a trackpad arrives as `wheel`, which the board already
  uses for zoom. It never reaches the ping code.

### Touch and pen

There is no right click, so use a long press:

| Input | Result |
| --- | --- |
| Long press (400 ms) on empty board, finger moves less than 8 px | **Ping** when the press starts to release, with a light haptic (`navigator.vibrate(10)` where supported). |
| Long press, then drag | **Cursor** mode, as for the right-drag. |

Conflict rules:

- The long-press timer starts only for the first finger of a gesture, on the
  background (not on a token) and only when no tool (measure, fog, template,
  align) is active. A token drag already starts at once on a token, so the
  timer never starts there.
- A second finger, a move over 8 px before 400 ms (a pan), or a
  `pointercancel` cancels the timer. A pinch always wins.
- Once cursor mode starts, the pan for that pointer is suppressed (`drag` stays
  `null`) until release.
- Set `-webkit-touch-callout: none` and `user-select: none` on the board so iOS
  does not open the callout menu or select text during the press.
- Pen: treat a barrel button (`button === 2`) like the mouse right button.

### Rate limits and caps

| Limit | Value | Where enforced |
| --- | --- | --- |
| Pings per user | 1 per 300 ms, 5 per 10 s | Sender (drop silently). Receiver also drops anything over 10 per 10 s from one sender. |
| Cursor sends | At most 20 per second, coalesced to the latest point per 50 ms tick, only when the position changed by at least 1 board pixel | Sender, by a `setInterval` tick that runs only in cursor mode. |
| Simultaneous pings on screen | 8 total, 3 per sender. The oldest drops first. | Receiver. |
| Simultaneous cursors | 12 total (extra cursors are not drawn) | Receiver. |
| Stale data | Drop any message with a timestamp more than 5 s older than the receiver's clock estimate. Cursor entries with no update for 1.5 s fade out. | Receiver. |

## 2. Who sees and who can ping

- Everyone watching the live map sees pings and cursors: the DM's battle map
  studio and Run Mode, the player board, and the player's landscape full screen.
  All render the same `Tabletop`, so one overlay covers all of them.
- **Players can ping and show a cursor** (recommended: yes). The DM is the
  only one who can switch this off.
- **DM controls**, in the live-map toolbar overflow:
  - **Allow player pings and cursors** (default on). The setting is a `ctl`
    broadcast message that the DM's client re-sends on every join and every
    change. It ends with the session (see open question 2 for the alternative).
  - **Mute** in the DM's roster menu, per player. A muted player's messages
    are dropped by every client. The mute lives on the DM's device and each
    client applies it by sender id (`k`).
- Pings use board coordinates: `x` and `y` in board pixels (the same space as
  `toBoard()`, before `transform`). Each client multiplies by its own zoom and
  adds its own pan, so the ping lands on the same map point on a phone and on a
  desktop. Board pixels depend on the map image size, which is identical on all
  clients for one scene. The message carries `sceneId` (short), so a ping for a
  scene the viewer isn't on is ignored.
- If a ping lands outside the viewer's current viewport, draw an edge arrow in
  the ping color pointing to it (a small chevron with the name), and drop it with
  the ring. No auto-pan, because it would interrupt the viewer.

## 3. Color system

Order of precedence:

1. The user's saved `campaign_members.color` (what token colors use today).
2. Otherwise, a stable pick from the palette below by hashing the member's
   `userId`, so the same person always gets the same color.
3. The DM uses the app accent (`--accent`, read from CSS at draw time) unless
   they chose a member color.

Palette (extends `TOKEN_COLORS`, which the player picker already uses): keep the
8 existing colors and verify the set is colorblind-safe, since 2 are close
under deuteranopia (`#16a34a` and `#ca8a04`; `#dc2626` and `#db2777`). The
proposed set is the 8 Okabe-Ito colors, reused only for pings and cursors when a
user has no saved color; saved colors always win, so existing token colors don't
change. Pings and cursors also differ by **name label** and by **shape marker**
(ring with a dot, arrow, diamond, and so on, picked by `hash % 4`), so color
is never the only signal.

| Okabe-Ito | Hex |
| --- | --- |
| Orange | `#E69F00` |
| Sky blue | `#56B4E9` |
| Bluish green | `#009E73` |
| Yellow | `#F0E442` |
| Blue | `#0072B2` |
| Vermillion | `#D55E00` |
| Reddish purple | `#CC79A7` |
| White | `#FFFFFF` |

Contrast on light and dark maps: draw every ring and cursor with a 2 px
**halo** (a stroke in the opposite luminance, picked from the color's relative
luminance: dark `#14121a` halo for light colors, white halo for dark colors), and give the
name tag a solid `--bg-elev` pill with the color as a left bar. The tag text is
`--text`, so it meets 4.5:1 on both themes.

Changing your color: players already have the **Your color** swatch row on the
player board. Reuse it; the same pick updates ping and cursor color. The DM gets
the same swatch row in the live-map toolbar overflow, stored per device in
`localStorage` (`dndcodex.pingColor`), because the DM is the campaign owner and
has no `set_my_color` need beyond their own row; if their `campaign_members`
row has a color, it wins.

Sharing: the color travels in each message (`c`), so a client doesn't need to
read the member table. The receiver validates it against `^#[0-9a-fA-F]{6}$`
and falls back to the hash palette. This also means a color change shows at once,
without a refresh.

## 4. Transport

**Recommendation: Supabase Realtime Broadcast on a private channel, with no
database writes.** Presence is not needed, because the name and color ride in
each message and nobody needs a "who is here" list for this feature.

- Channel: `pings:<cloudCampaignId>`. One channel per campaign, not per scene,
  so the DM switching scenes doesn't resubscribe. The `sceneId` field in the
  payload scopes a ping to a scene.
- Options: `{ config: { private: true, broadcast: { self: false, ack: false } } }`.
  `self: false` stops the sender from receiving its own message (the sender draws
  its own ping locally at once).
- Subscribe only when `cloudCampaignId` exists, a session token exists, and
  `!isDemo()`. Gate it on the auth token the way `useLiveScene` does, and
  re-subscribe when the token changes.
- Messages (event names `p` and `c`; short keys keep each frame under 150 bytes):

```json
{ "t": "p", "s": "a1b2c3d4", "x": 1432.5, "y": 880, "c": "#56B4E9", "n": "Sable", "k": "q7f2", "ts": 1763900000000 }
{ "t": "c", "s": "a1b2c3d4", "x": 1440, "y": 884, "c": "#56B4E9", "n": "Sable", "k": "q7f2", "ts": 1763900000050, "end": false }
{ "t": "ctl", "allow": false }
```

  `n` is the display name, capped at 24 characters and sanitized on receipt.
  The sender's `userId` is **not** in the payload. Receivers key cursors by the
  sender's `userId`, taken from a short, random per-session sender id (`k`), so a
  client can't impersonate a member. No private data (email, notes, token
  names) ever goes in a payload.

### Authorization

A public channel name is guessable, and anyone with the project's anon key can
subscribe. Use **private channels** with RLS on `realtime.messages`. That is the
only authorization Realtime offers, and it needs an additive migration (the hub assigns the number; `NNNN` below).

Migration (additive, adds no table and no function, so there is no
SECURITY DEFINER function to revoke from `anon`):

```sql
-- NNNN_map_pings_realtime.sql (the hub assigns the number)
-- Campaign members (and the owner) can receive and send map ping broadcasts on
-- the private channel "pings:<campaign uuid>". Nothing else changes.

drop policy if exists "campaign members receive map pings" on realtime.messages;
create policy "campaign members receive map pings"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() like 'pings:%'
  and (
    public.is_member(substr(realtime.topic(), 7)::uuid, (select auth.uid()))
    or public.is_owner(substr(realtime.topic(), 7)::uuid, (select auth.uid()))
  )
);

drop policy if exists "campaign members send map pings" on realtime.messages;
create policy "campaign members send map pings"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() like 'pings:%'
  and (
    public.is_member(substr(realtime.topic(), 7)::uuid, (select auth.uid()))
    or public.is_owner(substr(realtime.topic(), 7)::uuid, (select auth.uid()))
  )
);
```

Risks of the SQL, to check before the owner runs it:

- A malformed topic (`pings:not-a-uuid`) makes the `::uuid` cast raise. Postgres
  evaluates `like` first because of `and`, but a topic such as `pings:xyz`
  still reaches the cast and fails the *check*, which denies the message. That is
  safe (deny), but the owner should confirm in the SQL Editor with
  `select realtime.topic()` semantics on the dev project first.
- `realtime.messages` policies are the supported route for private Broadcast. I
  have not run this SQL; the owner or the hub should test it in the SQL Editor
  against a throwaway campaign before the PR merges.

Dashboard steps (only if the owner wants to force private channels): **Project
Settings** > **Realtime** > turn off **Allow public access**. Leave it on for
now, because the voice roster channel (`voice:<id>`) is public and the Discord bot
writes to it.

### Reconnect, scale and abuse

- Reconnect: Realtime rejoins on its own. Pings are ephemeral, so nothing is
  replayed. On `SUBSCRIBED` the hook clears all remote cursors. While the status
  is not `SUBSCRIBED`, the local ping still animates but a small "pings offline"
  hint shows on hover only.
- Messages that arrive while the tab is hidden are dropped (check
  `document.visibilityState`), so a backgrounded phone doesn't build a backlog.
- Scale: a table has at most about 8 people. Worst case is 8 cursors at 20 msg/s
  each, 160 msg/s for the channel and 8 senders' worth at each client (about
  8 x 20 x 150 bytes = 24 KB/s per client). That is inside the Realtime limits
  for the free tier (100 msg/s per channel is the documented default, so
  the cursor rate constant has a 12/s setting for the free tier; the default is 20/s).
- Abuse: only members join (RLS). A member can still spam, so receivers apply
  the caps in section 1 and drop senders over the limit for 10 s. The DM mute
  (section 2) is the human control.

## 5. Demo and offline

- In the demo, `usePings` never creates a channel. It still handles local
  gestures: your own ping and cursor animate on your screen in your color
  (named "You"). That makes the feature visible in the demo with no network.
- When signed out, not linked to a campaign, or the channel is not subscribed,
  `send` is a quiet no-op. The local animation still plays, so the click feels
  responsive, but nothing is sent and no error toast shows.
- The `contextmenu` suppression applies in the demo too (the local ping needs it).
  It applies in the studio even when nothing is shared (DM editing offline).

## 6. Accessibility and settings

- Reduced motion (`prefers-reduced-motion: reduce`): the ring appears static at
  full size for 2 s, then disappears (no pulse). Cursors move without easing or trail.
  Read the media query in a small `useReducedMotion` hook (new, 10 lines).
- Preferences: add **Map pings and cursors** (on by default) to
  `PreferencesModal`. Off means: don't draw remote pings or cursors, don't send
  either, and don't suppress the browser context menu. Stored in `localStorage`.
- Screen readers: a visually hidden `role="status" aria-live="polite"` region in
  the board announces "Sable pinged the map" (throttled to one announcement per
  3 s per sender). Cursors are not announced.
- Keyboard: **P** pings at the board center (the same point as
  `centerRef`, or at the selected token if one is selected). This gives
  keyboard-only players a way to send a ping. It needs the board focused, as the
  arrow-key token move already does.
- Ping rings are `aria-hidden` SVG; the live region is the accessible output.

## 7. Where it lives in the code

New files only, so the change stays out of the way of T-99 and T-100:

| File | Contents |
| --- | --- |
| `src/lib/pings.ts` | Pure helpers: message types, `sanitizeName`, `colorFor(userId, saved)`, rate limiter, caps, `pingPalette`. Unit-testable with no DOM. |
| `src/lib/usePings.ts` | Hook `usePings({ campaignId, sceneId, me })`: owns the broadcast channel, the local and remote ping and cursor state, `sendPing(x, y)`, `sendCursor(x, y, end)`, mute and allow state. Returns `{ pings, cursors, sendPing, sendCursor, enabled }`. Demo or offline: no channel. |
| `src/components/PingLayer.tsx` | SVG overlay rendered inside the board's transformed group, so rings scale with the map. Name labels use the counter-scale trick the token labels use, so they stay readable at any zoom. Also the edge-arrow indicator and the live region. |
| `src/components/useBoardPings.ts` | The gesture recognizer: right-click, Ctrl+click, long press, and the cursor drag. It exposes `onPointerDown/Move/Up/Cancel` and `onContextMenu` to attach to the board. |
| CSS | A new block at the end of `src/styles.css` (`.ping-*`), not interleaved with existing rules. |

Touch points in existing files (each is a few lines):

- `Tabletop.tsx`: one new optional prop `pings?: PingsApi`. The gesture hook runs
  its handlers first on the background (`onBgPointerDown` early return for
  `button !== 0` stays; the hook attaches through a separate `onPointerDownCapture`
  on the wrapper) and the `PingLayer` renders as one line inside the transform
  group. Because the hook attaches through its own capture handler and a
  separate `onContextMenu`, the existing `drag` ref logic doesn't change.
- Hosts: `BattleMapPage`, `RunPage` (through the same board) and
  `PlayerLiveBoard` each call `usePings` once and pass `pings` to `Tabletop`.
  The DM hosts already have `cloudCampaignId` and `members`; the player board has
  `linkedCampaignId`, `user` and `myColor`.
- `PreferencesModal`: one toggle.

Conflicts: T-99 edits token delete and undo in `Tabletop.tsx` (the token handlers
and `onDeleteToken`) and combat code. This design touches a different region
(a new prop and one JSX line). T-100 adds live combat tables and may add
`useLiveCombat`-style hooks in the same hosts. Both are one-line additions
in different places. **Build after T-99 lands on `dev`**, then rebase; the
integration points above are the only overlap.

## 8. Tests

Playwright (local suite, `npm run e2e`) with the Realtime layer mocked. A test
helper installs `window.__pingBus`, which stands in for the channel so two
`usePings` instances can talk in one page, and the hook reads it when
`?e2e=1` and the demo flag are set (the same place other e2e hooks hide).

| Test | Check |
| --- | --- |
| Single right click | `pointerdown` and `pointerup` with `button: 2` at (400, 300) produce exactly one ping in the bus with the right board coordinates, and one ring in the DOM. |
| Right drag | A drag over more than 6 px sends cursor messages and no ping; the cursor entry has `end: true` on release and disappears after the fade. |
| Pan is untouched | A left drag moves `transform` and sends nothing. A right drag does not pan. |
| Token drag and tools | Dragging a token, or using measure, fog or template, sends nothing. |
| Throttle | 10 right clicks in 100 ms send 1 ping. A 2-second move sends at most 25 cursor messages. |
| Coordinates under zoom | At zoom 2 with pan (50, 30), a click at (300, 200) sends board `((300 - 50) / 2, (200 - 30) / 2)`; a second page at zoom 0.5 draws the ring at the same map point (`getBoundingClientRect` matches within 1 px). |
| Context menu | `contextmenu` on the map is default-prevented; on the toolbar it isn't. With the preference off, it isn't prevented on the map. |
| Reduced motion | With `reducedMotion: 'reduce'`, the ring has no animation (`getComputedStyle().animationName === 'none'`). |
| Long press | With `hasTouch`, a 500 ms hold sends a ping; a hold with a 20 px move, a two-finger pinch, and a hold on a token send nothing. |
| Demo | In the demo, no websocket opens (`page.on('websocket')` stays empty) and a local ping still shows. |
| Mute and allow | With the allow toggle off, remote messages from a player don't render. |
| Live region | A remote ping adds "Sable pinged the map" to the status region. |

Needs two real signed-in clients (owner test, `npm run e2e:live` can't cover the
hosted Realtime service):

1. DM on desktop and a player on a phone, same campaign, live map shown.
   Right click and long press, and confirm both see the ping at the same map point,
   with different zoom levels.
2. Right-drag and long press-drag cursors, in both directions.
3. A signed-in user who is **not** a member tries to join `pings:<id>` (for
   example from the browser console) and gets no messages and can't send.
4. Turn off Wi-Fi on the phone for 10 s, turn it back on, and confirm pings resume
   without a reload.
5. The DM toggle **Allow player pings and cursors** and the per-player mute.
6. Four or more people at once, to watch the rate caps.

## Stitch check

I checked the round 2 "D&D Codex Battle Map & VTT" prototype (saved HTML) and
the round 2 "Battle Map — The Gilded Stag" screen (`2f2044da...`, downloaded
through the Stitch MCP tools; same layout) for how map overlays are styled. I did
not open "Battle Map Editor", "DM Run Mode" or the round 1 project. The prototype has no ping or remote cursor, so it is
context, not a spec.

What relates to pings and cursors:

- **Overlay layering.** The cone template, range ring and cover markers are
  `pointer-events: none` SVG or divs on the map, drawn dashed at 40% opacity
  in the secondary or primary tint. The HUD (tip pill, readout, zoom controls)
  sits above the map at a higher `z-index`.
- **Name chips.** Token names are small (10 px) chips on a 90% opaque dark fill
  with tight padding and rounded corners.
- **Tip pill.** A rounded-full pill at the bottom center, blurred dark fill,
  dim text, with the controls hint ("Drag tokens... [Space] + Drag to Pan").
- **Readout.** A bottom-left monospace chip (`Grid: 5 ft / cell · Cursor: X, Y`).
- **Ping tool.** The left toolbar has a **Ping** tool button, titled "Signal Alert / Ping (P)", with a `priority_high` icon in the tertiary tint. This matches the P-key decision.
- **Pulse.** Range rings use a slow pulse, so a ping needs to look different.

What I applied (to the mockup and the plan):

- Ping and cursor name tags use the same 10 to 11 px chip on a 90% opaque dark
  fill, with the user's color as the border instead of the neutral outline.
- Pings draw above templates, rings and tokens, and below the HUD. They stay
  `pointer-events: none`.
- Pings are solid, haloed and fade out in 2 s, so they don't read as the
  dashed 40% template overlays or the always-on range-ring pulse.
- The mockup now has the bottom-center tip pill for the right-click hint and
  the bottom-left mono chip, which shows "Pings on · 2 watching". In the app,
  the right-click hint joins the existing tip pill text once, and the chip
  only appears when the DM turns pings off ("Pings off") so it isn't permanent
  noise.

- Add a **Ping** tool button to the board toolbar (shortcut P). While it is on, a tap or click pings where you press, with no long press. This gives touch users a faster route than the 400 ms long press, and it doesn't change the right-click and long-press gestures. The P key pings at the pointer when it is over the board, else at the board center.

What I left out and why:

- Material Symbols icons and Tailwind classes: the app uses its own `Icon`
  component and `styles.css` tokens.
- The prototype's own cursor coordinate readout: it is the local pointer's
  grid cell, not a remote cursor, and is out of scope for T-102.
- Invented content (AC, 5e rules, Party Level, "Act II", Quick Ref): not part of
  this design.

## 9. Risks and open questions

Risks:

- Private-channel SQL is untested against the real project; a wrong policy fails
  closed (no pings), not open.
- Right-click on a token pings instead of opening a token menu. If a future
  token context menu ships, it must claim the right click on tokens.
- Long press on touch can feel slow for a quick "look here". 400 ms is the
  starting value; tune it on a real phone.
- Free-tier Realtime limits cap the cursor rate (see section 4).
- A player's display name is sent on every message. A player who set a
  silly name sends a silly label; the 24-character cap and sanitize limit damage.

Open questions: none. All six are decided (see **Decisions**).
