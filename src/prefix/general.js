'use strict';

const {
  EmbedBuilder, AttachmentBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const db = require('../database');
const { generateStatsCard } = require('../utils/statsCard');

const BLUE  = '#5865F2';
const GREEN = '#57F287';

const SUPPORT_URL = 'https://discord.gg/yourserver';
const WEBSITE_URL = 'https://yourwebsite.com';

// ── Help categories ────────────────────────────────────────────────────────────
const HELP_CATS = {
  moderation: {
    emoji: '🛡️', label: 'Moderation', desc: 'Ban, mute, kick, warn and more',
    prefix: '/',
    cmds: ['ban','tempban','unban','kick','mute','unmute','warn','warnings',
           'clearwarns','history','timeout','lock','unlock','slowmode','nick'],
  },
  utility: {
    emoji: '🔧', label: 'Utility', desc: 'Purge, snipe, embed, poll and more',
    prefix: '/',
    cmds: ['ping','say','purge','serverinfo','userinfo','avatar','embed','poll',
           'setprefix','afk','sticky','reaction','snipe','setstatus'],
  },
  giveaways: {
    emoji: '🎉', label: 'Giveaways', desc: 'Host and manage giveaways',
    prefix: '/',
    cmds: ['giveaways start','giveaways end','giveaways cancel','giveaways reroll','giveaways list'],
  },
  payments: {
    emoji: '💳', label: 'Payments', desc: 'LTC wallet, crypto addresses, stock',
    prefix: '/',
    cmds: ['wallet setup','wallet balance','wallet send','payment set',
           'payment address','payment list','pay','stock add','stock list','stock remove'],
  },
  vouch: {
    emoji: '✅', label: 'Vouch', desc: 'Leave rep for transactions',
    prefix: '/',
    cmds: ['vouch add','vouch setup','vouch exchange'],
  },
  tickets: {
    emoji: '🎟️', label: 'Tickets', desc: 'Support ticket panel system',
    prefix: '/',
    cmds: ['ticket setup','ticket close','ticket add','ticket remove'],
  },
  antiraid: {
    emoji: '🚨', label: 'Anti-Raid', desc: 'Raid detection and protection',
    prefix: '/',
    cmds: ['antiraid'],
  },
  welcome: {
    emoji: '👋', label: 'Welcome', desc: 'Welcome new members',
    prefix: '/',
    cmds: ['welcome setup','welcome test'],
  },
  antinuke: {
    emoji: '⚔️', label: 'Anti-Nuke', desc: 'Server nuke protection',
    prefix: ',',
    cmds: ['antinuke setup','antinuke toggle','antinuke whitelist add',
           'antinuke whitelist remove','antinuke whitelist list',
           'antinuke logs','antinuke threshold','antinuke punishment'],
  },
  roles: {
    emoji: '🎭', label: 'Roles', desc: 'Role management commands',
    prefix: ',',
    cmds: ['role create','role delete','role info','role color','role list',
           'role massadd','role massremove','role add','role remove'],
  },
  information: {
    emoji: 'ℹ️', label: 'Information', desc: 'Server and user info lookup',
    prefix: ',',
    cmds: ['roleinfo','channelinfo','botinfo','invite','support',
           'stats','whois','emoteinfo','banner','permissions'],
  },
  aesthetic: {
    emoji: '🎨', label: 'Aesthetic', desc: 'Text effects and encode tools',
    prefix: ',',
    cmds: ['aesthetic','mock','reverse','encode','decode','color','smallcaps','spoiler'],
  },
  logging: {
    emoji: '📋', label: 'Logging', desc: 'Configure server event logs',
    prefix: ',',
    cmds: ['logs setup','logs disable','logs channel','logs events',
           'logs view','logs clear','logs ignore','logs test'],
  },
  autoresponder: {
    emoji: '💬', label: 'Auto Responder', desc: 'Auto-reply to message triggers',
    prefix: ',',
    cmds: ['autoresponder add','autoresponder remove','autoresponder list',
           'autoresponder edit','autoresponder toggle','autoresponder clear',
           'autoresponder test','autoresponder exact'],
  },
  prefix: {
    emoji: '⌨️', label: 'Prefix Commands', desc: 'Quick commands with the , prefix',
    prefix: ',',
    cmds: ['ping','help','vouch','pay','msgstats','bal'],
  },
  fun: {
    emoji: '🎲', label: 'Fun', desc: 'Games, actions, text effects and more',
    prefix: ',',
    cmds: ['truth','dare','tod','nhie','wyr','paranoia','8ball','fortune','advice','fact','joke','dadjoke','riddle','quote','horoscope','ship','iq','pp','simp','sus','gay','ratio','rps','coinflip','roll','trivia','choose','hug','slap','pat','kiss','poke','cuddle','bite','roast','compliment','kill','hack','marry','divorce','emojify','morse','binary','uwu','clap','vaporwave','zalgo','hotornot','steal','rate'],
  },
};

// ── Build the category select menu ─────────────────────────────────────────────
function buildSelectMenu() {
  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel('Home')
      .setDescription('Return to main menu')
      .setValue('__home__')
      .setEmoji('🏠'),
    ...Object.entries(HELP_CATS).map(([key, cat]) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(cat.label)
        .setDescription(`${cat.cmds.length} command(s)`)
        .setValue(key)
        .setEmoji(cat.emoji)
    ),
  ];

  return new StringSelectMenuBuilder()
    .setCustomId('prefix_help_cat')
    .setPlaceholder('Choose a category...')
    .addOptions(options);
}

// ── Build the home embed ───────────────────────────────────────────────────────
function buildHomeEmbed(client) {
  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
  const totalCmds = Object.values(HELP_CATS).reduce((n, c) => n + c.cmds.length, 0);

  return new EmbedBuilder()
    .setAuthor({ name: `${client.user.username} help`, iconURL: client.user.displayAvatarURL() })
    .setThumbnail(client.user.displayAvatarURL())
    .setColor(BLUE)
    .setDescription(
      `flux is a powerful Discord bot built for modern servers — moderation, ` +
      `giveaways, payments, ticket systems, and more.\n\n` +
      `**support**\n[support](${SUPPORT_URL}) • [website](${WEBSITE_URL}) • [invite](${inviteUrl})`
    )
    .setFooter({ text: `${totalCmds} total commands • use ,help <command> for details` })
    .setTimestamp();
}

// ── Build a category embed ─────────────────────────────────────────────────────
function buildCategoryEmbed(key, client) {
  const cat = HELP_CATS[key];
  const cmdList = cat.cmds.map(c => `\`${c}\``).join(', ');

  return new EmbedBuilder()
    .setAuthor({ name: `${client.user.username} help`, iconURL: client.user.displayAvatarURL() })
    .setColor(BLUE)
    .setTitle(`${cat.emoji} ${cat.label}`)
    .setDescription(cmdList)
    .setFooter({ text: `${cat.cmds.length} command(s) • use ,help <command> for details` })
    .setTimestamp();
}

// ── Export helpers so interactionCreate can use them ───────────────────────────
const COMMANDS = [
  // ── ,ping ──────────────────────────────────────────────────────────────────
  {
    name: 'ping',
    aliases: [],
    description: 'Check bot latency',
    async execute(message, args, client) {
      const sent = await message.reply('🏓 Pinging...');
      const latency = sent.createdTimestamp - message.createdTimestamp;
      const apiLatency = Math.round(client.ws.ping);
      const color = latency < 100 ? GREEN : latency < 250 ? '#FEE75C' : '#ED4245';

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('🏓 Pong!')
        .addFields(
          { name: '📡 Latency', value: `${latency}ms`, inline: true },
          { name: '💓 API',     value: `${apiLatency}ms`, inline: true },
        )
        .setTimestamp();

      await sent.edit({ content: null, embeds: [embed] });
    },
  },

  // ── ,help ──────────────────────────────────────────────────────────────────
  {
    name: 'help',
    aliases: ['h', 'commands'],
    description: 'Show all bot commands by category',
    async execute(message, args, client) {
      const row   = new ActionRowBuilder().addComponents(buildSelectMenu());
      const embed = buildHomeEmbed(client);
      await message.reply({ embeds: [embed], components: [row] });
    },
  },

  // ── ,vouch ─────────────────────────────────────────────────────────────────
  {
    name: 'vouch',
    aliases: ['rep', '+rep'],
    description: 'Quick vouch — `,vouch <qty> <product> <price> <method>`',
    async execute(message, args, client) {
      if (args.length < 4) {
        return message.reply('❌ Usage: `,vouch <qty> <product> <price> <payment_method>`');
      }
      const [qty, product, price, ...methodParts] = args;
      const method = methodParts.join(' ');

      const vouchData = db.getVouch(message.author.id);
      if (!vouchData?.target_user_id) {
        return message.reply('❌ No vouch target set. Use `/vouch setup` first.');
      }

      await message.channel.send(
        `+rep <@!${vouchData.target_user_id}> | ${qty}x ${product} | ${price} | ${method}`
      );
      await message.delete().catch(() => {});
    },
  },

  // ── ,pay ───────────────────────────────────────────────────────────────────
  {
    name: 'pay',
    aliases: [],
    description: 'Quick payment info — `,pay <coin>`',
    async execute(message, args, client) {
      if (!args[0]) return message.reply('❌ Usage: `,pay <coin>` (e.g. `,pay LTC`)');
      const coin = args[0].toUpperCase();
      const row  = db.getPaymentAddress(message.author.id, coin);
      if (!row) return message.reply(`❌ No **${coin}** address saved. Use \`/payment set\`.`);

      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle(`💳 ${coin} Payment Address`)
        .setDescription(`\`${row.address}\``)
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    },
  },

  // ── ,msgstats ──────────────────────────────────────────────────────────────
  {
    name: 'msgstats',
    aliases: ['ms', 'stats'],
    description: 'Show message stats card — `,msgstats [@user]`',
    async execute(message, args, client) {
      const target     = message.mentions.users.first() || message.author;
      const member     = await message.guild.members.fetch(target.id).catch(() => null);
      const msgStats   = db.getMessageStats(message.guild.id, target.id);
      const voiceStats = db.getVoiceStats(message.guild.id, target.id);
      const rank       = db.getMessageRank(message.guild.id, target.id);

      const topChannels = await Promise.all(
        msgStats.topChannels.map(async r => {
          const ch = message.guild.channels.cache.get(r.channel_id);
          return { name: ch ? ch.name : r.channel_id, count: r.cnt };
        })
      );

      const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 128 });
      const buf = await generateStatsCard({
        username: member?.displayName || target.username,
        avatarUrl, rank, msgStats, voiceStats,
        topChannels: topChannels.length ? topChannels : [{ name: 'none', count: 0 }],
      });

      const attachment = new AttachmentBuilder(buf, { name: 'stats.png' });
      await message.reply({ files: [attachment] });
    },
  },

  // ── ,bal ───────────────────────────────────────────────────────────────────
  {
    name: 'bal',
    aliases: ['balance'],
    description: 'Show your LTC wallet address — `,bal`',
    async execute(message, args, client) {
      const w = db.getWallet(message.author.id);
      if (!w) return message.reply('❌ No wallet found. Use `/wallet setup`.');

      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: `${message.author.tag}'s LTC Wallet`, iconURL: message.author.displayAvatarURL() })
        .setDescription(`\`${w.address}\`\n\nUse \`/wallet balance\` for full balance with prices.`)
        .setFooter({ text: 'flux wallet' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    },
  },

  // ── ,pins ──────────────────────────────────────────────────────────────────
  {
    name: 'pins',
    aliases: [],
    description: 'Show pinned message count — `,pins [#channel]`',
    async execute(message) {
      const ch = message.mentions.channels.first() || message.channel;
      const pinned = await ch.messages.fetchPinned();
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setAuthor({ name: '📌 Pinned Messages' })
        .addFields({ name: '📍 Channel', value: `${ch}`, inline: true }, { name: '📌 Count', value: `${pinned.size}`, inline: true })
        .setFooter({ text: 'flux bot' }).setTimestamp();
      await message.reply({ embeds: [embed] });
    },
  },

  // ── ,firstmsg ─────────────────────────────────────────────────────────────
  {
    name: 'firstmsg',
    aliases: ['first'],
    description: 'Get the first message in a channel — `,firstmsg [#channel]`',
    async execute(message) {
      const ch = message.mentions.channels.first() || message.channel;
      const messages = await ch.messages.fetch({ limit: 1, after: '0' });
      const first = messages.first();
      if (!first) return message.reply('❌ Could not fetch first message.');
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setAuthor({ name: `📜 First message in #${ch.name}` })
        .setDescription(`[Jump to message](${first.url})`)
        .addFields(
          { name: '👤 Author', value: first.author.tag, inline: true },
          { name: '📅 Sent',   value: `<t:${Math.floor(first.createdTimestamp / 1000)}:R>`, inline: true },
        )
        .setFooter({ text: 'flux bot' }).setTimestamp();
      await message.reply({ embeds: [embed] });
    },
  },

  // ── ,google ───────────────────────────────────────────────────────────────
  {
    name: 'google',
    aliases: ['g', 'search'],
    description: 'Search Google — `,google <query>`',
    async execute(message, args) {
      if (!args.length) return message.reply('❌ Usage: `,google <query>`');
      const q = encodeURIComponent(args.join(' '));
      await message.reply(`🔎 <https://www.google.com/search?q=${q}>`);
    },
  },

  // ── ,image ────────────────────────────────────────────────────────────────
  {
    name: 'image',
    aliases: ['img', 'gi'],
    description: 'Search Google Images — `,image <query>`',
    async execute(message, args) {
      if (!args.length) return message.reply('❌ Usage: `,image <query>`');
      const q = encodeURIComponent(args.join(' '));
      await message.reply(`🖼️ <https://www.google.com/search?tbm=isch&q=${q}>`);
    },
  },

  // ── ,prefix ───────────────────────────────────────────────────────────────
  {
    name: 'prefix',
    aliases: ['setprefix'],
    description: 'View or change the bot prefix — `,prefix [newprefix]`',
    async execute(message, args) {
      if (args[0]) {
        if (!message.member.permissions.has('ManageGuild')) return message.reply('❌ You need Manage Server permission.');
        db.upsertGuildSettings(message.guild.id, { prefix: args[0] });
        const embed = new EmbedBuilder()
          .setColor(GREEN)
          .setAuthor({ name: '⌨️ Prefix Updated', iconURL: message.author.displayAvatarURL() })
          .addFields({ name: 'New Prefix', value: `\`${args[0]}\``, inline: true })
          .setFooter({ text: 'flux bot' }).setTimestamp();
        await message.reply({ embeds: [embed] });
      } else {
        const settings = db.getGuildSettings(message.guild.id);
        await message.reply(`Current prefix: \`${settings?.prefix || ','}\``);
      }
    },
  },

  // ── ,botuptime ────────────────────────────────────────────────────────────
  {
    name: 'botuptime',
    aliases: ['processuptime'],
    description: 'Show process uptime — `,botuptime`',
    async execute(message, args, client) {
      const ms = process.uptime() * 1000;
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      const str = [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setAuthor({ name: '🤖 Process Uptime', iconURL: client.user.displayAvatarURL() })
        .setDescription(`**${str}**`)
        .setFooter({ text: 'flux bot' }).setTimestamp();
      await message.reply({ embeds: [embed] });
    },
  },
];

COMMANDS.buildHomeEmbed    = buildHomeEmbed;
COMMANDS.buildCategoryEmbed = buildCategoryEmbed;
COMMANDS.buildSelectMenu   = buildSelectMenu;
COMMANDS.HELP_CATS         = HELP_CATS;

module.exports = COMMANDS;
