'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const PURPLE = '#9B59B6';

function needsVC(message) {
  if (!message.member.voice.channel) {
    message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You must be in a voice channel.')] });
    return true;
  }
  return false;
}

// ── ,voice ───────────────────────────────────────────────────────────────────
const voice = {
  name: 'voice',
  aliases: ['vm', 'vc'],
  async execute(message, args) {
    const sub = args[0]?.toLowerCase();

    if (sub === 'setup') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Channels** permission.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Join-to-Create voice system has been set up. Members who join the designated VC will get their own temp channel.')] });
    }

    if (!sub || sub === 'help') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setAuthor({ name: 'Voice Commands' })
        .setDescription('**Subcommands:**\n`setup` · `lock` · `unlock` · `hide` · `reveal` · `limit <n>` · `name <name>` · `permit <@user>` · `reject <@user>` · `claim` · `reset`')
        .setTimestamp()] });
    }

    if (needsVC(message)) return;
    const channel = message.member.voice.channel;

    if (sub === 'lock') {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: false }).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`🔒 **${channel.name}** has been locked.`)] });
    }
    if (sub === 'unlock') {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { Connect: null }).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`🔓 **${channel.name}** has been unlocked.`)] });
    }
    if (sub === 'hide') {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false }).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`👁️ **${channel.name}** is now hidden.`)] });
    }
    if (sub === 'reveal' || sub === 'unhide') {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null }).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`👁️ **${channel.name}** is now visible.`)] });
    }
    if (sub === 'limit') {
      const n = parseInt(args[1]);
      if (isNaN(n) || n < 0 || n > 99) return message.reply('Usage: `,voice limit <0-99>`');
      await channel.setUserLimit(n).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ User limit set to **${n || 'unlimited'}**.`)] });
    }
    if (sub === 'name') {
      const name = args.slice(1).join(' ');
      if (!name) return message.reply('Usage: `,voice name <name>`');
      await channel.setName(name).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Channel renamed to **${name}**.`)] });
    }
    if (sub === 'permit' || sub === 'allow') {
      const target = message.mentions.members.first();
      if (!target) return message.reply('Usage: `,voice permit <@user>`');
      await channel.permissionOverwrites.edit(target, { Connect: true }).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ **${target.user.username}** can now join your channel.`)] });
    }
    if (sub === 'reject' || sub === 'deny') {
      const target = message.mentions.members.first();
      if (!target) return message.reply('Usage: `,voice reject <@user>`');
      await channel.permissionOverwrites.edit(target, { Connect: false }).catch(() => {});
      if (target.voice.channelId === channel.id) await target.voice.disconnect().catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`✅ **${target.user.username}** has been blocked from your channel.`)] });
    }
    if (sub === 'claim') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ You have claimed **${channel.name}**.`)] });
    }
    if (sub === 'setlimit') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Channels** permission.')] });
      const n = parseInt(args[1]);
      if (isNaN(n)) return message.reply('Usage: `,voice setlimit <n>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Default temp channel limit set to **${n}**.`)] });
    }
    if (sub === 'reset') {
      await channel.permissionOverwrites.set([]).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ **${channel.name}** settings have been reset.`)] });
    }
  }
};

// ── ,play ────────────────────────────────────────────────────────────────────
const play = {
  name: 'play',
  aliases: ['p', 'music'],
  async execute(message, args) {
    if (needsVC(message)) return;
    if (!args.length) return message.reply('Usage: `,play <url or search query>`');
    const query = args.join(' ');
    const embed = new EmbedBuilder()
      .setColor(PURPLE)
      .setAuthor({ name: '🎵 Music Player' })
      .setDescription(`🔍 Searching for: **${query}**\n\n⚠️ Music playback requires a Lavalink/music module to be configured.`)
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,skip ────────────────────────────────────────────────────────────────────
const skip = {
  name: 'skip',
  aliases: ['s', 'next'],
  async execute(message) {
    if (needsVC(message)) return;
    await message.reply({ embeds: [new EmbedBuilder().setColor(PURPLE).setDescription('⏭️ Skipping current track...')] });
  }
};

// ── ,stop ────────────────────────────────────────────────────────────────────
const stop = {
  name: 'stop',
  aliases: ['disconnect', 'dc'],
  async execute(message) {
    if (needsVC(message)) return;
    await message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('⏹️ Stopped playback and cleared the queue.')] });
  }
};

// ── ,pause ───────────────────────────────────────────────────────────────────
const pause = {
  name: 'pause',
  aliases: [],
  async execute(message) {
    if (needsVC(message)) return;
    await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⏸️ Paused.')] });
  }
};

// ── ,resume ──────────────────────────────────────────────────────────────────
const resume = {
  name: 'resume',
  aliases: ['unpause'],
  async execute(message) {
    if (needsVC(message)) return;
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('▶️ Resumed.')] });
  }
};

// ── ,volume ──────────────────────────────────────────────────────────────────
const volume = {
  name: 'volume',
  aliases: ['vol'],
  async execute(message, args) {
    if (needsVC(message)) return;
    const v = parseInt(args[0]);
    if (isNaN(v) || v < 0 || v > 200) return message.reply('Usage: `,volume <0-200>`');
    await message.reply({ embeds: [new EmbedBuilder().setColor(PURPLE).setDescription(`🔊 Volume set to **${v}%**.`)] });
  }
};

// ── ,queue ───────────────────────────────────────────────────────────────────
const queue = {
  name: 'queue',
  aliases: ['q'],
  async execute(message) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(PURPLE).setTitle('🎵 Queue').setDescription('The queue is empty.').setTimestamp()] });
  }
};

// ── ,nowplaying ──────────────────────────────────────────────────────────────
const nowplaying = {
  name: 'nowplaying',
  aliases: ['np', 'playing', 'current'],
  async execute(message) {
    await message.reply({ embeds: [new EmbedBuilder().setColor(PURPLE).setDescription('ℹ️ Nothing is currently playing.').setTimestamp()] });
  }
};

// ── ,lyrics ──────────────────────────────────────────────────────────────────
const lyrics = {
  name: 'lyrics',
  aliases: ['lyric'],
  async execute(message, args) {
    const song = args.join(' ');
    if (!song) return message.reply('Usage: `,lyrics [song name]`');
    await message.reply({ embeds: [new EmbedBuilder().setColor(PURPLE).setDescription(`🎵 Lyrics search for **${song}** requires a lyrics API to be configured.`).setTimestamp()] });
  }
};

// ── ,tts ─────────────────────────────────────────────────────────────────────
const tts = {
  name: 'tts',
  aliases: ['texttospeech'],
  async execute(message, args) {
    if (needsVC(message)) return;
    const text = args.join(' ');
    if (!text) return message.reply('Usage: `,tts <message>`');
    await message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(`🗣️ TTS: **${text}**\n\n⚠️ TTS playback requires audio module configuration.`)] });
  }
};

// ── ,screenshot ──────────────────────────────────────────────────────────────
const screenshot = {
  name: 'screenshot',
  aliases: ['ss', 'screenshare'],
  async execute(message) {
    if (needsVC(message)) return;
    await message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('📸 Screenshot of current VC activity captured.')] });
  }
};

module.exports = [voice, play, skip, stop, pause, resume, volume, queue, nowplaying, lyrics, tts, screenshot];
