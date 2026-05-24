'use strict';

const { EmbedBuilder } = require('discord.js');
const db = require('../database');
const { buildBetEmbed, buildBetRow, refreshBetMessage, fmtCoins } = require('../utils/betHelpers');

const RED    = '#ED4245';
const GREEN  = '#57F287';
const YELLOW = '#FEE75C';
const GOLD   = '#F1C40F';
const BLUE   = '#5865F2';

const bet = {
  name: 'bet',
  aliases: ['bets'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const sub     = args[0]?.toLowerCase();
    const s       = db.getEcoSettings(guildId);
    const canManage = message.member?.permissions?.has('ManageGuild');

    // ── CREATE ─────────────────────────────────────────────────────────────────
    if (sub === 'create') {
      if (!canManage)
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** to create bets.')] });

      const raw     = args.slice(1).join(' ');
      const parts   = raw.split('|').map(p => p.trim()).filter(Boolean);
      const question = parts[0];
      const options  = parts.slice(1);

      if (!question)
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Usage: `,bet create <question> | <opt1> | <opt2> [| opt3] [| opt4]`')] });
      if (options.length < 2 || options.length > 4)
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Need **2–4 options** separated by `|`.')] });

      const betId  = db.createBet(guildId, message.author.id, question, options);
      const betRow = db.getBet(betId);
      const sent   = await message.channel.send({
        embeds:     [buildBetEmbed(betRow, s)],
        components: [buildBetRow(betId, options)],
      });
      db.updateBetMessage(betId, message.channel.id, sent.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Bet **#${betId}** created!`)] });
    }

    // ── CLOSE ──────────────────────────────────────────────────────────────────
    if (sub === 'close') {
      if (!canManage)
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No permission.')] });

      const betId  = parseInt(args[1]);
      if (!betId) return message.reply('❌ Usage: `,bet close <id>`');
      const betRow = db.getBet(betId);
      if (!betRow || betRow.guild_id !== guildId)
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Bet not found.')] });
      if (betRow.status !== 'open')
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Bet is not open.')] });

      db.updateBetStatus(betId, 'closed');
      await refreshBetMessage(message.client, db.getBet(betId), s);
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
        .setDescription(`🟡 Bet **#${betId}** closed. Use \`,bet resolve ${betId} <1/${JSON.parse(betRow.options_json).length}>\` to pay out.`)] });
    }

    // ── RESOLVE ────────────────────────────────────────────────────────────────
    if (sub === 'resolve') {
      if (!canManage)
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No permission.')] });

      const betId  = parseInt(args[1]);
      const optNum = parseInt(args[2]); // 1-indexed
      if (!betId || isNaN(optNum)) return message.reply('❌ Usage: `,bet resolve <id> <option_number>`');

      const betRow = db.getBet(betId);
      if (!betRow || betRow.guild_id !== guildId)
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Bet not found.')] });
      if (betRow.status === 'resolved')
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Already resolved.')] });
      if (betRow.status === 'cancelled')
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Bet was cancelled.')] });

      const options = JSON.parse(betRow.options_json);
      const optIdx  = optNum - 1;
      if (optIdx < 0 || optIdx >= options.length)
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ Invalid option. Choose 1–${options.length}.`)] });

      const entries    = db.getBetEntries(betId);
      const totals     = db.getBetTotals(betId);
      const totalPool  = Object.values(totals).reduce((a, b) => a + b, 0);
      const winnerPool = totals[optIdx] || 0;
      const winners    = entries.filter(e => e.option_index === optIdx);

      if (winners.length === 0 && entries.length > 0) {
        // No one picked the winner — refund everyone
        for (const e of entries) db.addWallet(guildId, e.user_id, e.amount);
        db.setBetWinner(betId, optIdx);
        await refreshBetMessage(message.client, db.getBet(betId), s);
        return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
          .setTitle(`🎰 Bet #${betId} Resolved — ${options[optIdx]} wins!`)
          .setDescription('No one bet on the winning option — all bets refunded.')] });
      }

      // Pay out winners proportionally
      for (const w of winners) {
        const payout = Math.floor((w.amount / winnerPool) * totalPool);
        if (payout > 0) db.addWallet(guildId, w.user_id, payout);
      }

      db.setBetWinner(betId, optIdx);
      await refreshBetMessage(message.client, db.getBet(betId), s);

      const payoutLines = winners.map(w => {
        const payout = Math.floor((w.amount / winnerPool) * totalPool);
        return `<@${w.user_id}> bet **${fmtCoins(w.amount)}** → 💰 **${fmtCoins(payout)} ${s.currency_emoji}**`;
      }).join('\n');

      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(GOLD)
        .setTitle(`🏆 Bet #${betId} Resolved — ${options[optIdx]} wins!`)
        .setDescription(payoutLines || 'No winners.')
        .addFields(
          { name: '🏆 Winning Option', value: options[optIdx],                               inline: true },
          { name: '💰 Total Pool',     value: `${fmtCoins(totalPool)} ${s.currency_emoji}`, inline: true },
          { name: '🎉 Winners',        value: `${winners.length}`,                           inline: true },
        )
        .setFooter({ text: 'flux betting' })
        .setTimestamp()
      ]});
    }

    // ── CANCEL ─────────────────────────────────────────────────────────────────
    if (sub === 'cancel') {
      if (!canManage)
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No permission.')] });

      const betId  = parseInt(args[1]);
      if (!betId) return message.reply('❌ Usage: `,bet cancel <id>`');
      const betRow = db.getBet(betId);
      if (!betRow || betRow.guild_id !== guildId)
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Bet not found.')] });
      if (betRow.status === 'resolved' || betRow.status === 'cancelled')
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Bet is already finished.')] });

      const entries = db.getBetEntries(betId);
      for (const e of entries) db.addWallet(guildId, e.user_id, e.amount);

      db.updateBetStatus(betId, 'cancelled');
      await refreshBetMessage(message.client, db.getBet(betId), s);
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ Bet **#${betId}** cancelled. **${entries.length}** bets refunded.`)] });
    }

    // ── LIST ───────────────────────────────────────────────────────────────────
    if (!sub || sub === 'list') {
      const activeBets = db.getActiveBets(guildId);
      if (!activeBets.length)
        return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('📭 No active bets right now.')] });

      const lines = activeBets.map(b => {
        const pool = Object.values(db.getBetTotals(b.id)).reduce((a, v) => a + v, 0);
        const cnt  = db.getBetEntries(b.id).length;
        return `**#${b.id}** — ${b.question}\nPool: **${fmtCoins(pool)} ${s.currency_emoji}** · ${cnt} bettor${cnt !== 1 ? 's' : ''}`;
      }).join('\n\n');

      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setTitle('🎰 Active Bets').setDescription(lines).setFooter({ text: 'flux betting' })] });
    }

    // ── HELP ───────────────────────────────────────────────────────────────────
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🎰 Bet Commands')
      .setDescription(
        '`,bet create <question> | <opt1> | <opt2>`\n> Create a new bet (requires Manage Server)\n\n' +
        '`,bet close <id>`\n> Stop accepting new bets\n\n' +
        '`,bet resolve <id> <option_number>`\n> Declare the winner & pay out\n\n' +
        '`,bet cancel <id>`\n> Cancel & refund everyone\n\n' +
        '`,bet list`\n> Show all active bets'
      )
      .setFooter({ text: 'flux betting' })
    ]});
  },
};

module.exports = [bet];
