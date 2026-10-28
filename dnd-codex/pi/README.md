# D&D Codex Raspberry Pi services

Small background jobs that run on the same Raspberry Pi as the
[voice bot](../bot/README.md). Each job runs on a systemd timer, makes outbound
connections only, and needs no open port on your router.

| Job | What it does | When |
| --- | --- | --- |
| `uptime/check.mjs` | Checks the app, Supabase, the `codexbot` service, and free SD card space. Posts to Discord when something goes down, stays down, or recovers. Silent while healthy. | Every 5 minutes |
| `backup/db-backup.sh` | Dumps the Supabase `public` schema to the Pi, checks the dump, and keeps the newest 7. Posts to Discord if a run fails. | Nightly, about 03:30 |

The Pi's 64 GB SD card holds the dumps for now. When you add a USB stick, set
`BACKUP_DIR` in `.env` to a folder on it; nothing else changes.

## Set up

### 1. Create a Discord webhook

1. In Discord, open the settings of the channel that should get alerts.
2. Go to **Integrations** > **Webhooks** > **New Webhook**.
3. Select **Copy Webhook URL**. This is `ALERT_WEBHOOK_URL`. Treat it as a secret.

### 2. Get the code and the settings onto the Pi

On the Pi, pull the latest code (the bot's folder is already cloned):

```
cd ~/DnDCodex
git pull
```

Create `pi/.env`. As with the bot, the quickest way is to copy the template, fill
it in on your Mac, and `scp` it over:

```
scp dnd-codex/pi/.env <user>@<host>:DnDCodex/dnd-codex/pi/.env
```

See `.env.example` for every setting. For the uptime check you need only
`ALERT_WEBHOOK_URL`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` (the same values as
`bot/.env`).

### 3. Try the uptime check by hand

From `~/DnDCodex/dnd-codex/pi` on the Pi:

```
node --env-file=.env uptime/check.mjs --print
```

Each line starts with `✓` or `✗`. Then confirm the webhook works:

```
node --env-file=.env uptime/check.mjs --test-alert
```

A test message appears in your Discord channel.

### 4. Install the timers

From `~/DnDCodex/dnd-codex/pi` on the Pi, copy the units and fill in your login
name and the repo path:

```
sudo cp systemd/codex-uptime.service systemd/codex-uptime.timer systemd/codex-db-backup.service systemd/codex-db-backup.timer /etc/systemd/system/
```

```
sudo sed -i "s/YOUR_USER/$USER/g" /etc/systemd/system/codex-uptime.service /etc/systemd/system/codex-db-backup.service
```

Start the uptime timer now. Leave the backup timer until you finish the next section.

```
sudo systemctl daemon-reload
sudo systemctl enable --now codex-uptime.timer
```

## Set up the nightly database backup

### 1. Install the PostgreSQL client

```
sudo apt install -y postgresql-client
```

```
pg_dump --version
```

The major version must be the same as or newer than your Supabase database's
(the dashboard shows it under **Project Settings** > **Infrastructure**). If it's
older, `pg_dump` refuses to run. In that case install a newer client from the
[PostgreSQL apt repository](https://www.postgresql.org/download/linux/debian/).

### 2. Create a read-only backup role

In the Supabase **SQL Editor**, run the following. Replace the password with a long
random one.

```sql
create role codex_backup login password 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD' bypassrls;
grant usage on schema public to codex_backup;
grant select on all tables in schema public to codex_backup;
grant select on all sequences in schema public to codex_backup;
alter default privileges for role postgres in schema public grant select on tables to codex_backup;
alter default privileges for role postgres in schema public grant select on sequences to codex_backup;
```

**Caution:** I couldn't run this SQL against your project. `bypassrls` is needed
because the app's tables use row-level security; without it `pg_dump` stops with an
error instead of dumping. If Supabase rejects `bypassrls`, use the `postgres` role's
credentials in `.env` instead, and keep `.env` readable only by you (`chmod 600`).

### 3. Fill in the connection settings

In the Supabase dashboard, select **Connect** and copy the **Session pooler**
values into `.env`:

- `BACKUP_DB_HOST`: the pooler host, `aws-…pooler.supabase.com`.
- `BACKUP_DB_USER`: `codex_backup.<project-ref>`.
- `BACKUP_DB_PASSWORD`: the password from the previous step.

Use the pooler, not the direct connection. The direct connection is IPv6-only, and
a home network often has no IPv6.

### 4. Run it once, then start the timer

```
set -a; . ./.env; set +a; bash backup/db-backup.sh
```

The last lines say `Backed up N bytes to codex-….dump.` Note the size: it tells you
how much space each backup takes. Then start the nightly timer:

```
sudo systemctl enable --now codex-db-backup.timer
```

### Restore a backup

Restore into an empty database (a new Supabase project, or a local one for a test):

```
pg_restore --no-owner --dbname="<connection string>" /var/lib/codex-pi/db/codex-<stamp>.dump
```

**Caution:** the dump holds the `public` schema only. It doesn't include the
`auth.users` table, so a restore into a brand-new project needs its users to exist
first. Try one restore into a throwaway project before you ever need it.

## SD card notes

- The uptime check writes its state file only when something changes, and the
  backup writes about one dump a night. Both are light on the card.
- The uptime check alerts when the card passes `DISK_ALERT_PERCENT` (90% by default).
- A 7-night rotation keeps the dumps from growing past 7 times the size of one.

## A limit to know about

A job running on the Pi can't tell you the Pi has stopped. To get that alert, make a
free check at [healthchecks.io](https://healthchecks.io), put its ping URL in
`HEARTBEAT_URL`, and let it email or notify you when the pings stop.

## Handy commands

```
systemctl list-timers 'codex-*'
```

```
journalctl -u codex-uptime -n 30
```

```
journalctl -u codex-db-backup -n 30
```

```
sudo systemctl start codex-db-backup
```

## Tests

From the repo's `dnd-codex` folder:

```
node --test "pi/**/*.test.mjs"
```

```
bash pi/backup/test-db-backup.sh
```
