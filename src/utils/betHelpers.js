'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');

const OPTION_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

function fmtCoins(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.floor(n));
}

function buildBetEmbed(bet, s) {
  const options   = JSON.parse(bet.options_json);
  const totals    = db.getBetTotals(bet.id);
  const counts    = db.getBetBettorCounts(bet.id);
  const totalPool = Object.values(totals).reduce((a, b) => a + b, 0);

  const color = bet.status === 'open'     ? '#5865F2'
    : bet.status === 'closed'   ? '#FEE75C'
    : bet.status === 'resolved' ? '#F1C40F'
    : '#ED4245';

  const statusLine = bet.status === 'open'
    ? '🟢 **Open** — click an option below to place your bet!'
    : bet.status === 'closed'
    ? '🟡 **Closed** — awaiting result...'
    : bet.status === 'resolved'
    ? `✅ **Resolved** — **${options[bet.winner_option]}** won!`
    : '❌ **Cancelled** — all bets have been refunded.';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎰 Bet #${bet.id} — ${bet.question}`)
    .setDescription(statusLine)
    .setFooter({ text: `Pool: ${fmtCoins(totalPool)} ${s.currency_emoji} • flux betting` })
    .setTimestamp();

  for (let i = 0; i < options.length; i++) {
    const amt  = totals[i] || 0;
    const cnt  = counts[i] || 0;
    const pct  = totalPool > 0 ? ((amt / totalPool) * 100).toFixed(1) : '0.0';
    const isWin = bet.status === 'resolved' && bet.winner_option === i;
    embed.addFields({
      name:   `${OPTION_EMOJIS[i]} ${options[i]}${isWin ? ' 🏆' : ''}`,
      value:  `**${fmtCoins(amt)}** ${s.currency_emoji}\n${cnt} bettor${cnt !== 1 ? 's' : ''} · ${pct}%`,
      inline: true,
    });
  }

  return embed;
}

function buildBetRow(betId, options, disabled = false) {
  const btns = options.slice(0, 4).map((opt, i) =>
    new ButtonBuilder()
      .setCustomId(`bet_place_${betId}_${i}`)
      .setLabel(opt.slice(0, 20))
      .setEmoji(OPTION_EMOJIS[i])
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled)
  );
  btns.push(
    new ButtonBuilder()
      .setCustomId(`bet_remove_${betId}`)
      .setLabel('Remove Bet')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
  return new ActionRowBuilder().addComponents(btns);
}

async function refreshBetMessage(client, bet, s) {
  if (!bet.channel_id || !bet.message_id) return;
  try {
    const channel = await client.channels.fetch(bet.channel_id).catch(() => null);
    if (!channel) return;
    const msg = await channel.messages.fetch(bet.message_id).catch(() => null);
    if (!msg) return;
    const options  = JSON.parse(bet.options_json);
    const disabled = bet.status !== 'open';
    await msg.edit({
      embeds:     [buildBetEmbed(bet, s)],
      components: disabled ? [] : [buildBetRow(bet.id, options)],
    });
  } catch (_) {}
}

module.exports = { buildBetEmbed, buildBetRow, refreshBetMessage, fmtCoins, OPTION_EMOJIS };
