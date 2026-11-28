# Demo mode

The demo lets you try signed-in-only features on the dev site and on PR previews,
where Google sign-in doesn't work. It runs on a throwaway local database and never
touches Supabase. The dev site and the live site share one database, so this
guarantee matters.

## How the demo is isolated

- `src/lib/demo.ts` sets a per-tab `sessionStorage` flag. `isDemo()` reads it.
- In the demo, `src/lib/supabase.ts` doesn't create a Supabase client at all. There
  is no auth call, no Realtime socket, no RPC, and no sync push.
- The demo uses its own IndexedDB (`dnd-codex-demo`), seeded from
  `src/data/demoSeed.ts`.
- The demo records `DEMO_SEED_VERSION` (in `src/data/demoSeed.ts`) in
  `localStorage` after it seeds. On each demo load, if the recorded version
  differs or a seeded campaign is missing, the demo database is wiped and
  reseeded. Only the demo database is touched. **Bump `DEMO_SEED_VERSION`
  whenever you change the seed**, or an already-open demo keeps the old data and
  can show "That campaign doesn't exist in this browser."
- `e2e/demo-isolation.spec.ts` and `e2e/demo-player-session.spec.ts` fail if the
  demo sends any request to the Supabase host.

## Enter the demo

1. Open the site while signed out and click **Try the live demo**.
2. The banner at the top confirms you're in the demo. **Exit to the real site**
   clears the demo.

## Try the DM side

1. On Home, open **The Hollow Crown** (the DM campaign), then open Run Mode.
2. The battle map, tokens, initiative, Start combat, **Ask players for initiative**,
   pings, the inspector, range ring, terrain, timer, and dice all work with nothing
   signed in. Combat state is local and nobody receives it.

## Try the player side (faux live session)

1. On Home, click **Try the player side in a faux live session**. You can also open
   the **Demo player: The Hollow Crown** campaign and join the live session.
2. The real player session page opens. It's wired to an in-memory fake of the
   live-session layer (`src/lib/demoLive.ts`) instead of Supabase.
3. The **Demo controls** strip (visible only in the demo, collapsible) plays the DM:

| Control | What it does |
| --- | --- |
| Ask players for initiative | Starts a "gathering" combat. Join with Thalia from the Initiative strip. |
| Start combat | Adds a goblin and a goblin boss, sorts the order, and starts round 1. |
| Next turn | Advances the turn. |
| Add a wolf | Adds an enemy with a random initiative. |
| End combat | Returns the Initiative tab to its empty state. |
| Ping the map | Sends a DM ping to the tabletop. |
| Damage 5 / Heal 5 / Toggle Prone | Changes the selected combatant. Enemies show a health marker, never HP. |
| Token arrows | Moves the selected token one cell. |
| Reset demo | Restores the faux session. |

A typical run: Initiative tab shows "No combat yet", click **Ask players for
initiative**, **Join initiative**, **Start combat**, then **Next turn** until the
**Your turn** banner appears, then **End turn**.

The Me tab shows Thalia's HP and conditions. Notes saves to the demo database.
Handouts shows one sample handout.

## What the demo can't test

- Real Realtime (reconnects, latency, two real clients).
- Signed-in accounts, row-level security, and the `end_my_turn` RPC.
- The installed-app Google sign-in flow.
- Real iPhone Safari. Open the PR preview URL on a phone for that.

The DM demo (Run Mode) and the player demo don't share state: Run Mode keeps its
combat in local storage, and the player demo has its own in-memory session.

## Extending the fake

Put new live behavior in `src/lib/demoLive.ts` and branch in the real function on
`isDemoCloud(campaignId)`, as `src/auth/liveCombat.ts` and `src/auth/liveScene.ts`
do. Don't fork the player components.
