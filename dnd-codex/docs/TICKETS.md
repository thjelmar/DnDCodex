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
| `#/tickets` | you (signed in as `BUG_ADMIN_EMAIL`) | Edit category, priority, stage, public title, resolution note; add and delete tickets |
| `#/roadmap` | anyone | Read-only list of tickets you ticked **Public**, with a progress bar each |
| `npm run tickets` | a Claude session, or you in a terminal | The same queue from the command line |

## Stages

Site reports: **Reported → Planned → In progress → Testing → Released**.
Your own tickets skip Reported. Their bar starts at a double-width Planned.

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
npm run tickets -- add "Title" [--category c] [--priority p] [--details "…"] [--public]
npm run tickets -- start T-18 --as "Claude (main)"
npm run tickets -- done T-18 "What changed, and where"    # → Testing
npm run tickets -- release T-18 ["note"]                  # → Released
npm run tickets -- stage T-18 planned
npm run tickets -- set T-18 --priority high --category enhancement --title "…" --public
npm run tickets -- note T-18 "Resolution note"
```

Priorities: `urgent`, `high`, `medium`, `low`. `list` sorts by priority.
