'use strict';

const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');

const SUPPORT_URL = 'https://discord.gg/yourserver';
const WEBSITE_URL = 'https://yourwebsite.com';

const CATEGORIES = {
  moderation: {
    label: '🔨 Moderation',
    description: 'Ban, mute, kick, warn and more',
    commands: [
      '/ban', '/tempban', '/kick', '/mute', '/unmute', '/warn', '/warnings', '/clearwarns',
      '/notes add', '/notes view', '/history', '/reason', '/nuke', '/nukeschedule set|list|stop',
      '/role', '/rolehumans', '/rolebots', '/temprole', '/temprolelist',
      '/forcenickname', '/forcenicknamelist', '/rolepersist', '/unrolepersist', '/rolerestore',
      '/stripstaff', '/bans', '/mutes', '/jaillist', '/timeoutlist', '/modstats',
      '/raid', '/talk', '/silence', '/unsilence', '/imute', '/iunmute', '/rmute', '/runmute',
      '/fakepermissions grant|remove|reset|list', '/invokemod message|dm|view|remove',
    ],
  },
  utility: {
    label: 'ℹ️ Utilities',
    description: 'Purge, snipe, lock, say and more',
    commands: [
      '/ping', '/say', '/purge', '/purgefilter', '/snipe', '/editsnipe', '/clearsnipe',
      '/lock', '/unlock', '/hide', '/unhide', '/slowmode',
      '/channel info|create|delete', '/thread add|remove|lock|unlock|rename',
      '/webhook create|list|delete|send', '/stickymessage add|remove|view|list',
      '/alias add|remove|view|list|removeall', '/calc', '/afk', '/remind',
      '/uptime', '/botuptime', '/invite', '/pins', '/firstmsg',
      '/google', '/image', '/prefix', '/translate',
    ],
  },
  logging: {
    label: '📋 Logging',
    description: 'Configure server logs',
    commands: ['/log setup', '/log off', '/log color', '/log ignore', '/log unignore', '/log list'],
  },
  giveaways: {
    label: '🎁 Giveaways',
    description: 'Start and manage giveaways',
    commands: [
      '/giveaways start', '/giveaways list', '/giveaways cancel', '/giveaways end',
      '/giveaways reroll', '/giveaways edit',
    ],
  },
  autoresponder: {
    label: '📢 Autoresponder',
    description: 'Auto-reply to message triggers',
    commands: ['/autoresponder add', '/autoresponder remove', '/autoresponder list', '/autoresponder clear'],
  },
  reaction: {
    label: '📣 Reaction',
    description: 'Auto-react and reaction roles',
    commands: [
      '/reaction add', '/reaction delete', '/reaction deleteall', '/reaction list', '/reaction messages',
    ],
  },
  wallet: {
    label: '🪙 Wallet (LTC)',
    description: 'Real on-chain LTC wallet',
    commands: [
      '/wallet tos', '/wallet setup', '/wallet balance', '/wallet deposit',
      '/wallet send', '/wallet tx', '/wallet key', '/wallet restore',
    ],
  },
  payments: {
    label: '💳 Payments',
    description: 'Crypto payment embeds and addresses',
    commands: [
      '/payment set|address|list|bal|tx|txid|convert|setpaypal|paypal',
      '/pay', '/stock', '/stock_option', '/stock_remove',
    ],
  },
  vouching: {
    label: '⭐ Vouching',
    description: 'Leave rep for sellers',
    commands: ['/vouch add|setup|exch'],
  },
  tickets: {
    label: '🎫 Tickets',
    description: 'Support ticket system',
    commands: [
      '/ticket', '/ticketsetup setup', '/ticketsetup form', '/ticketsetup close',
      '/ticketsetup transcript', '/ticketsetup add', '/ticketsetup remove',
      '/ticketsetup panel', '/ticketsetup view',
    ],
  },
  ticketwatcher: {
    label: '🔎 Ticket Watcher',
    description: 'Auto-send forms in watched categories',
    commands: [
      '/ticketwatcher add', '/ticketwatcher remove', '/ticketwatcher list',
      '/ticketwatcher preview', '/ticketwatcher editsupport', '/ticketwatcher editrefund',
    ],
  },
  welcome: {
    label: '👋 Welcome',
    description: 'Welcome new members',
    commands: [
      '/welcome setup', '/welcome message', '/welcome preview', '/welcome disable', '/welcome view',
    ],
  },
  antiraid: {
    label: '🛡️ Anti-Raid',
    description: 'Protect against raids',
    commands: ['/antiraid enable', '/antiraid disable', '/antiraid config', '/antiraid view'],
  },
  autoping: {
    label: '🔔 Autoping',
    description: 'Ping new members automatically',
    commands: [
      '/autoping setup', '/autoping remove', '/autoping list', '/autoping toggle', '/autoping clear',
    ],
  },
  server: {
    label: '🛠️ Server Management',
    description: 'Emojis, stickers and more',
    commands: ['/emoji add|remove|list', '/sticker add|remove|list'],
  },
  sellauth: {
    label: '🛍️ SellAuth',
    description: 'Manage your SellAuth shop',
    commands: [
      '/setapikey', '/setshopid', '/setproduct', '/addproduct', '/addvariant',
      '/removeproduct', '/restock',
    ],
  },
  misc: {
    label: '⚙️ Bot Owner',
    description: 'Bot owner controls',
    commands: ['/setstatus', '/restart', '/rate', '/setprefix'],
  },
  help: {
    label: '❓ Help',
    description: 'This help menu',
    commands: ['/help'],
  },
};

const TOTAL_COMMANDS = Object.values(CATEGORIES).reduce((sum, c) => sum + c.commands.length, 0);

function buildCategoryEmbed(categoryKey, client) {
  const cat = CATEGORIES[categoryKey];
  return new EmbedBuilder()
    .setAuthor({ name: `flux — ${cat.label}`, iconURL: client.user.displayAvatarURL() })
    .setTitle(cat.label)
    .setDescription(cat.description)
    .setColor('#5865F2')
    .setThumbnail(client.user.displayAvatarURL())
    .addFields({ name: '📋 Commands', value: cat.commands.map(c => `\`${c}\``).join('\n') })
    .setFooter({ text: `${cat.commands.length} command(s) in this category • flux` })
    .setTimestamp();
}

function buildSelectMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId('slash_help_category')
    .setPlaceholder('Choose a category...')
    .addOptions(
      Object.entries(CATEGORIES).map(([key, cat]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(cat.label)
          .setDescription(cat.description)
          .setValue(key)
      )
    );
}

const help = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all commands by category'),

  async execute(interaction) {
    const client = interaction.client;
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
    const row = new ActionRowBuilder().addComponents(buildSelectMenu());

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${client.user.username} help`, iconURL: client.user.displayAvatarURL() })
      .setThumbnail(client.user.displayAvatarURL())
      .setDescription(
        `flux is a powerful Discord bot with a robust set of features to enhance your server experience.\n\n` +
        `**support**\n[support](${SUPPORT_URL}) • [website](${WEBSITE_URL}) • [invite](${inviteUrl})`
      )
      .setColor('#5865F2')
      .setTimestamp();

    await interaction.reply({ embeds: [embed], components: [row] });
  },

  async handleSelect(interaction) {
    const categoryKey = interaction.values[0];
    if (!CATEGORIES[categoryKey]) return interaction.update({ content: '❌ Unknown category.', components: [] });

    const embed = buildCategoryEmbed(categoryKey, interaction.client);
    const row   = new ActionRowBuilder().addComponents(buildSelectMenu());

    await interaction.update({ embeds: [embed], components: [row] });
  },
};

module.exports = [help];
