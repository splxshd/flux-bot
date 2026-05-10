'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const PINK   = '#ff6b9d';

function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * mult[unit];
}

const gw = {
  name: 'gw',
  aliases: ['giveaway', 'giveaways'],
  async execute(message, args) {
    const sub = args[0]?.toLowerCase();

    if (sub === 'start') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });

      const duration = args[1];
      const winners = parseInt(args[2]);
      const prize = args.slice(3).join(' ');
      if (!duration || isNaN(winners) || !prize)
        return message.reply('Usage: `,gw start <duration> <winners> <prize>` — e.g. `,gw start 1h 1 Nitro`');

      const ms = parseDuration(duration);
      if (!ms) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Invalid duration. Use format: `1h`, `30m`, `2d`')] });

      const endTime = Math.floor((Date.now() + ms) / 1000);
      const embed = new EmbedBuilder()
        .setColor(PINK)
        .setTitle('🎉 GIVEAWAY 🎉')
        .setDescription(`React with 🎉 to enter!\n\n**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${endTime}:R>`)
        .setFooter({ text: `Hosted by ${message.author.username} • ${winners} winner(s)` })
        .setTimestamp(new Date(Date.now() + ms));

      const giveawayMsg = await message.channel.send({ embeds: [embed] });
      await giveawayMsg.react('🎉');
      db.createGiveaway?.(message.guild.id, message.channel.id, giveawayMsg.id, prize, winners, endTime);
      await message.delete().catch(() => {});
      return;
    }

    if (sub === 'list') {
      const list = db.getGiveaways?.(message.guild.id) || [];
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setTitle('🎉 Active Giveaways')
        .setDescription(list.length
          ? list.map((g, i) => `**${i + 1}.** **${g.prize}** — ${g.winners} winner(s) — ends <t:${g.ends_at}:R>`).join('\n')
          : 'No active giveaways.')
        .setTimestamp()] });
    }

    if (sub === 'end') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
      const msgId = args[1];
      if (!msgId) return message.reply('Usage: `,gw end <message_id>`');
      const giveaway = db.getGiveawayByMessage?.(message.guild.id, msgId);
      if (!giveaway) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Giveaway not found.')] });
      const giveawayMsg = await message.channel.messages.fetch(msgId).catch(() => null);
      let winner = 'No entrants';
      if (giveawayMsg) {
        const reaction = giveawayMsg.reactions.cache.get('🎉');
        if (reaction) {
          const users = await reaction.users.fetch();
          const eligible = users.filter(u => !u.bot);
          if (eligible.size > 0) {
            const arr = [...eligible.values()];
            winner = arr[Math.floor(Math.random() * arr.length)];
            await message.channel.send(`🎉 Congratulations <@${winner.id}>! You won **${giveaway.prize}**!`);
          }
        }
      }
      db.endGiveaway?.(giveaway.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Giveaway ended. Winner: ${winner?.username || winner}`)] });
    }

    if (sub === 'reroll') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
      const msgId = args[1];
      if (!msgId) return message.reply('Usage: `,gw reroll <message_id> [winners]`');
      const giveawayMsg = await message.channel.messages.fetch(msgId).catch(() => null);
      if (!giveawayMsg) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Message not found.')] });
      const reaction = giveawayMsg.reactions.cache.get('🎉');
      if (!reaction) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No reactions found.')] });
      const users = await reaction.users.fetch();
      const eligible = [...users.filter(u => !u.bot).values()];
      if (!eligible.length) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No eligible entrants.')] });
      const winner = eligible[Math.floor(Math.random() * eligible.length)];
      await message.channel.send(`🎉 New winner: <@${winner.id}>! Congratulations!`);
      return;
    }

    if (sub === 'cancel') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
      const msgId = args[1];
      if (!msgId) return message.reply('Usage: `,gw cancel <message_id>`');
      db.cancelGiveaway?.(message.guild.id, msgId);
      const giveawayMsg = await message.channel.messages.fetch(msgId).catch(() => null);
      if (giveawayMsg) await giveawayMsg.delete().catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Giveaway cancelled.')] });
    }

    if (sub === 'edit') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
      const prop = args[1]?.toLowerCase();
      const id = args[2];
      const value = args.slice(3).join(' ');
      if (!prop || !id || !value) return message.reply('Usage: `,gw edit <prize|winners|duration> <message_id> <value>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Updated giveaway **${prop}** to **${value}**.`)] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
      .setAuthor({ name: '🎉 Giveaway' })
      .setDescription('**Subcommands:** `start <duration> <winners> <prize>`, `list`, `end <id>`, `reroll <id>`, `cancel <id>`, `edit <prop> <id> <value>`')
      .setTimestamp()] });
  }
};

module.exports = [gw];
