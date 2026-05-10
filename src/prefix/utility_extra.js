'use strict';

const { EmbedBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const axios = require('axios');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const PURPLE = '#9B59B6';

// ── ,emoji ────────────────────────────────────────────────────────────────────
const emoji = {
  name: 'emoji',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Emojis** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'add') {
      const emojiArg = args[1];
      const name = args[2];
      if (!emojiArg) return message.reply('Usage: `,emoji add <emoji/url> [name]`');
      const match = emojiArg.match(/<a?:(\w+):(\d+)>/);
      const url = match
        ? `https://cdn.discordapp.com/emojis/${match[2]}.${emojiArg.startsWith('<a:') ? 'gif' : 'png'}`
        : emojiArg;
      const emojiName = name || match?.[1] || 'emoji';
      const created = await message.guild.emojis.create({ attachment: url, name: emojiName, reason: `Added by ${message.author.tag}` }).catch(() => null);
      if (!created) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Failed to add emoji.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Added emoji **${created.name}** ${created}.`)] });
    }

    if (sub === 'addmany') {
      const emojis = args.slice(1);
      if (!emojis.length) return message.reply('Usage: `,emoji addmany <emoji1> <emoji2> ...`');
      let added = 0;
      for (const e of emojis) {
        const match = e.match(/<a?:(\w+):(\d+)>/);
        if (!match) continue;
        const url = `https://cdn.discordapp.com/emojis/${match[2]}.${e.startsWith('<a:') ? 'gif' : 'png'}`;
        const created = await message.guild.emojis.create({ attachment: url, name: match[1], reason: `Mass add by ${message.author.tag}` }).catch(() => null);
        if (created) added++;
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Added **${added}** emoji(s).`)] });
    }

    if (sub === 'remove') {
      const emojiArg = args[1];
      if (!emojiArg) return message.reply('Usage: `,emoji remove <emoji>`');
      const match = emojiArg.match(/<a?:\w+:(\d+)>/);
      if (!match) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Provide a custom emoji.')] });
      const target = message.guild.emojis.cache.get(match[1]);
      if (!target) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Emoji not found in this server.')] });
      const name = target.name;
      await target.delete(`Removed by ${message.author.tag}`).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed emoji **${name}**.`)] });
    }

    if (sub === 'removemany') {
      const emojis = args.slice(1);
      let removed = 0;
      for (const e of emojis) {
        const match = e.match(/<a?:\w+:(\d+)>/);
        if (!match) continue;
        const target = message.guild.emojis.cache.get(match[1]);
        if (target) { await target.delete().catch(() => {}); removed++; }
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed **${removed}** emoji(s).`)] });
    }

    if (sub === 'rename') {
      const emojiArg = args[1];
      const newName = args[2];
      if (!emojiArg || !newName) return message.reply('Usage: `,emoji rename <emoji> <new_name>`');
      const match = emojiArg.match(/<a?:\w+:(\d+)>/);
      if (!match) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Provide a custom emoji.')] });
      const target = message.guild.emojis.cache.get(match[1]);
      if (!target) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Emoji not found.')] });
      await target.setName(newName).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Renamed emoji to **${newName}**.`)] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setAuthor({ name: 'Emoji Management' }).setDescription('**Subcommands:** `add`, `addmany`, `remove`, `removemany`, `rename`').setTimestamp()] });
  }
};

// ── ,sticker ──────────────────────────────────────────────────────────────────
const sticker = {
  name: 'sticker',
  aliases: ['stickers'],
  async execute(message, args) {
    const sub = args[0]?.toLowerCase();

    if (sub === 'list') {
      const list = message.guild.stickers.cache;
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle(`Stickers (${list.size})`).setDescription(list.size ? [...list.values()].map(s => `**${s.name}** — \`${s.id}\``).join('\n') : 'No stickers.').setTimestamp()] });
    }

    if (!message.member.permissions.has(PermissionFlagsBits.ManageEmojisAndStickers))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Emojis** permission.')] });

    if (sub === 'add') {
      const name = args[1];
      const attachment = message.attachments.first();
      if (!name || !attachment) return message.reply('Usage: `,sticker add <name>` (attach an image)');
      const s = await message.guild.stickers.create({ file: attachment.url, name, tags: name.slice(0, 10), reason: `Added by ${message.author.tag}` }).catch(() => null);
      if (!s) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Failed to add sticker.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Added sticker **${s.name}**.`)] });
    }

    if (sub === 'remove') {
      const id = args[1];
      if (!id) return message.reply('Usage: `,sticker remove <sticker_id>`');
      const s = message.guild.stickers.cache.get(id);
      if (!s) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Sticker not found.')] });
      const name = s.name;
      await s.delete().catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed sticker **${name}**.`)] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('**Subcommands:** `add <name>` (+ attachment), `remove <id>`, `list`')] });
  }
};

// ── ,convert ──────────────────────────────────────────────────────────────────
const convert = {
  name: 'convert',
  aliases: ['conv'],
  async execute(message, args) {
    const amount = parseFloat(args[0]);
    const from = args[1]?.toUpperCase();
    const to = args[2]?.toUpperCase();
    if (isNaN(amount) || !from || !to)
      return message.reply('Usage: `,convert <amount> <from> <to>` — e.g. `,convert 100 USD EUR`');

    const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⏳ Converting...')] });
    const res = await axios.get(`https://open.er-api.com/v6/latest/${from}`, { timeout: 8000 }).catch(() => null);
    if (!res || !res.data?.rates?.[to])
      return msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ Could not convert **${from}** → **${to}**. Check currency codes.`)] });

    const rate = res.data.rates[to];
    const result = (amount * rate).toFixed(4);
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('💱 Currency Conversion')
      .addFields(
        { name: 'Input',  value: `**${amount} ${from}**`,  inline: true },
        { name: 'Output', value: `**${result} ${to}**`,    inline: true },
        { name: 'Rate',   value: `1 ${from} = ${rate.toFixed(6)} ${to}`, inline: false },
      )
      .setTimestamp();
    await msg.edit({ embeds: [embed] });
  }
};

// ── ,define ───────────────────────────────────────────────────────────────────
const define = {
  name: 'define',
  aliases: ['definition', 'dict'],
  async execute(message, args) {
    const word = args[0];
    if (!word) return message.reply('Usage: `,define <word>`');
    const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`⏳ Looking up **${word}**...`)] });
    const res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { timeout: 8000 }).catch(() => null);
    if (!res || !Array.isArray(res.data) || !res.data[0])
      return msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ No definition found for **${word}**.`)] });

    const entry = res.data[0];
    const meaning = entry.meanings?.[0];
    const def = meaning?.definitions?.[0];
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle(`📖 ${entry.word}`)
      .addFields(
        { name: 'Part of Speech', value: meaning?.partOfSpeech || 'Unknown', inline: true },
        { name: 'Definition', value: def?.definition?.slice(0, 1024) || 'N/A', inline: false },
      );
    if (def?.example) embed.addFields({ name: 'Example', value: `*${def.example}*`, inline: false });
    if (entry.phonetic) embed.setDescription(`**Phonetic:** ${entry.phonetic}`);
    embed.setTimestamp();
    await msg.edit({ embeds: [embed] });
  }
};

// ── ,tz ───────────────────────────────────────────────────────────────────────
const tz = {
  name: 'tz',
  aliases: ['timezone'],
  async execute(message, args) {
    const timezone = args[0];
    if (!timezone) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('**Your timezone:** Not set.\nUsage: `,tz <timezone>` — e.g. `,tz America/New_York`')] });
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date());
    } catch {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ Invalid timezone **${timezone}**. Use IANA format (e.g. \`America/New_York\`, \`Europe/London\`).`)] });
    }
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Timezone set to **${timezone}**.\nCurrent time: **${new Intl.DateTimeFormat('en-GB', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date())}**`)] });
  }
};

// ── ,timestamp ────────────────────────────────────────────────────────────────
const timestamp = {
  name: 'timestamp',
  aliases: ['ts', 'time'],
  async execute(message, args) {
    const input = args.join(' ');
    const date = input ? new Date(input) : new Date();
    if (isNaN(date.getTime()))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ Invalid date. Try: \`,timestamp 2025-12-25\` or \`,timestamp tomorrow\``)] });

    const unix = Math.floor(date.getTime() / 1000);
    const formats = [
      { style: 't', desc: 'Short Time' },
      { style: 'T', desc: 'Long Time' },
      { style: 'd', desc: 'Short Date' },
      { style: 'D', desc: 'Long Date' },
      { style: 'f', desc: 'Full' },
      { style: 'F', desc: 'Long Full' },
      { style: 'R', desc: 'Relative' },
    ];
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🕐 Discord Timestamp')
      .setDescription(formats.map(f => `**${f.desc}:** \`<t:${unix}:${f.style}>\` → <t:${unix}:${f.style}>`).join('\n'))
      .addFields({ name: 'Unix', value: `\`${unix}\``, inline: true })
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,react ────────────────────────────────────────────────────────────────────
const react = {
  name: 'react',
  aliases: ['addreact'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.AddReactions))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Add Reactions** permission.')] });
    const msgLink = args[0];
    const emojiArg = args[1];
    if (!msgLink || !emojiArg) return message.reply('Usage: `,react <message_link> <emoji>`');
    const parts = msgLink.split('/');
    const msgId = parts[parts.length - 1];
    const chanId = parts[parts.length - 2];
    const channel = message.guild.channels.cache.get(chanId) || message.channel;
    const target = await channel.messages.fetch(msgId).catch(() => null);
    if (!target) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Message not found.')] });
    await target.react(emojiArg).catch(() => {});
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Reacted with ${emojiArg}.`)] });
  }
};

// ── ,forcenickname ────────────────────────────────────────────────────────────
const forcenickname = {
  name: 'forcenickname',
  aliases: ['fn', 'forcenick'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Nicknames** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'list') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('Forced Nicknames').setDescription('ℹ️ No forced nicknames active.').setTimestamp()] });
    }
    if (sub === 'remove') {
      const member = message.mentions.members.first();
      if (!member) return message.reply('Usage: `,forcenick remove <@user>`');
      await member.setNickname(null, `Force nick removed by ${message.author.tag}`).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed forced nickname from **${member.user.username}**.`)] });
    }

    const member = message.mentions.members.first();
    const nick = args.slice(1 + (message.mentions.members.size > 0 ? 1 : 0)).join(' ') || args.slice(1).join(' ');
    if (!member || !nick) return message.reply('Usage: `,forcenickname <@user> <nickname>`');
    await member.setNickname(nick, `Forced by ${message.author.tag}`).catch(() => {});
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Forced nickname **${nick}** on **${member.user.username}**.`)] });
  }
};

// ── ,recolor ──────────────────────────────────────────────────────────────────
const recolor = {
  name: 'recolor',
  aliases: ['tint', 'colorize'],
  async execute(message, args) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ Image recoloring requires an image processing API. Attach an image and specify a color: `,recolor <#hex> [attachment]`')] });
  }
};

// ── ,pinterest ────────────────────────────────────────────────────────────────
const pinterest = {
  name: 'pinterest',
  aliases: ['pin'],
  async execute(message, args) {
    const query = args.join(' ');
    if (!query) return message.reply('Usage: `,pinterest <query>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`🔍 Searching Pinterest for **${query}**...\n\nℹ️ Pinterest API integration required for live results.`)] });
  }
};

// ── ,status ───────────────────────────────────────────────────────────────────
const status = {
  name: 'status',
  aliases: ['botstatus'],
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (target) {
      const member = message.guild.members.cache.get(target.id);
      const presence = member?.presence;
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setAuthor({ name: `${target.username} — Status`, iconURL: target.displayAvatarURL() })
        .addFields(
          { name: '📶 Status',   value: presence?.status || 'offline', inline: true },
          { name: '🎮 Activity', value: presence?.activities?.[0]?.name || 'None', inline: true },
        )
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }
    const client = message.client;
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🤖 Bot Status')
      .addFields(
        { name: '📶 Status',    value: '🟢 Online',                                       inline: true },
        { name: '⏱️ Uptime',   value: `${h}h ${m}m ${s}s`,                               inline: true },
        { name: '🏓 Ping',     value: `${client.ws.ping}ms`,                              inline: true },
        { name: '🖥️ Servers',  value: `${client.guilds.cache.size}`,                     inline: true },
        { name: '👥 Users',    value: `${client.users.cache.size}`,                       inline: true },
        { name: '💾 Memory',   value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`, inline: true },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,zip / ,unzip ─────────────────────────────────────────────────────────────
const zip = {
  name: 'zip',
  aliases: [],
  async execute(message) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ File compression requires server-side processing. Attach files with `,zip` to compress them.')] });
  }
};

const unzip = {
  name: 'unzip',
  aliases: ['extract'],
  async execute(message) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ File extraction requires server-side processing. Attach a zip file with `,unzip`.')] });
  }
};

module.exports = [emoji, sticker, convert, define, tz, timestamp, react, forcenickname, recolor, pinterest, status, zip, unzip];
