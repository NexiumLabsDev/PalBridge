import 'dotenv/config';
import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  REST,
  Routes,
} from 'discord.js';
import { createBridgeServer } from './bridge.js';
import { command, handlePalCommand } from './commands.js';
import { PalworldClient } from './palworld.js';
import { cleanSingleLine, parseBoolean, safeCode, truncate } from './utils.js';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  guildId: process.env.DISCORD_GUILD_ID || '',
  chatChannelId: required('PALWORLD_CHAT_CHANNEL_ID'),
  eventsChannelId: process.env.PALWORLD_EVENTS_CHANNEL_ID || '',
  adminRoleId: process.env.PALWORLD_ADMIN_ROLE_ID || '',
  allowDiscordToGameChat: parseBoolean(process.env.ALLOW_DISCORD_TO_GAME_CHAT, true),
  pollIntervalMs: Math.max(5000, Number(process.env.POLL_INTERVAL_MS) || 10000),
  registerCommandsOnStart: parseBoolean(process.env.REGISTER_COMMANDS_ON_START, true),
  bridgeBind: process.env.BRIDGE_BIND || '127.0.0.1',
  bridgePort: Number(process.env.BRIDGE_PORT) || 3009,
  bridgeSecret: required('BRIDGE_SECRET'),
};

const pal = new PalworldClient({
  baseUrl: required('PALWORLD_API_URL'),
  username: process.env.PALWORLD_API_USERNAME || 'admin',
  password: required('PALWORLD_ADMIN_PASSWORD'),
  timeoutMs: Number(process.env.PALWORLD_REQUEST_TIMEOUT_MS) || 5000,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function fetchTextChannel(channelId) {
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  return channel?.isTextBased?.() ? channel : null;
}

async function postEventEmbed(title, description, fields = []) {
  const channel = await fetchTextChannel(config.eventsChannelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .addFields(fields)
    .setFooter({ text: 'Nexium Labs • PalBridge' })
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch((error) => {
    console.warn(`[discord] Could not send event embed: ${error.message}`);
  });
}

async function audit(action, interaction, details) {
  const fields = [
    { name: 'Action', value: `\`${safeCode(action)}\``, inline: true },
    { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
  ];

  for (const [key, value] of Object.entries(details)) {
    if (value == null || value === '') continue;
    fields.push({
      name: key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
      value: truncate(String(value), 1000),
      inline: false,
    });
  }

  await postEventEmbed('Palworld Admin Action', 'A Discord administration command was executed.', fields);
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = [command.toJSON()];

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
    console.log(`[discord] Registered guild slash commands for ${config.guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    console.log('[discord] Registered global slash commands');
  }
}

const bridge = createBridgeServer({
  bind: config.bridgeBind,
  port: config.bridgePort,
  secret: config.bridgeSecret,
  logger: console,
  onEvent: async (event) => {
    if (event.event !== 'chat') return;
    const channel = await fetchTextChannel(config.chatChannelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setAuthor({ name: event.sender })
      .setDescription(truncate(event.message, 4000))
      .setFooter({ text: `${event.server} • In-game chat` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  },
});

let knownPlayers = new Map();
let presenceInitialized = false;
let apiReachable = null;
let pollRunning = false;

function playerKey(player) {
  return String(player.userId || player.playerId || player.name || '').toLowerCase();
}

async function pollPlayers() {
  if (pollRunning) return;
  pollRunning = true;

  try {
    const players = await pal.getPlayers();
    const current = new Map(players.map((p) => [playerKey(p), p]));

    if (apiReachable === false) {
      await postEventEmbed('Palworld API Online', 'The Discord bridge can reach the Palworld REST API again.');
    }
    apiReachable = true;

    if (presenceInitialized) {
      for (const [key, player] of current) {
        if (!knownPlayers.has(key)) {
          await postEventEmbed(
            'Player Joined',
            `**${truncate(player.name || 'Unknown', 80)}** joined the server.`,
            [
              { name: 'Level', value: String(player.level ?? '?'), inline: true },
              { name: 'Ping', value: `${Number(player.ping ?? 0).toFixed(0)} ms`, inline: true },
            ],
          );
        }
      }

      for (const [key, player] of knownPlayers) {
        if (!current.has(key)) {
          await postEventEmbed(
            'Player Left',
            `**${truncate(player.name || 'Unknown', 80)}** left the server.`,
          );
        }
      }
    }

    knownPlayers = current;
    presenceInitialized = true;
  } catch (error) {
    if (apiReachable === true) {
      await postEventEmbed(
        'Palworld API Unavailable',
        `The Discord bridge cannot currently query the Palworld REST API.\n\`${safeCode(error.message)}\``,
      );
    }
    apiReachable = false;
  } finally {
    pollRunning = false;
  }
}

client.once('ready', async () => {
  console.log(`[discord] Logged in as ${client.user.tag}`);

  if (config.registerCommandsOnStart) {
    try {
      await registerCommands();
    } catch (error) {
      console.error(`[discord] Slash command registration failed: ${error.stack || error}`);
    }
  }

  await pollPlayers();
  setInterval(pollPlayers, config.pollIntervalMs).unref();
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'pal') return;
  await handlePalCommand({ interaction, pal, config, audit });
});

client.on('messageCreate', async (message) => {
  if (!config.allowDiscordToGameChat) return;
  if (message.author.bot || message.channelId !== config.chatChannelId) return;
  if (!message.content?.trim()) return;

  const displayName = message.member?.displayName || message.author.displayName || message.author.username;
  const body = cleanSingleLine(message.content, 350);
  if (!body) return;

  try {
    await pal.announce(`[Discord] ${displayName}: ${body}`);
  } catch (error) {
    console.warn(`[relay] Discord -> Palworld failed: ${error.message}`);
    await message.react('⚠️').catch(() => {});
  }
});

async function shutdown(signal) {
  console.log(`[system] Received ${signal}, shutting down PalBridge...`);
  await bridge.close().catch(() => {});
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => console.error('[system] Unhandled rejection:', error));
process.on('uncaughtException', (error) => console.error('[system] Uncaught exception:', error));

await bridge.listen();
console.log(`[bridge] Listening on http://${config.bridgeBind}:${config.bridgePort}`);
await client.login(config.token);
