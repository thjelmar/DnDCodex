-- Session reminders (T-9 #4): the pg_cron schedule that drives the tick.
--
-- ⚠️ RUN THIS LAST, and only after all of these are done:
--   1. Migration 0032 has run (tables/columns exist).
--   2. The reminders tick function is deployed (it ships with the app) at
--      https://dndcodex.pages.dev/api/reminders-tick
--   3. In Cloudflare -> Pages -> Settings -> Environment variables, set
--      REMINDERS_CRON_SECRET to a long random string (and redeploy).
--   4. Store that SAME value in Supabase Vault so this job can send it without
--      the secret living in SQL/git. In the SQL editor, once:
--        select vault.create_secret('<the-same-random-string>', 'reminders_cron_secret');
--
-- Enable the extensions first (Dashboard -> Database -> Extensions, toggle on
-- `pg_cron` and `pg_net`), or the two create-extension lines below if you have
-- rights. Then run the rest. Idempotent: re-running re-points the job.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace any previous definition of the job.
select cron.unschedule('reminders-tick')
where exists (select 1 from cron.job where jobname = 'reminders-tick');

-- Every 15 minutes, POST to the tick function with the shared secret pulled
-- from Vault. The function itself decides what's actually due and de-dups.
select cron.schedule(
  'reminders-tick',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://dndcodex.pages.dev/api/reminders-tick',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-reminders-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
