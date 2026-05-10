'use strict';

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const db = require('../database');
const { applyMuteOverwriteToChannel } = require('../utils/muteRole');

module.exports = (client) => {
  client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;

    // Apply Muted role overwrites to new channels
    await applyMuteOverwriteToChannel(channel.guild, channel);

    // Ticket watcher: check if this channel's parent is watched
    if (channel.parentId) {
      const watchers = db.getTicketWatchersByCategory(channel.guild.id, channel.parentId);
      if (watchers.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        for (const watcher of watchers) {
          try {
            const embed = new EmbedBuilder()
              .setTitle(watcher.title || (watcher.type === 'support' ? '🎫 Support Request' : '💸 Replacement / Refund Request'))
              .setDescription(watcher.description || (watcher.type === 'support'
                ? '**Please fill in the following:**\n\n• Username\n• Order ID\n• Product\n• Issue\n• Screenshots/Proof'
                : '**Please fill in the following:**\n\n• Username\n• Order ID\n• Product\n• Reason (replacement/refund)\n• Issue description\n• Proof'))
              .setColor(watcher.color || (watcher.type === 'support' ? '#5865F2' : '#ED4245'));

            let button;
            if (watcher.button_url) {
              button = new ButtonBuilder()
                .setLabel(watcher.button_label || 'Open Form')
                .setURL(watcher.button_url)
                .setStyle(ButtonStyle.Link);
            } else {
              button = new ButtonBuilder()
                .setLabel(watcher.button_label || 'Submit')
                .setCustomId('watcher_form_placeholder')
                .setStyle(ButtonStyle.Primary);
            }

            const row = new ActionRowBuilder().addComponents(button);
            await channel.send({ embeds: [embed], components: [row] });
          } catch (e) {
            console.error('[channelCreate:watcher]', e);
          }
        }
      }
    }
  });
};
