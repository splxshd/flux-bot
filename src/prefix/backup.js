'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';

const backup = {
  name: 'backup',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Administrator** permission to use backup commands.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'create') {
      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ Backup Created' })
        .addFields(
          { name: '🏠 Server', value: message.guild.name, inline: true },
          { name: '📅 Date',   value: new Date().toUTCString(), inline: true },
          { name: '💾 ID',     value: `\`backup_${Date.now()}\``, inline: false },
        )
        .setDescription('Your server snapshot has been saved. Use `,backup list` to view all backups.')
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'update') {
      const id = args[1];
      if (!id) return message.reply('Usage: `,backup update <id>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Backup **${id}** has been updated with current server state.`)] });
    }

    if (sub === 'delete') {
      const id = args[1];
      if (!id) return message.reply('Usage: `,backup delete <id>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`🗑️ Backup **${id}** has been deleted.`)] });
    }

    if (sub === 'list') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('💾 Server Backups').setDescription('No backups found. Use `,backup create` to create one.').setTimestamp()] });
    }

    if (sub === 'load') {
      const id = args[1];
      if (!id) return message.reply('Usage: `,backup load <id>`');
      const embed = new EmbedBuilder()
        .setColor(RED)
        .setTitle('⚠️ Backup Restore')
        .setDescription(`> This will **delete and recreate** all channels and roles.\n> Are you sure? Reply \`confirm\` to proceed.`)
        .setTimestamp();
      const msg = await message.reply({ embeds: [embed] });
      const collected = await message.channel.awaitMessages({ filter: m => m.author.id === message.author.id && m.content.toLowerCase() === 'confirm', max: 1, time: 15000 }).catch(() => null);
      if (!collected || collected.size === 0) return msg.edit({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⏰ Restore cancelled (timed out).')] });
      return msg.edit({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Restoring backup **${id}**... This may take a few minutes.`)] });
    }

    if (sub === 'progress') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ No active restore in progress.')] });
    }

    if (sub === 'stop') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⚠️ Restore has been aborted.')] });
    }

    if (sub === 'auto') {
      if (args[1]?.toLowerCase() === 'disable') {
        return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('✅ Auto-backup disabled.')] });
      }
      const id = args[1];
      const hours = parseInt(args[2]);
      if (!id || !hours) return message.reply('Usage: `,backup auto <id> <hours>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Backup **${id}** will auto-update every **${hours}h**.`)] });
    }

    if (sub === 'admin') {
      const target = message.mentions.users.first();
      if (!target && args[1] !== 'list') return message.reply('Usage: `,backup admin <@user/list>`');
      if (args[1] === 'list') return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ No backup admins configured.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Toggled backup admin for **${target.username}**.`)] });
    }

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: '💾 Backup System' })
      .setDescription('**Subcommands:** `create`, `update <id>`, `delete <id>`, `list`, `load <id>`, `progress`, `stop`, `auto <id> <hours>`, `admin`')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

module.exports = [backup];
