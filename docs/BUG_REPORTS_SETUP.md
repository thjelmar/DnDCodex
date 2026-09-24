# Bug Reports — setup checklist

A "Report a bug" button (sidebar footer) opens a dialog. On submit, the app POSTs
to a Cloudflare Pages Function at `/api/bug-report`, which:

1. Stores the report in the Supabase `bug_reports` table (service role — bypasses
   RLS; the table has no client-facing policies, so nothing is exposed in-app).
2. Emails it to you via Resend.

Auto-attached to every report: the description, the reporter's optional email
(prefilled with the account email when signed in), the current route, the browser
user-agent, the deployed commit (`CF_PAGES_COMMIT_SHA`), and any recent client-side
errors captured by the in-app error log.

The function only runs on the deployed site (or under `wrangler pages dev`), so a
`Server error (404)` when submitting from the local Vite dev server is expected.

## One-time setup

### 1. Run the migration
In Supabase → SQL Editor, run `supabase/migrations/0009_bug_reports.sql`.
(Creates `public.bug_reports`, RLS enabled, no policies — service-role only.)

### 2. Create a Resend account + API key
- Sign up at https://resend.com with the inbox you want reports delivered to.
- Create an API key (Dashboard → API Keys).
- No custom domain needed to start: Resend's test sender
  `onboarding@resend.dev` can email **your own** signup address. To send to a
  different inbox later, verify a domain in Resend and set `BUG_REPORT_FROM`.

### 3. Get the Supabase service-role key
Supabase → Project Settings → API → `service_role` secret. This is powerful
(full DB access) — it only ever lives in the Cloudflare Function env, never in the
client bundle.

### 4. Set Cloudflare Pages environment variables
Cloudflare → Pages project → Settings → Environment variables → **Production**
(add to Preview too if you want it there). These are separate from the `VITE_`
build vars and are read server-side by the function:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | your Resend API key |
| `BUG_REPORT_TO` | the inbox that receives reports (your email) |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role secret from step 3 |
| `BUG_REPORT_FROM` | *(optional)* e.g. `D&D Codex <bugs@yourdomain>`; defaults to `onboarding@resend.dev` |
| `SUPABASE_URL` | *(optional)* defaults to the project URL baked into the function |

If `SUPABASE_SERVICE_ROLE_KEY` is absent the email still sends; storage is just
skipped. If `RESEND_API_KEY` or `BUG_REPORT_TO` is absent the endpoint returns a
500 ("Email is not configured on the server").

### 5. Deploy
Push to `main`. Cloudflare auto-detects the `functions/` directory and deploys the
endpoint alongside the site — no `wrangler.toml` needed.

## Viewing reports
- **Email:** arrives at `BUG_REPORT_TO`, subject `🐛 Bug report: <first line>`,
  with `reply_to` set to the reporter's email when provided.
- **Backlog:** Supabase → Table editor → `bug_reports` (has a `status` column for
  triage: `new` by default).
