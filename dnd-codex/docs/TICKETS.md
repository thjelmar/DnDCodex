# Tickets and the public roadmap

One queue holds both kinds of ticket:

- **Site reports:** anything sent through "Report something" in the sidebar. The
  reporter picks a category (Issue, Enhancement, New feature); you can change it
  at any time.
- **Your own tickets:** added with "New ticket" on the Tickets page, or with
  `npm run tickets -- add` from a terminal.

Both live in the Supabase `bug_reports` table (see
`supabase/migrations/0020_tickets.sql`).

| Where | Who | What |
| --- | --- | --- |
| `#/tickets` | you (signed in as `BUG_ADMIN_EMAIL`) | Edit category, priority, stage, public title, details, resolution note; link follow-ups; tick checklists; add and delete tickets |
| `#/roadmap` | anyone | Read-only list of tickets you ticked **Public**, with a progress bar each |
| `npm run tickets` | a Claude session, or you in a terminal | The same queue from the command line |

## Stages

Site reports: **Reported → Planned → In progress → Testing → Released**.
Your own tickets skip Reported. Their bar starts at a double-width Planned.

## Follow-ups

A ticket can be a **follow-up of** another one. Open a ticket and either type the
parent's number (`T-5`) next to "Follow-up of", or click **New follow-up** on the
parent. That opens the new-ticket form already linked, with the parent's category
and priority filled in. Both tickets show the link, and clicking a linked ticket
jumps to it. Deleting the parent clears the link. Links are private: the roadmap
doesn't show them.

## Details, lists and checklists

Click **Edit** next to a ticket's details to change the text. This works on site
reports too, so be aware that editing one changes the reporter's original words.
Details are plain text with two list forms:

```
- [ ] Something to do        a checkbox; tick it on the card and it's struck through
- [x] Something done
- A plain point              a bullet
```

In the editor, **Checklist item** turns the current line into a checkbox. Enter
on a list line starts the next item, and Enter on an empty item ends the list.
Cmd/Ctrl+Enter saves and Esc cancels. The "+ Add a checklist item" box under the
details adds an item without opening the editor. A card with a checklist shows its
progress (☑ 2/5) even when it's collapsed.

## What the public roadmap shows

It shows only a ticket's **public title**, category, priority, stage, and release
date. It never shows the reporter's words, their email, screenshots, or error
details. A site report can't be made public until you give it a public title.
Nothing is public by default.

## One-time setup

1. **Run the migration.** Supabase → SQL Editor → run
   `supabase/migrations/0020_tickets.sql`. Run it **before** deploying this code:
   the new report form writes the new columns, so reports would fail to store
   until the migration has run. The migration is safe with the old code, which
   keeps working.
   - Existing reports get T-numbers. `new` becomes Reported and `resolved`
     becomes Released. Bug/idea types become Issue/New feature, and questions
     become Untriaged.
   - For follow-up links, also run `supabase/migrations/0022_ticket_links.sql`.
     Until it has run, everything else keeps working; only setting a link fails,
     with a message that names the migration.
2. **Deploy** (push to `main`). The new `/api/roadmap` function uses the same
   `SUPABASE_SERVICE_ROLE_KEY` the bug reporter already has, so there are no new
   Cloudflare variables.
3. **CLI key.** Create `dnd-codex/.env.tickets` in the main checkout. It's
   gitignored, and worktrees find it there too:

   ```
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_…
   ```

   Use the same `sb_secret_…` key that's set in Cloudflare. It has full database
   access, so it stays on your machine. Don't put it in `.env` or `.env.local`,
   and never give it a `VITE_` prefix: Vite would bundle a `VITE_` variable into
   the site.

## CLI reference

```
npm run tickets -- list [--released | --all] [--source site|owner] [--category issue|enhancement|feature]
npm run tickets -- show T-18                 # full details; saves any screenshot to .tickets/T-18.png
npm run tickets -- add "Title" [--category c] [--priority p] [--details "…"] [--public] [--follow-up-of T-5]
npm run tickets -- start T-18 --as "Claude (main)"
npm run tickets -- done T-18 "What changed, and where"    # → Testing
npm run tickets -- release T-18 ["note"]                  # → Released
npm run tickets -- stage T-18 planned
npm run tickets -- set T-18 --priority high --category enhancement --title "…" --details "…" --public
npm run tickets -- note T-18 "Resolution note"
npm run tickets -- link T-20 T-5            # T-20 is a follow-up of T-5
npm run tickets -- unlink T-20
npm run tickets -- check T-18 2 3           # tick checklist items 2 and 3 (show numbers them)
npm run tickets -- uncheck T-18 2
```

`show` lists a ticket's parent and follow-ups, and numbers its checklist items.
`list` marks follow-ups and shows checklist progress.

Priorities: `urgent`, `high`, `medium`, `low`. `list` sorts by priority.
