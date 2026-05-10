'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const GREEN = '#57F287';
const RED   = '#ED4245';
const YELLOW = '#FEE75C';

async function bulkDelete(message, filterFn, limit = 100, label = '') {
  const msgs = await message.channel.messages.fetch({ limit: Math.min(limit, 100) }).catch(() => null);
  if (!msgs) return 0;
  const filtered = filterFn ? msgs.filter(filterFn) : msgs;
  const deleted = await message.channel.bulkDelete(filtered, true).catch(() => null);
  const count = deleted?.size || 0;
  const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`🗑️ Deleted **${count}** messages${label ? ` (${label})` : ''}.`)] });
  setTimeout(() => reply.delete().catch(() => {}), 3000);
  return count;
}

const purge = {
  name: 'purge',
  aliases: ['c', 'prune', 'clear'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });

    const sub = args[0]?.toLowerCase();
    const amount = parseInt(args[0]) || 10;

    await message.delete().catch(() => {});

    // ,purge <number>
    if (!isNaN(parseInt(args[0]))) {
      if (amount < 1 || amount > 100)
        return message.channel.send({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Amount must be 1–100.')] });
      const msgs = await message.channel.messages.fetch({ limit: amount }).catch(() => null);
      if (msgs) await message.channel.bulkDelete(msgs, true).catch(() => {});
      const r = await message.channel.send({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`🗑️ Deleted **${msgs?.size || amount}** messages.`)] });
      setTimeout(() => r.delete().catch(() => {}), 3000);
      return;
    }

    const limit = parseInt(args[1]) || 50;

    if (sub === 'user') {
      const target = message.mentions.users.first();
      if (!target) return message.channel.send('Usage: `,purge user <@user> [amount]`');
      await bulkDelete(message, m => m.author.id === target.id, limit, `from ${target.username}`);
      return;
    }
    if (sub === 'bots') {
      await bulkDelete(message, m => m.author.bot, limit, 'bots only');
      return;
    }
    if (sub === 'humans') {
      await bulkDelete(message, m => !m.author.bot, limit, 'humans only');
      return;
    }
    if (sub === 'embeds') {
      await bulkDelete(message, m => m.embeds.length > 0, limit, 'embeds');
      return;
    }
    if (sub === 'files' || sub === 'attachments') {
      await bulkDelete(message, m => m.attachments.size > 0, limit, 'files');
      return;
    }
    if (sub === 'images') {
      await bulkDelete(message, m => m.attachments.some(a => a.contentType?.startsWith('image/')), limit, 'images');
      return;
    }
    if (sub === 'links') {
      await bulkDelete(message, m => /https?:\/\//.test(m.content), limit, 'links');
      return;
    }
    if (sub === 'emoji') {
      await bulkDelete(message, m => /<a?:\w+:\d+>/.test(m.content), limit, 'custom emoji');
      return;
    }
    if (sub === 'emote') {
      await bulkDelete(message, m => /<a?:\w+:\d+>/.test(m.content) || /\p{Emoji}/u.test(m.content), limit, 'emotes');
      return;
    }
    if (sub === 'stickers') {
      await bulkDelete(message, m => m.stickers.size > 0, limit, 'stickers');
      return;
    }
    if (sub === 'reactions') {
      const msgs = await message.channel.messages.fetch({ limit }).catch(() => null);
      if (msgs) for (const [, m] of msgs) await m.reactions.removeAll().catch(() => {});
      const r = await message.channel.send({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`🗑️ Cleared reactions from **${msgs?.size || 0}** messages.`)] });
      setTimeout(() => r.delete().catch(() => {}), 3000);
      return;
    }
    if (sub === 'contains') {
      const text = args[1];
      const n = parseInt(args[2]) || 50;
      if (!text) return message.channel.send('Usage: `,purge contains <text> [amount]`');
      await bulkDelete(message, m => m.content.toLowerCase().includes(text.toLowerCase()), n, `containing "${text}"`);
      return;
    }
    if (sub === 'startswith') {
      const text = args[1];
      if (!text) return message.channel.send('Usage: `,purge startswith <text> [amount]`');
      await bulkDelete(message, m => m.content.toLowerCase().startsWith(text.toLowerCase()), limit, `starting with "${text}"`);
      return;
    }
    if (sub === 'endswith') {
      const text = args[1];
      if (!text) return message.channel.send('Usage: `,purge endswith <text> [amount]`');
      await bulkDelete(message, m => m.content.toLowerCase().endsWith(text.toLowerCase()), limit, `ending with "${text}"`);
      return;
    }
    if (sub === 'mentions') {
      await bulkDelete(message, m => m.mentions.users.size > 0 || m.mentions.roles.size > 0, limit, 'mentions');
      return;
    }
    if (sub === 'webhooks') {
      await bulkDelete(message, m => !!m.webhookId, limit, 'webhooks');
      return;
    }
    if (sub === 'before') {
      const msgId = args[1];
      if (!msgId) return message.channel.send('Usage: `,purge before <message_id> [amount]`');
      const msgs = await message.channel.messages.fetch({ limit, before: msgId }).catch(() => null);
      if (msgs) await message.channel.bulkDelete(msgs, true).catch(() => {});
      const r = await message.channel.send({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`🗑️ Deleted **${msgs?.size || 0}** messages before that point.`)] });
      setTimeout(() => r.delete().catch(() => {}), 3000);
      return;
    }
    if (sub === 'after') {
      const msgId = args[1];
      if (!msgId) return message.channel.send('Usage: `,purge after <message_id> [amount]`');
      const msgs = await message.channel.messages.fetch({ limit, after: msgId }).catch(() => null);
      if (msgs) await message.channel.bulkDelete(msgs, true).catch(() => {});
      const r = await message.channel.send({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`🗑️ Deleted **${msgs?.size || 0}** messages after that point.`)] });
      setTimeout(() => r.delete().catch(() => {}), 3000);
      return;
    }
    if (sub === 'between') {
      const id1 = args[1], id2 = args[2];
      if (!id1 || !id2) return message.channel.send('Usage: `,purge between <id1> <id2>`');
      const msgs = await message.channel.messages.fetch({ limit: 100, after: id1, before: id2 }).catch(() => null);
      if (msgs) await message.channel.bulkDelete(msgs, true).catch(() => {});
      const r = await message.channel.send({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`🗑️ Deleted **${msgs?.size || 0}** messages between those points.`)] });
      setTimeout(() => r.delete().catch(() => {}), 3000);
      return;
    }
    if (sub === 'upto') {
      const msgId = args[1];
      if (!msgId) return message.channel.send('Usage: `,purge upto <message_id>`');
      const msgs = await message.channel.messages.fetch({ limit: 100, before: msgId }).catch(() => null);
      if (msgs) await message.channel.bulkDelete(msgs, true).catch(() => {});
      const r = await message.channel.send({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`🗑️ Deleted **${msgs?.size || 0}** messages up to that point.`)] });
      setTimeout(() => r.delete().catch(() => {}), 3000);
      return;
    }
    if (sub === 'activity') {
      await bulkDelete(message, m => m.type !== 0 && m.type !== 19, limit, 'activity/system');
      return;
    }

    return message.channel.send({ embeds: [new EmbedBuilder().setColor(YELLOW)
      .setTitle('🗑️ Purge')
      .setDescription('**Usage:** `,purge <amount>` or `,purge <filter> [amount]`\n\n**Filters:** `user`, `bots`, `humans`, `embeds`, `files`, `images`, `links`, `emoji`, `stickers`, `reactions`, `contains`, `startswith`, `endswith`, `mentions`, `webhooks`, `before`, `after`, `between`, `upto`, `activity`')] });
  }
};

module.exports = [purge];
