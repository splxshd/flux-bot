'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');

const GOLD = '#FFD700';
const GREY = '#2b2d31';
const RED  = '#ED4245';

function buildActiveEmbed({ prize, winners, endsAt, hostId, hostAvatarURL, color, imageUrl, giveawayId }) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: '🎉 GIVEAWAY', iconURL: hostAvatarURL || null })
    .setTitle(prize)
    .setColor(color || GOLD)
    .addFields(
      { name: '🏆 Winners', value: winners.toString(),   inline: true },
      { name: '⏰ Ends',    value: `<t:${endsAt}:R>`,   inline: true },
      { name: '🎟️ Host',   value: `<@${hostId}>`,       inline: true },
    )
    .setFooter({ text: `ID: ${giveawayId} • Click 🎉 to enter!` })
    .setTimestamp(endsAt * 1000);
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildEndedEmbed({ prize, winners, endsAt, hostId, hostAvatarURL, winnerIds, color, imageUrl, giveawayId }) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: '🎉 GIVEAWAY (ENDED)', iconURL: hostAvatarURL || null })
    .setTitle(prize)
    .setColor(GREY)
    .addFields(
      { name: '🏆 Winners', value: winners.toString(), inline: true },
      { name: '⏰ Ended',   value: `<t:${endsAt}:R>`, inline: true },
      { name: '🎟️ Host',   value: `<@${hostId}>`,     inline: true },
      {
        name: '🎊 Winner(s)',
        value: winnerIds?.length
          ? winnerIds.map(id => `<@${id}>`).join('\n')
          : 'No winners — not enough entries.',
      },
    )
    .setFooter({ text: `ID: ${giveawayId} • Giveaway ended` })
    .setTimestamp(endsAt * 1000);
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildRow(giveawayId, entryCount, ended = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway_enter_${giveawayId}`)
      .setEmoji('🎉')
      .setLabel(`Enter Giveaway${entryCount > 0 ? ` · ${entryCount}` : ''}`)
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

  const entries    = db.getEntries(giveaway.id);
  const entryCount = entries.length;
  const winnerCount = Math.min(giveaway.winners, entryCount);
  const shuffled   = [...entries].sort(() => Math.random() - 0.5);
  const winnerIds  = shuffled.slice(0, winnerCount).map(e => e.user_id);

  const hostUser = await client.users.fetch(giveaway.host_id).catch(() => null);
  const hostAvatarURL = hostUser?.displayAvatarURL() || null;

  // Edit the live giveaway message to show ended state
  if (giveaway.message_id) {
    const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
    if (msg) {
      const embed = buildEndedEmbed({
        prize:          giveaway.prize,
        winners:        giveaway.winners,
        endsAt:         giveaway.ends_at,
        hostId:         giveaway.host_id,
        hostAvatarURL,
        winnerIds,
        color:          giveaway.color,
        imageUrl:       giveaway.image_url,
        giveawayId:     giveaway.id,
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
