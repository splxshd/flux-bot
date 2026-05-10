'use strict';

const { EmbedBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

const BLUE   = '#5865F2';
const PINK   = '#ff6b9d';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const PURPLE = '#9B59B6';

// ── ,reactionsnipe ────────────────────────────────────────────────────────────
const reactionsnipe = {
  name: 'reactionsnipe',
  aliases: ['rsnipe', 'rs'],
  async execute(message) {
    const snipes = message.client._reactionSnipes?.get(message.channel.id);
    if (!snipes || snipes.length === 0)
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No removed reactions to snipe.')] });
    const s = snipes[0];
    const embed = new EmbedBuilder()
      .setColor(PINK)
      .setAuthor({ name: `${s.user?.username || 'Unknown'} removed a reaction`, iconURL: s.user?.displayAvatarURL() })
      .addFields(
        { name: '😄 Emoji',   value: s.emoji?.toString() || '?', inline: true },
        { name: '💬 Message', value: `[Jump](${s.messageUrl || '#'})`, inline: true },
      )
      .setTimestamp(s.removedAt || new Date());
    await message.reply({ embeds: [embed] });
  }
};

// ── ,reactionhistory ──────────────────────────────────────────────────────────
const reactionhistory = {
  name: 'reactionhistory',
  aliases: ['rhistory', 'rh'],
  async execute(message) {
    const snipes = message.client._reactionSnipes?.get(message.channel.id) || [];
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `#${message.channel.name} — Reaction Removal History (${snipes.length})` })
      .setDescription(snipes.length
        ? snipes.slice(0, 10).map((s, i) => `**${i + 1}.** ${s.emoji} by **${s.user?.username || '?'}**`).join('\n')
        : 'No reaction removal history.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,steal ────────────────────────────────────────────────────────────────────
const steal = {
  name: 'steal',
  aliases: ['grabemoji', 'stealemoji'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Emojis** permission.')] });

    const emojiArg = args[0];
    if (!emojiArg) return message.reply('Usage: `,steal <emoji>`');

    const match = emojiArg.match(/<a?:(\w+):(\d+)>/);
    if (!match) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Please provide a custom emoji.')] });

    const [, name, id] = match;
    const animated = emojiArg.startsWith('<a:');
    const url = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`;

    const emoji = await message.guild.emojis.create({ attachment: url, name, reason: `Stolen by ${message.author.tag}` }).catch(() => null);
    if (!emoji) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Failed to add emoji. Server may be at the limit.')] });

    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setDescription(`✅ Added emoji **${emoji.name}** ${emoji} to the server.`)
      .setThumbnail(url)
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,icon ─────────────────────────────────────────────────────────────────────
const icon = {
  name: 'icon',
  aliases: ['emojiinfo'],
  async execute(message, args) {
    const emojiArg = args[0];
    if (!emojiArg) return message.reply('Usage: `,icon <emoji>`');

    const match = emojiArg.match(/<a?:(\w+):(\d+)>/);
    if (!match) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Please provide a custom emoji.')] });

    const [, name, id] = match;
    const animated = emojiArg.startsWith('<a:');
    const url = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=512`;

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle(`:${name}:`)
      .setImage(url)
      .addFields(
        { name: '🆔 ID',       value: `\`${id}\``,         inline: true },
        { name: '📛 Name',     value: name,                  inline: true },
        { name: '🎞️ Animated', value: animated ? 'Yes' : 'No', inline: true },
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Open Image').setStyle(ButtonStyle.Link).setURL(url)
    );
    await message.reply({ embeds: [embed], components: [row] });
  }
};

// ── ,quote ────────────────────────────────────────────────────────────────────
const quote = {
  name: 'quote',
  aliases: ['quotemsg'],
  async execute(message, args) {
    const msgId = args[0];
    if (!msgId) return message.reply('Usage: `,quote <message_id or link>`');

    const id = msgId.split('/').pop();
    const target = await message.channel.messages.fetch(id).catch(() => null);
    if (!target) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Message not found in this channel.')] });

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: target.author.username, iconURL: target.author.displayAvatarURL() })
      .setDescription(target.content || '*No text content.*')
      .addFields({ name: '🔗 Source', value: `[Jump to message](${target.url})`, inline: true })
      .setTimestamp(target.createdAt);

    if (target.attachments.first()) embed.setImage(target.attachments.first().url);
    await message.reply({ embeds: [embed] });
  }
};

// ── ,setcolor ─────────────────────────────────────────────────────────────────
const setcolor = {
  name: 'setcolor',
  aliases: ['mycolor', 'namecolor'],
  async execute(message, args) {
    const hex = args[0]?.replace('#', '');
    if (!hex || !/^[0-9A-Fa-f]{6}$/.test(hex))
      return message.reply('Usage: `,setcolor <#hex>`');

    const roleName = `color-${message.author.id}`;
    let colorRole = message.guild.roles.cache.find(r => r.name === roleName);
    if (!colorRole) {
      colorRole = await message.guild.roles.create({ name: roleName, color: parseInt(hex, 16), reason: 'Name color role' }).catch(() => null);
    } else {
      await colorRole.setColor(parseInt(hex, 16)).catch(() => {});
    }
    if (!colorRole) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Failed to create color role.')] });
    await message.member.roles.add(colorRole).catch(() => {});
    const embed = new EmbedBuilder()
      .setColor(parseInt(hex, 16))
      .setDescription(`✅ Your name color has been set to **#${hex.toUpperCase()}**.`)
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,rolepersist ──────────────────────────────────────────────────────────────
const rolepersist = {
  name: 'rolepersist',
  aliases: ['rp', 'persistrole'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const member = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!member || !role) return message.reply('Usage: `,rolepersist <@user> <@role>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ **${role.name}** will persist for **${member.user.username}** when they leave and rejoin.`)] });
  }
};

// ── ,unrolepersist ────────────────────────────────────────────────────────────
const unrolepersist = {
  name: 'unrolepersist',
  aliases: ['urp'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const member = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!member || !role) return message.reply('Usage: `,unrolepersist <@user> <@role>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed role persist for **${role.name}** on **${member.user.username}**.`)] });
  }
};

// ── ,silence ─────────────────────────────────────────────────────────────────
const silence = {
  name: 'silence',
  aliases: ['suppress'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,silence <@user>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`🔕 **${member.user.username}** has been silenced.`)] });
  }
};

// ── ,unsilence ────────────────────────────────────────────────────────────────
const unsilence = {
  name: 'unsilence',
  aliases: ['unsupress'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,unsilence <@user>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`🔔 **${member.user.username}** has been unsilenced.`)] });
  }
};

// ── ,thread ───────────────────────────────────────────────────────────────────
const thread = {
  name: 'thread',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageThreads))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Threads** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'create') {
      const name = args.slice(1).join(' ');
      if (!name) return message.reply('Usage: `,thread create <name>`');
      const thr = await message.channel.threads.create({ name, reason: `Thread by ${message.author.tag}` }).catch(() => null);
      if (!thr) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Failed to create thread.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Thread **${thr.name}** created: <#${thr.id}>`)] });
    }
    if (sub === 'archive') {
      const thr = message.channel.isThread() ? message.channel : null;
      if (!thr) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Run this inside a thread.')] });
      await thr.setArchived(true).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('📦 Thread archived.')] });
    }
    if (sub === 'lock') {
      const thr = message.channel.isThread() ? message.channel : null;
      if (!thr) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Run this inside a thread.')] });
      await thr.setLocked(true).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('🔒 Thread locked.')] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('**Subcommands:** `create <name>`, `archive`, `lock`')] });
  }
};

module.exports = [reactionsnipe, reactionhistory, steal, icon, quote, setcolor, rolepersist, unrolepersist, silence, unsilence, thread];
