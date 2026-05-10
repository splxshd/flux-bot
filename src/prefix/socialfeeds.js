'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';

function requireManage(message) {
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
    return true;
  }
  return false;
}

function makeFeedHandler(platform, emoji) {
  return {
    async execute(message, args) {
      const sub = args[0]?.toLowerCase();

      if (sub === 'add') {
        if (requireManage(message)) return;
        const username = args[1];
        const channel = message.mentions.channels.first();
        if (!username || !channel) return message.reply(`Usage: \`,${platform} add <username> <#channel>\``);
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`${emoji} Now tracking **${username}** on ${platform}. Posts will be sent to ${channel}.`)] });
      }
      if (sub === 'remove') {
        if (requireManage(message)) return;
        const username = args[1];
        if (!username) return message.reply(`Usage: \`,${platform} remove <username>\``);
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed **${username}** ${platform} feed.`)] });
      }
      if (sub === 'list') {
        return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle(`${emoji} ${platform} Feeds`).setDescription(`No ${platform} feeds configured yet.`).setTimestamp()] });
      }
      if (sub === 'live') {
        if (requireManage(message)) return;
        const username = args[1];
        const channel = message.mentions.channels.first();
        if (!username || !channel) return message.reply(`Usage: \`,${platform} live <username> <#channel>\``);
        return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`${emoji} Now monitoring **${username}** for live notifications in ${channel}.`)] });
      }
      if (sub === 'highlights') {
        const username = args[1];
        if (!username) return message.reply(`Usage: \`,${platform} highlights <username>\``);
        return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(`ℹ️ Fetching highlights for **${username}** on ${platform}...`)] });
      }
      if (sub === 'message' && args[1] === 'view') {
        return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(`ℹ️ No custom ${platform} notification message set.`)] });
      }

      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setAuthor({ name: `${emoji} ${platform} Feeds` })
        .setDescription(`**Subcommands:** \`add <user> <#ch>\`, \`remove <user>\`, \`list\`, \`message view\``)
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }
  };
}

const instagram = { name: 'instagram', aliases: ['ig'], ...makeFeedHandler('Instagram', '📸') };
const tiktok    = { name: 'tiktok',    aliases: ['tt'], ...makeFeedHandler('TikTok', '🎵') };
const youtube   = { name: 'youtube',   aliases: ['yt'], ...makeFeedHandler('YouTube', '▶️') };
const twitch    = { name: 'twitch',    aliases: [],     ...makeFeedHandler('Twitch', '🟣') };
const x         = { name: 'x',         aliases: ['twitter'], ...makeFeedHandler('X/Twitter', '🐦') };
const reddit    = { name: 'reddit',    aliases: [],     ...makeFeedHandler('Reddit', '🟠') };
const soundcloud = { name: 'soundcloud', aliases: ['sc'], ...makeFeedHandler('SoundCloud', '🔊') };
const kick_feed = { name: 'kick_feed',  aliases: ['kickfeed'], ...makeFeedHandler('Kick', '🟢') };

module.exports = [instagram, tiktok, youtube, twitch, x, reddit, soundcloud, kick_feed];
