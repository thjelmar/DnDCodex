# D&D Codex voice bot

A small always-on bot that mirrors one Discord **voice channel's roster** — who's
connected, muted, deafened, and currently speaking — to a Supabase Realtime
broadcast channel (`voice:<channelId>`). The app subscribes and shows the live
roster in Run mode and the player session (T-43).

It reads **no audio**. The bot joins the voice channel only to receive the
"speaking" signal; it never subscribes to anyone's audio stream, so nothing is
decoded or recorded. Session recording stays with the [Craig](https://craig.chat)
bot — and when Craig is in the channel, the app shows a **Recording** indicator
automatically.

## Set up the Discord bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   and **New Application**.
2. **Bot** → **Reset Token**, copy the token (this is your `DISCORD_BOT_TOKEN`).
   No privileged intents are needed.
3. Invite it to your server with this URL (replace `CLIENT_ID` with your app's
   Application ID). Scopes `bot`; permissions **View Channel** + **Connect**:

   ```
   https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&scope=bot&permissions=1049600
   ```

## Run it

From the repo, change into this folder, install, and copy the env template
(run the commands one per line — interactive zsh does not treat `#` as a
comment, so don't paste trailing comments):

```bash
cd dnd-codex/bot
npm install
cp .env.example .env
```

Then open `.env` and fill in the values: the bot token, the guild +
voice-channel IDs (right-click the voice channel → **Copy Link**), and your
Supabase URL + anon key (the same values the app uses). See `.env.example` for
the full list. Once it's filled in:

```bash
npm start
```

The bot joins the channel while people are in it and leaves when it empties, so
it isn't idling in an empty call.

## Hosting

Any host that runs a long-lived Node process works (Fly.io, Railway, a small
VPS) — it can't run on Cloudflare Pages, which is serverless. Deploy config is
added when we pick a host.
