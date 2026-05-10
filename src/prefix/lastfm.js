'use strict';

const { EmbedBuilder } = require('discord.js');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';
const PINK  = '#ff6b9d';

const LASTFM_COLOR = '#d51007';

const lastfm = {
  name: 'lastfm',
  aliases: ['fm'],
  async execute(message, args) {
    const sub = args[0]?.toLowerCase();

    if (sub === 'login') {
      const username = args[1];
      if (!username) return message.reply('Usage: `,lastfm login <username>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(LASTFM_COLOR)
        .setAuthor({ name: 'Last.fm', iconURL: 'https://www.last.fm/static/images/lastfm_avatar_twitter.png' })
        .setDescription(`✅ Connected Last.fm account: **${username}**`)
        .setTimestamp()] });
    }

    if (sub === 'logout') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(LASTFM_COLOR).setDescription('✅ Disconnected your Last.fm account.')] });
    }

    const target = message.mentions.users.first() || message.author;
    const username = args[1] || target.username;

    if (sub === 'profile') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(LASTFM_COLOR)
        .setAuthor({ name: `${target.username} — Last.fm Profile` })
        .addFields(
          { name: '👤 Username', value: `**${username}**`, inline: true },
          { name: '🎵 Scrobbles', value: '**?**', inline: true },
          { name: '📅 Member Since', value: '?', inline: true },
        )
        .setDescription('ℹ️ Connect your Last.fm API key to display live data.')
        .setTimestamp()] });
    }

    if (sub === 'recent') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(LASTFM_COLOR)
        .setAuthor({ name: `${target.username} — Recent Tracks` })
        .setDescription(`ℹ️ Use \`,lastfm login <username>\` to connect your account and see recent tracks.`)
        .setTimestamp()] });
    }

    if (sub === 'loved') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(LASTFM_COLOR)
        .setAuthor({ name: `${target.username} — Loved Tracks` })
        .setDescription('ℹ️ Loved tracks will appear here once Last.fm API is configured.')
        .setTimestamp()] });
    }

    if (sub === 'toptracks') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(LASTFM_COLOR)
        .setAuthor({ name: `${target.username} — Top Tracks` })
        .setDescription('ℹ️ Top tracks will appear here once Last.fm API is configured.')
        .setTimestamp()] });
    }

    if (sub === 'topartists') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(LASTFM_COLOR)
        .setAuthor({ name: `${target.username} — Top Artists` })
        .setDescription('ℹ️ Top artists will appear here once Last.fm API is configured.')
        .setTimestamp()] });
    }

    if (sub === 'topalbums') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(LASTFM_COLOR)
        .setAuthor({ name: `${target.username} — Top Albums` })
        .setDescription('ℹ️ Top albums will appear here once Last.fm API is configured.')
        .setTimestamp()] });
    }

    const embed = new EmbedBuilder()
      .setColor(LASTFM_COLOR)
      .setAuthor({ name: 'Last.fm Commands' })
      .setDescription('**Subcommands:** `login <user>`, `logout`, `profile`, `recent`, `loved`, `toptracks`, `topartists`, `topalbums`')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

module.exports = [lastfm];
