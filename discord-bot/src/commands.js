import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { cleanSingleLine, formatDuration, safeCode, truncate } from './utils.js';

export const command = new SlashCommandBuilder()
  .setName('pal')
  .setDescription('Palworld server bridge and administration')
  .addSubcommand((sub) =>
    sub.setName('help').setDescription('Show available PalBridge commands'))
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('Show Palworld server status and metrics'))
  .addSubcommand((sub) =>
    sub.setName('players').setDescription('List online Palworld players'))
  .addSubcommand((sub) =>
    sub
      .setName('announce')
      .setDescription('Broadcast a message to the Palworld server')
      .addStringOption((opt) =>
        opt.setName('message').setDescription('Announcement text').setRequired(true).setMaxLength(300)))
  .addSubcommand((sub) =>
    sub
      .setName('kick')
      .setDescription('Kick an online Palworld player')
      .addStringOption((opt) =>
        opt.setName('player').setDescription('Exact player name or userId').setRequired(true).setMaxLength(100))
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason shown to the player').setMaxLength(250)))
  .addSubcommand((sub) =>
    sub
      .setName('ban')
      .setDescription('Ban an online Palworld player')
      .addStringOption((opt) =>
        opt.setName('player').setDescription('Exact player name or userId').setRequired(true).setMaxLength(100))
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason shown to the player').setMaxLength(250)))
  .addSubcommand((sub) =>
    sub
      .setName('unban')
      .setDescription('Unban a Palworld userId')
      .addStringOption((opt) =>
        opt.setName('userid').setDescription('Palworld REST userId').setRequired(true).setMaxLength(100)))
  .addSubcommand((sub) =>
    sub.setName('save').setDescription('Force-save the Palworld world'))
  .addSubcommand((sub) =>
    sub
      .setName('shutdown')
      .setDescription('Save, announce, and gracefully shut down the server')
      .addIntegerOption((opt) =>
        opt
          .setName('seconds')
          .setDescription('Delay before shutdown (5-3600 seconds)')
          .setRequired(true)
          .setMinValue(5)
          .setMaxValue(3600))
      .addStringOption((opt) =>
        opt.setName('message').setDescription('Shutdown announcement').setMaxLength(250)));

function isAdmin(interaction, adminRoleId) {
  if (!interaction.inGuild()) return false;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (!adminRoleId) return false;

  const roles = interaction.member?.roles;
  if (roles?.cache?.has) return roles.cache.has(adminRoleId);
  if (Array.isArray(roles)) return roles.includes(adminRoleId);
  return false;
}

function adminOnly(subcommand) {
  return new Set(['announce', 'kick', 'ban', 'unban', 'save', 'shutdown']).has(subcommand);
}

function helpEmbed() {
  return new EmbedBuilder()
    .setTitle('Nexium PalBridge')
    .setDescription('Discord ↔ Palworld integration by **Nexium Labs**.')
    .addFields(
      { name: 'Public', value: '`/pal status` · `/pal players` · `/pal help`' },
      {
        name: 'Admin',
        value: '`/pal announce` · `/pal kick` · `/pal ban` · `/pal unban` · `/pal save` · `/pal shutdown`',
      },
    )
    .setFooter({ text: 'Nexium Labs • PalBridge' })
    .setTimestamp();
}

export async function handlePalCommand({ interaction, pal, config, audit }) {
  const sub = interaction.options.getSubcommand();

  if (adminOnly(sub) && !isAdmin(interaction, config.adminRoleId)) {
    await interaction.reply({
      content: 'You do not have permission to use that Palworld administration command.',
      ephemeral: true,
    });
    return;
  }

  if (sub === 'help') {
    await interaction.reply({ embeds: [helpEmbed()], ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: adminOnly(sub) });

  try {
    if (sub === 'status') {
      const [info, metrics] = await Promise.all([pal.getInfo(), pal.getMetrics()]);
      const embed = new EmbedBuilder()
        .setTitle(info.servername || 'Palworld Server')
        .setDescription(truncate(info.description || 'Server is online.', 500))
        .addFields(
          { name: 'Players', value: `${metrics.currentplayernum ?? '?'} / ${metrics.maxplayernum ?? '?'}`, inline: true },
          { name: 'Server FPS', value: String(metrics.serverfps ?? '?'), inline: true },
          { name: 'Frame Time', value: `${Number(metrics.serverframetime ?? 0).toFixed(2)} ms`, inline: true },
          { name: 'Uptime', value: formatDuration(metrics.uptime), inline: true },
          { name: 'World Day', value: String(metrics.days ?? '?'), inline: true },
          { name: 'Base Camps', value: String(metrics.basecampnum ?? '?'), inline: true },
          { name: 'Game Version', value: safeCode(info.version || 'Unknown'), inline: true },
        )
        .setFooter({ text: 'Nexium Labs • PalBridge' })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'players') {
      const players = await pal.getPlayers();
      if (!players.length) {
        await interaction.editReply('No players are currently online.');
        return;
      }

      const lines = players.slice(0, 25).map((p, i) => {
        const ping = Number.isFinite(Number(p.ping)) ? `${Number(p.ping).toFixed(0)}ms` : '?';
        return `**${i + 1}. ${truncate(p.name || 'Unknown', 40)}** — Lv.${p.level ?? '?'} — ${ping}`;
      });
      if (players.length > 25) lines.push(`…and ${players.length - 25} more.`);

      const embed = new EmbedBuilder()
        .setTitle(`Online Players (${players.length})`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Nexium Labs • PalBridge' })
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'announce') {
      const message = cleanSingleLine(interaction.options.getString('message', true), 300);
      await pal.announce(message);
      await interaction.editReply('Announcement sent to Palworld.');
      await audit('announce', interaction, { message });
      return;
    }

    if (sub === 'kick' || sub === 'ban') {
      const target = interaction.options.getString('player', true);
      const reason = cleanSingleLine(interaction.options.getString('reason') || '', 250);
      const player = await pal.resolveOnlinePlayer(target);

      if (sub === 'kick') await pal.kick(player.userId, reason);
      else await pal.ban(player.userId, reason);

      await interaction.editReply(`${sub === 'kick' ? 'Kicked' : 'Banned'} **${player.name}**.`);
      await audit(sub, interaction, {
        player: player.name,
        userId: player.userId,
        reason: reason || 'No reason provided',
      });
      return;
    }

    if (sub === 'unban') {
      const userId = cleanSingleLine(interaction.options.getString('userid', true), 100);
      await pal.unban(userId);
      await interaction.editReply(`Unbanned \`${safeCode(userId)}\`.`);
      await audit('unban', interaction, { userId });
      return;
    }

    if (sub === 'save') {
      await pal.save();
      await interaction.editReply('World save requested successfully.');
      await audit('save', interaction, {});
      return;
    }

    if (sub === 'shutdown') {
      const seconds = interaction.options.getInteger('seconds', true);
      const supplied = interaction.options.getString('message');
      const message = cleanSingleLine(
        supplied || `Server shutting down in ${seconds} seconds.`,
        250,
      );

      // Safer default: explicitly save before asking Palworld to shut down.
      await pal.save();
      await pal.shutdown(seconds, message);
      await interaction.editReply(`World saved. Graceful shutdown scheduled in **${seconds}s**.`);
      await audit('shutdown', interaction, { seconds, message });
      return;
    }
  } catch (error) {
    const message = error?.code === 'AUTH'
      ? 'Palworld REST authentication failed. Check PALWORLD_ADMIN_PASSWORD.'
      : cleanSingleLine(error?.message || 'Unknown Palworld API error.', 500);
    await interaction.editReply(`Command failed: ${message}`);
  }
}
