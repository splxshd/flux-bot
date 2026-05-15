'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';
const YELLOW = '#FEE75C';

const { sendStickyContent } = require('../utils/sendSticky');

const SMALL_CAPS = { a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ' };

// ,mock
const mock = {
  name: 'mock',
  aliases: ['spongebob'],
  async execute(message, args) {
    const text = args.join(' ');
    if (!text) return message.reply('Usage: `,mock <text>`');
    const result = text.split('').map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join('');
    message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`🧽 ${result}`)] });
  }
};

// ,reverse
const reverse = {
  name: 'reverse',
  aliases: ['rev'],
  async execute(message, args) {
    const text = args.join(' ');
    if (!text) return message.reply('Usage: `,reverse <text>`');
    const result = text.split('').reverse().join('');
    message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(`🔄 ${result}`)] });
  }
};

// ,smallcaps
const smallcaps = {
  name: 'smallcaps',
  aliases: ['sc'],
  async execute(message, args) {
    const text = args.join(' ');
    if (!text) return message.reply('Usage: `,smallcaps <text>`');
    const result = text.toLowerCase().split('').map(c => SMALL_CAPS[c] || c).join('');
    message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(`🔡 ${result}`)] });
  }
};

// ,spoiler
const spoiler = {
  name: 'spoiler',
  aliases: [],
  async execute(message, args) {
    const text = args.join(' ');
    if (!text) return message.reply('Usage: `,spoiler <text>`');
    await message.delete().catch(() => {});
    message.channel.send(`||${text}||`);
  }
};

// ,encode
const encode = {
  name: 'encode',
  aliases: ['b64enc'],
  async execute(message, args) {
    const text = args.join(' ');
    if (!text) return message.reply('Usage: `,encode <text>`');
    const result = Buffer.from(text).toString('base64');
    message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
      .setTitle('🔐 Base64 Encoded')
      .setDescription(`\`\`\`${result}\`\`\``)] });
  }
};

// ,decode
const decode = {
  name: 'decode',
  aliases: ['b64dec'],
  async execute(message, args) {
    const text = args.join(' ');
    if (!text) return message.reply('Usage: `,decode <base64>`');
    try {
      const result = Buffer.from(text, 'base64').toString('utf8');
      message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setTitle('🔓 Base64 Decoded')
        .setDescription(`\`\`\`${result}\`\`\``)] });
    } catch {
      message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Invalid base64 string.')] });
    }
  }
};

// ,sticky
const sticky = {
  name: 'sticky',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'set') {
      // Read raw content to preserve newlines and formatting
      const prefix = db.getPrefix(message.guild.id);
      const text = message.content.slice(prefix.length).trim().replace(/^sticky\s+set\s*/i, '');
      if (!text) return message.reply('Usage: `,sticky set <message>`');
      db.setStickyMessage(message.guild.id, message.channel.id, text);
      // Post the sticky immediately, with embed support
      const sent = await sendStickyContent(message.channel, text);
      if (sent) db.updateStickyLastMessage(message.guild.id, message.channel.id, sent.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`📌 Sticky message set in ${message.channel}.`)] });
    }

    if (sub === 'clear' || sub === 'remove') {
      db.removeStickyMessage(message.guild.id, message.channel.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('📌 Sticky message cleared.')] });
    }

    if (sub === 'list') {
      const stickies = db.getAllStickyMessages(message.guild.id) || [];
      const desc = stickies.length
        ? stickies.map(s => `<#${s.channel_id}> — ${s.content.slice(0,60)}...`).join('\n')
        : 'No sticky messages set.';
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('📌 Sticky Messages').setDescription(desc).setTimestamp()] });
    }

    message.reply('Usage: `,sticky set <message>` | `,sticky clear` | `,sticky list`');
  }
};

// ,embed
const embed = {
  name: 'embed',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Messages** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'script') {
      const script = args.slice(1).join(' ');
      if (!script) return message.reply('Usage: `,embed script <json>`');
      try {
        const data = JSON.parse(script);
        const e = new EmbedBuilder();
        if (data.title) e.setTitle(data.title);
        if (data.description) e.setDescription(data.description);
        if (data.color) e.setColor(data.color);
        if (data.footer) e.setFooter({ text: data.footer });
        if (data.fields) e.addFields(data.fields);
        return message.channel.send({ embeds: [e] });
      } catch {
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Invalid JSON. Use `{"title":"","description":"","color":"#5865F2"}`')] });
      }
    }

    message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
      .setTitle('📝 Embed Builder')
      .setDescription('Build a custom embed by passing JSON.')
      .addFields({ name: 'Usage', value: '`,embed script {"title":"Hello","description":"World","color":"#5865F2"}`' })
      .setTimestamp()] });
  }
};

// ,hoist
const hoist = {
  name: 'hoist',
  aliases: [],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
    if (!role) return message.reply('Usage: `,hoist <@role>`');
    const current = role.hoist;
    await role.setHoist(!current).catch(() => {});
    message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setDescription(`✅ ${role} is now ${!current ? '**hoisted**' : '**unhoisted**'}.`)] });
  }
};

module.exports = [mock, reverse, smallcaps, spoiler, encode, decode, sticky, embed, hoist];
