# Player note taking (T-124, item 1)

Status: built, PR against `dev`. Items 2 (world-building notes) and 3 (session prep notes) of T-124 are not started.

## Problems found

1. Two unrelated surfaces: the live session Notes tab was one unnamed blob, and campaign entries opened in a heavy side-panel form.
2. The toolbar used cryptic glyphs and showed the DM-only spoiler lock to players.
3. The campaign Notes page was five collapsible lists with no previews, search, or sort.
4. The toolbar wrapped on a phone and took height beside the on-screen keyboard.
5. No quick capture while playing.

## Design

Mockups: `round-2/t124/option-a2-notebook-hybrid.html` (chosen), plus the three first options
(`option-a-notebook.html`, `option-b-scratchpad.html`, `option-c-journal-cards.html`). Stitch produced
a notebook screen in the owner's own project; the ideas taken from it were typed quick capture, the
timestamped feed of typed cards, and the filter box. Everything that touched DM-only data, new tables,
or other session panels was left out.

| Where | What |
| --- | --- |
| Live session, **Notes** tab | A capture bar adds typed cards (NPC, Place, Loot, Quest lead, Ask DM, Note) to the top of the session note. A leading `@`, `#`, `!`, `+` or `?` picks the type. During combat the card carries the round. |
| Campaign Notes page | A notebook: searchable list grouped by section, the open entry beside it, and a links and backlinks pane. On a phone, the list and then the entry full screen with a back button. |
| Editor | `RichTextEditor` gets `variant="player"`: a labeled toolbar (icon-only on phones) with no spoiler lock. |

## Implementation notes

- Typed cards are a tiptap node (`src/editor/NoteCard.ts`) stored as `<div data-note-card="loot" data-round="3">`. No new table, no change to the save path or `createPlayerNote`. The `@tiptap` packages are unchanged.
- `src/components/NoteCapture.tsx` is the capture bar. `PlayerNotesPage.tsx` holds `PlayerNotebook` and `PlayerEntryEditor` (the old side-panel form, now inline).
- Tests: `e2e/player-notes-capture.spec.ts` (live tab, Chromium and WebKit) and `e2e/player-notebook.spec.ts` (notebook, Chromium and WebKit).

## Known gaps (follow-ups)

- "Story so far" shows a typed card as plain text, without its label.
- The Link button still needs the name selected first. A picker of the campaign's NPCs and places is not built.
- "Ask DM" cards stay private. Sending them to the DM needs a new table.
