'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');

const GOLD = '#FFD700';
const GREY = '#2b2d31';
const RED  = '#ED4245';

function buildActiveEmbed({ prize, winners, endsAt, hostId, color, imageUrl }) {
  const embed = new EmbedBuilder()
    .setTitle(prize)
    .setColor(color || GOLD)
    .setDescription(
      `Click 🎉 button to enter!\n` +
      `Winners: ${winners}\n` +
      `Hosted by: <@${hostId}>\n` +
      `Ends in: <t:${endsAt}:R>`
    )
    .setFooter({ text: 'Ends at •' })
    .setTimestamp(endsAt * 1000);
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildEndedEmbed({ prize, winners, endsAt, hostId, winnerIds, color, imageUrl }) {
  const winnerText = winnerIds?.length
    ? winnerIds.map(id => `<@${id}>`).join('\n')
    : 'No winners — not enough entries.';

  const embed = new EmbedBuilder()
    .setTitle(prize)
    .setColor(GREY)
    .setDescription(
      `Giveaway ended!\n` +
      `Winners: ${winners}\n` +
      `Hosted by: <@${hostId}>\n` +
      `Ended: <t:${endsAt}:R>\n\n` +
      `**Winner(s):**\n${winnerText}`
    )
    .setFooter({ text: 'Ended at •' })
    .setTimestamp(endsAt * 1000);
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildRow(giveawayId, entryCount, ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_enter_${giveawayId}`)
      .setEmoji('🎉')
      .setLabel(`${entryCount}`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(ended),
    new ButtonBuilder()
      .setCustomId(`giveaway_participants_${giveawayId}`)
      .setEmoji('👥')
      .setLabel('Participants')
      .setStyle(ButtonStyle.Secondary),
  );
}

async function processGiveawayEnd(client, giveaway) {
  const guild   = client.guilds.cache.get(giveaway.guild_id);
  if (!guild) return [];
  const channel = guild.channels.cache.get(giveaway.channel_id);
  if (!channel) return [];

  const entries     = db.getEntries(giveaway.id);
  const entryCount  = entries.length;
  const winnerCount = Math.min(giveaway.winners, entryCount);
  const shuffled    = [...entries].sort(() => Math.random() - 0.5);
  const winnerIds   = shuffled.slice(0, winnerCount).map(e => e.user_id);

  // Edit the live giveaway message to show ended state
  if (giveaway.message_id) {
    const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
    if (msg) {
      const embed = buildEndedEmbed({
        prize:    giveaway.prize,
        winners:  giveaway.winners,
        endsAt:   giveaway.ends_at,
        hostId:   giveaway.host_id,
        winnerIds,
        color:    giveaway.color,
        imageUrl: giveaway.image_url,
      });
      const row = buildRow(giveaway.id, entryCount, true);
      await msg.edit({ embeds: [embed], components: [row] }).catch(() => {});
    }
  }

  // Send winner announcement
  if (winnerIds.length > 0) {
    await channel.send({
      content: winnerIds.map(id => `<@${id}>`).join(' '),
      embeds: [new EmbedBuilder()
        .setColor(GOLD)
        .setDescription(
          `🎉 **${giveaway.prize}** — Congratulations to our winner${winnerIds.length > 1 ? 's' : ''}!\n` +
          winnerIds.map(id => `<@${id}>`).join('\n')
        )
        .setTimestamp()
      ],
    }).catch(() => {});
  } else {
    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(RED)
        .setDescription(`😢 **${giveaway.prize}** — Giveaway ended with no entries.`)
        .setTimestamp()
      ],
    }).catch(() => {});
  }

  return winnerIds;
}

module.exports = { buildActiveEmbed, buildEndedEmbed, buildRow, processGiveawayEnd, GOLD };
