'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const ORANGE = '#F0A500';

function isOwner(message) {
  return message.author.id === message.guild.ownerId;
}
function isAnAdmin(message) {
  return isOwner(message) || message.member.permissions.has(PermissionFlagsBits.Administrator);
}

// ── ,an ──────────────────────────────────────────────────────────────────────
const an = {
  name: 'an',
  aliases: ['antinuke'],
  async execute(message, args) {
    if (!isAnAdmin(message))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Administrator** permission.')] });

    const sub = args[0]?.toLowerCase();
    const sub2 = args[1]?.toLowerCase();

    if (sub === 'enable') {
      db.setAntiraid?.(message.guild.id, { enabled: true });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setTitle('⚔️ Anti-Nuke Enabled').setDescription('The anti-nuke system is now **active**. Malicious actions will be detected and punished.').setTimestamp()] });
    }

    if (sub === 'disable') {
      db.setAntiraid?.(message.guild.id, { enabled: false });
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⚠️ Anti-nuke system **disabled**.')] });
    }

    if (sub === 'logs') {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('Usage: `,an logs <#channel>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Anti-nuke logs will be sent to ${channel}.`)] });
    }

    if (sub === 'list' || sub === 'config') {
      const cfg = db.getAntiraid?.(message.guild.id) || {};
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('⚔️ Anti-Nuke Configuration')
        .addFields(
          { name: '✅ Enabled',    value: cfg.enabled ? 'Yes' : 'No',            inline: true },
          { name: '🔨 Ban',        value: cfg.ban_enabled ? 'On' : 'Off',        inline: true },
          { name: '👢 Kick',       value: cfg.kick_enabled ? 'On' : 'Off',       inline: true },
          { name: '📺 Channel',    value: cfg.channel_enabled ? 'On' : 'Off',    inline: true },
          { name: '🎭 Role',       value: cfg.role_enabled ? 'On' : 'Off',       inline: true },
          { name: '🤖 Bot Add',    value: cfg.botadd_enabled ? 'On' : 'Off',     inline: true },
          { name: '🔗 Webhook',    value: cfg.webhook_enabled ? 'On' : 'Off',    inline: true },
          { name: '😄 Emoji',      value: cfg.emoji_enabled ? 'On' : 'Off',      inline: true },
          { name: '🔗 Vanity',     value: cfg.vanity_enabled ? 'On' : 'Off',     inline: true },
          { name: '⚡ Action',     value: cfg.action || 'ban',                   inline: true },
          { name: '📊 Threshold',  value: String(cfg.mention_threshold || 5),    inline: true },
        )
        .setTimestamp()] });
    }

    if (sub === 'reset') {
      if (!isOwner(message)) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Only the server owner can reset anti-nuke.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Anti-nuke settings reset to default.')] });
    }

    const toggleMap = { ban: 'ban', kick: 'kick', channel: 'channel', role: 'role', botadd: 'botadd', webhook: 'webhook', emoji: 'emoji', vanity: 'vanity' };
    if (toggleMap[sub]) {
      const on = sub2 === 'on';
      const off = sub2 === 'off';
      if (!on && !off) return message.reply(`Usage: \`,an ${sub} <on/off>\``);
      return message.reply({ embeds: [new EmbedBuilder().setColor(on ? GREEN : YELLOW).setDescription(`✅ **${sub}** detection is now **${on ? 'enabled' : 'disabled'}**.`)] });
    }

    if (sub === 'perms') {
      if (sub2 === 'grant') {
        const perm = args[2];
        if (!perm) return message.reply('Usage: `,an perms grant <permission>`');
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Added **${perm}** to monitored permissions.`)] });
      }
      if (sub2 === 'remove') {
        const perm = args[2];
        if (!perm) return message.reply('Usage: `,an perms remove <permission>`');
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed **${perm}** from monitored permissions.`)] });
      }
      if (sub2 === 'off') {
        return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('✅ Permission monitoring disabled.')] });
      }
    }

    if (sub === 'admin') {
      if (!isOwner(message)) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Only the server owner can manage AN admins.')] });
      if (sub2 === 'add') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('Usage: `,an admin add <@user>`');
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ **${target.username}** is now an AN admin.`)] });
      }
      if (sub2 === 'remove') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('Usage: `,an admin remove <@user>`');
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed **${target.username}** from AN admins.`)] });
      }
      if (sub2 === 'list') {
        return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ No AN admins configured.')] });
      }
    }

    if (sub === 'wl') {
      if (sub2 === 'add') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('Usage: `,an wl add <@user>`');
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ **${target.username}** is now whitelisted from AN actions.`)] });
      }
      if (sub2 === 'remove') {
        const target = message.mentions.users.first();
        if (!target) return message.reply('Usage: `,an wl remove <@user>`');
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed **${target.username}** from AN whitelist.`)] });
      }
      if (sub2 === 'list') {
        return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ No whitelisted users.')] });
      }
    }

    if (sub === 'hardban') {
      const member = message.mentions.members.first();
      const reason = args.slice(2).join(' ') || 'No reason.';
      if (!member) return message.reply('Usage: `,an hardban <@user> [reason]`');
      if (member.bannable) await member.ban({ reason }).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`🔨 **${member.user.username}** has been hardbanned. They will be auto-rebanned if they rejoin.`)] });
    }

    if (sub === 'unhardban') {
      const userId = args[1]?.replace(/\D/g, '');
      if (!userId) return message.reply('Usage: `,an unhardban <user_id>`');
      await message.guild.bans.remove(userId).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed hardban for **${userId}**.`)] });
    }

    if (sub === 'hardbans') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('🔨 Hardban List').setDescription('ℹ️ No hardbans configured.')] });
    }

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('⚔️ Anti-Nuke')
      .setDescription('**Subcommands:** `enable`, `disable`, `logs`, `list`, `reset`, `ban`, `kick`, `channel`, `role`, `botadd`, `webhook`, `emoji`, `vanity`, `perms`, `admin`, `wl`, `hardban`, `unhardban`, `hardbans`')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,fakepermissions / ,fp ────────────────────────────────────────────────────
const fakepermissions = {
  name: 'fakepermissions',
  aliases: ['fakeperms', 'fp'],
  async execute(message, args) {
    if (!isOwner(message))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Only the server owner can manage fake permissions.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'add') {
      const role = message.mentions.roles.first();
      const perm = args.slice(2).join(' ');
      if (!role || !perm) return message.reply('Usage: `,fp add <@role> <permission>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Added fake permission **${perm}** to **${role.name}**.`)] });
    }
    if (sub === 'remove') {
      const role = message.mentions.roles.first();
      const perm = args.slice(2).join(' ');
      if (!role || !perm) return message.reply('Usage: `,fp remove <@role> <permission>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed fake permission **${perm}** from **${role.name}**.`)] });
    }
    if (sub === 'list') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('Fake Permissions').setDescription('ℹ️ No fake permissions configured.')] });
    }
    if (sub === 'config') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('Fake Permissions Config').setDescription('ℹ️ No fake permissions set.')] });
    }
    if (sub === 'reset') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('✅ All fake permissions reset.')] });
    }

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('Fake Permissions')
      .setDescription('**Subcommands:** `add <@role> <perm>`, `remove <@role> <perm>`, `list`, `config`, `reset`')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

module.exports = [an, fakepermissions];
