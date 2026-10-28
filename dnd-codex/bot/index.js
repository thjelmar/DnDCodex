// D&D Codex voice presence bot (T-43).
//
// Watches one Discord voice channel and mirrors its roster — who's connected,
// muted, deafened, and currently speaking — to a Supabase Realtime broadcast
// channel named `voice:<channelId>`. The app subscribes to that channel and
// renders the live roster in Run mode and the player session.
//
// It reads NO audio. The bot joins the voice channel only to receive the
// "speaking" start/stop signal (which arrives over the voice gateway); it never
// subscribes to anyone's audio stream, so nothing is decoded or recorded.
// Recording stays entirely with the Craig bot.
//
// It also answers the /roll slash command (see dice.js) in the same server.

import 'dotenv/config'
import {
  ApplicationCommandOptionType,
  Client,
  GatewayIntentBits,
  Events,
  MessageFlags,
} from 'discord.js'
import { formatRoll, rollExpression } from './dice.js'
import { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } from '@discordjs/voice'
import { createClient } from '@supabase/supabase-js'

const {
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_VOICE_CHANNEL_ID,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  RECORDER_NAME_MATCH = 'craig',
} = process.env

for (const [k, v] of Object.entries({
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_VOICE_CHANNEL_ID,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
})) {
  if (!v) {
    console.error(`Missing required env var ${k}. Copy .env.example to .env and fill it in.`)
    process.exit(1)
  }
}

const recorderMatch = RECORDER_NAME_MATCH.toLowerCase()

// --- Supabase Realtime broadcast ------------------------------------------
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const channelName = `voice:${DISCORD_VOICE_CHANNEL_ID}`
let rtReady = false
const rt = supabase.channel(channelName, { config: { broadcast: { ack: false } } })
rt.subscribe((status) => {
  rtReady = status === 'SUBSCRIBED'
  if (rtReady) console.log(`Supabase Realtime: broadcasting on "${channelName}".`)
})

// The set of user ids currently transmitting, kept up to date by the voice
// connection's speaking events. Speaking is transient, so it lives only here.
const speaking = new Set()

let publishTimer = null
/** Coalesce rapid changes (speaking flickers fast) into one broadcast. */
function schedulePublish() {
  if (publishTimer) return
  publishTimer = setTimeout(() => {
    publishTimer = null
    publish()
  }, 120)
}

function buildRoster(channel) {
  const members = [...channel.members.values()]
    .map((m) => ({
      id: m.id,
      name: m.displayName || m.user.username,
      avatar: m.user.displayAvatarURL({ size: 64, extension: 'png' }),
      bot: Boolean(m.user.bot),
      muted: Boolean(m.voice.selfMute || m.voice.serverMute),
      deafened: Boolean(m.voice.selfDeaf || m.voice.serverDeaf),
      speaking: speaking.has(m.id),
    }))
    // Our own bot is in the channel to listen; don't show it in the roster.
    .filter((m) => m.id !== client.user?.id)
  const recording = members.some((m) => m.bot && m.name.toLowerCase().includes(recorderMatch))
  return { channelId: DISCORD_VOICE_CHANNEL_ID, members, recording, updatedAt: new Date().toISOString() }
}

function publish() {
  if (!rtReady) return
  const channel = client.channels.cache.get(DISCORD_VOICE_CHANNEL_ID)
  if (!channel) return
  const roster = buildRoster(channel)
  rt.send({ type: 'broadcast', event: 'voice', payload: roster })
}

// --- Discord bot -----------------------------------------------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
})

/** Join the channel while humans are in it (for speaking events); leave when
 *  it empties so the bot isn't idling in an empty call. */
function ensureVoice(guild) {
  const channel = guild.channels.cache.get(DISCORD_VOICE_CHANNEL_ID)
  if (!channel) return
  const humans = channel.members.filter((m) => !m.user.bot).size
  const conn = getVoiceConnection(guild.id)
  if (humans > 0 && !conn) {
    joinAndListen(channel)
  } else if (humans === 0 && conn) {
    conn.destroy()
    speaking.clear()
  }
}

function joinAndListen(channel) {
  let conn
  try {
    conn = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      // We never transmit; we stay un-deafened so the speaking signal flows.
      selfMute: true,
      selfDeaf: false,
    })
  } catch (err) {
    console.error('Could not join the voice channel (is the Connect permission granted?):', err)
    return
  }
  // Receiver events are metadata only — we never call receiver.subscribe(), so
  // no audio stream is ever opened.
  conn.receiver.speaking.on('start', (userId) => {
    speaking.add(userId)
    schedulePublish()
  })
  conn.receiver.speaking.on('end', (userId) => {
    speaking.delete(userId)
    schedulePublish()
  })
  conn.on(VoiceConnectionStatus.Disconnected, () => {
    conn.destroy()
    speaking.clear()
    schedulePublish()
  })
  console.log(`Joined voice channel "${channel.name}" to read the speaking signal.`)
}

// --- Slash commands --------------------------------------------------------
const COMMANDS = [
  {
    name: 'roll',
    description: 'Roll dice, for example 2d6+3 or d20+5',
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: 'dice',
        description: 'What to roll: 2d6+3, d20+5, 1d8+1d6-1',
        required: true,
        max_length: 100,
      },
      {
        type: ApplicationCommandOptionType.String,
        name: 'mode',
        description: 'Roll every single d20 twice and keep one',
        required: false,
        choices: [
          { name: 'Advantage', value: 'advantage' },
          { name: 'Disadvantage', value: 'disadvantage' },
        ],
      },
    ],
  },
]

/** Guild commands appear instantly (global ones can take up to an hour). */
async function registerCommands(guild) {
  try {
    await guild.commands.set(COMMANDS)
    console.log('Slash commands registered: /roll.')
  } catch (err) {
    console.error(
      'Could not register slash commands. Re-invite the bot with the applications.commands scope (see README.md):',
      err.message,
    )
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'roll') return
  const result = rollExpression(interaction.options.getString('dice', true), {
    mode: interaction.options.getString('mode') ?? 'normal',
  })
  if (!result) {
    await interaction.reply({
      content: "I can't read that. Try `2d6+3` or `d20+5` (up to 100 dice, up to 1000 sides each).",
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const who = interaction.member?.displayName ?? interaction.user.username
  // allowedMentions stops a name or nickname from pinging anyone.
  await interaction.reply({ content: formatRoll(result, who), allowedMentions: { parse: [] } })
})

client.once(Events.ClientReady, async (c) => {
  console.log(`Discord: logged in as ${c.user.tag}.`)
  try {
    const guild = await c.guilds.fetch(DISCORD_GUILD_ID)
    await guild.channels.fetch(DISCORD_VOICE_CHANNEL_ID)
    ensureVoice(guild)
    publish()
    await registerCommands(guild)
  } catch (err) {
    console.error('Could not reach the configured guild/channel:', err)
  }
})

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  // Only react to movement touching our channel.
  if (oldState.channelId !== DISCORD_VOICE_CHANNEL_ID && newState.channelId !== DISCORD_VOICE_CHANNEL_ID) return
  const guild = newState.guild ?? oldState.guild
  ensureVoice(guild)
  // Someone who left stops "speaking".
  if (newState.channelId !== DISCORD_VOICE_CHANNEL_ID) speaking.delete(newState.id)
  schedulePublish()
})

// Heartbeat: re-broadcast the current roster every few seconds. Broadcasts are
// ephemeral, so a client that opens the session between events would otherwise
// see nothing until the next change; this gives it the state within a few
// seconds. It's a tiny payload and also recovers any missed event.
setInterval(() => publish(), 5000)

client.login(DISCORD_BOT_TOKEN)

// Leave the call cleanly on shutdown.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    const conn = getVoiceConnection(DISCORD_GUILD_ID)
    if (conn) conn.destroy()
    client.destroy()
    process.exit(0)
  })
}
