'use strict';

const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonBuilder, ButtonStyle,
} = require('discord.js');

const SUPPORT_URL = 'https://discord.gg/yourserver';
const WEBSITE_URL = 'https://fluxbot.xyz';

// ─── Command registry ─────────────────────────────────────────────────────────
// Each entry: { name, description, aliases, params, permission, usage, example, module }
const COMMANDS = {
  // ── Moderation ──────────────────────────────────────────────────────────────
  ban:             { description: 'Ban a member from the server.',                 aliases: [],                 params: '<user> [reason]',          permission: 'Ban Members',        usage: '/ban <user> [reason]',              example: '/ban @user spam',               module: 'Moderation' },
  tempban:         { description: 'Temporarily ban a member.',                     aliases: [],                 params: '<user> <duration> [reason]', permission: 'Ban Members',       usage: '/tempban <user> <duration> [reason]', example: '/tempban @user 1d toxic',     module: 'Moderation' },
  kick:            { description: 'Kick a member from the server.',                aliases: [],                 params: '<user> [reason]',          permission: 'Kick Members',       usage: '/kick <user> [reason]',             example: '/kick @user rule break',        module: 'Moderation' },
  mute:            { description: 'Timeout a member for a duration.',              aliases: ['timeout'],        params: '<user> <duration> [reason]', permission: 'Moderate Members',  usage: '/mute <user> <duration> [reason]',  example: '/mute @user 10m spam',          module: 'Moderation' },
  unmute:          { description: 'Remove timeout from a member.',                 aliases: ['untimeout'],      params: '<user>',                   permission: 'Moderate Members',   usage: '/unmute <user>',                    example: '/unmute @user',                 module: 'Moderation' },
  warn:            { description: 'Issue a formal warning to a member.',           aliases: [],                 params: '<user> [reason]',          permission: 'Manage Messages',    usage: '/warn <user> [reason]',             example: '/warn @user bad behaviour',     module: 'Moderation' },
  warnings:        { description: 'View warnings for a member.',                   aliases: ['warns'],          params: '<user>',                   permission: 'Manage Messages',    usage: '/warnings <user>',                  example: '/warnings @user',               module: 'Moderation' },
  clearwarns:      { description: 'Clear all warnings for a member.',              aliases: [],                 params: '<user>',                   permission: 'Manage Messages',    usage: '/clearwarns <user>',                example: '/clearwarns @user',             module: 'Moderation' },
  nuke:            { description: 'Clone and delete a channel to wipe its history.', aliases: [],              params: '[channel]',                permission: 'Manage Channels',    usage: '/nuke [channel]',                   example: '/nuke #general',                module: 'Moderation' },
  raid:            { description: 'Toggle raid mode for the server.',              aliases: [],                 params: '',                         permission: 'Manage Guild',       usage: '/raid',                             example: '/raid',                         module: 'Moderation' },
  bans:            { description: 'List all banned users.',                        aliases: [],                 params: '',                         permission: 'Ban Members',        usage: '/bans',                             example: '/bans',                         module: 'Moderation' },
  mutes:           { description: 'List all active timeouts.',                     aliases: [],                 params: '',                         permission: 'Moderate Members',   usage: '/mutes',                            example: '/mutes',                        module: 'Moderation' },
  stripstaff:      { description: 'Strip dangerous permissions from a member.',    aliases: [],                 params: '<user>',                   permission: 'Administrator',      usage: '/stripstaff <user>',                example: '/stripstaff @user',             module: 'Moderation' },
  silence:         { description: 'Silence a member (suppress notifications).',    aliases: [],                 params: '<user>',                   permission: 'Manage Messages',    usage: '/silence <user>',                   example: '/silence @user',                module: 'Moderation' },
  unsilence:       { description: 'Unsilence a member.',                           aliases: [],                 params: '<user>',                   permission: 'Manage Messages',    usage: '/unsilence <user>',                 example: '/unsilence @user',              module: 'Moderation' },
  // ── Utility ─────────────────────────────────────────────────────────────────
  ping:            { description: 'Check bot latency and API ping.',               aliases: [],                 params: '',                         permission: null,                 usage: '/ping',                             example: '/ping',                         module: 'Utility' },
  say:             { description: 'Make the bot send a message.',                  aliases: [],                 params: '<message> [channel]',      permission: 'Manage Messages',    usage: '/say <message> [channel]',          example: '/say Hello world',              module: 'Utility' },
  purge:           { description: 'Bulk delete messages from a channel.',          aliases: ['clear', 'prune'], params: '<amount>',                 permission: 'Manage Messages',    usage: '/purge <amount>',                   example: '/purge 50',                     module: 'Utility' },
  snipe:           { description: 'Retrieve the last deleted message.',            aliases: [],                 params: '[index]',                  permission: null,                 usage: '/snipe [index]',                    example: '/snipe',                        module: 'Utility' },
  editsnipe:       { description: 'Retrieve the last edited message.',             aliases: ['esnipe'],         params: '[index]',                  permission: null,                 usage: '/editsnipe [index]',                example: '/editsnipe',                    module: 'Utility' },
  lock:            { description: 'Lock a channel so members cannot send.',        aliases: [],                 params: '[channel]',                permission: 'Manage Channels',    usage: '/lock [channel]',                   example: '/lock #general',                module: 'Utility' },
  unlock:          { description: 'Unlock a locked channel.',                      aliases: [],                 params: '[channel]',                permission: 'Manage Channels',    usage: '/unlock [channel]',                 example: '/unlock #general',              module: 'Utility' },
  hide:            { description: 'Hide a channel from @everyone.',                aliases: [],                 params: '[channel]',                permission: 'Manage Channels',    usage: '/hide [channel]',                   example: '/hide #staff',                  module: 'Utility' },
  unhide:          { description: 'Restore visibility of a hidden channel.',       aliases: [],                 params: '[channel]',                permission: 'Manage Channels',    usage: '/unhide [channel]',                 example: '/unhide #staff',                module: 'Utility' },
  slowmode:        { description: 'Set slowmode delay on a channel.',              aliases: [],                 params: '[seconds] [channel]',      permission: 'Manage Channels',    usage: '/slowmode [seconds] [channel]',     example: '/slowmode 5',                   module: 'Utility' },
  calc:            { description: 'Evaluate a math expression.',                   aliases: ['math'],           params: '<expression>',             permission: null,                 usage: '/calc <expression>',                example: '/calc 2 + 2 * 5',               module: 'Utility' },
  afk:             { description: 'Set AFK status. Cleared on next message.',      aliases: [],                 params: '[reason]',                 permission: null,                 usage: '/afk [reason]',                     example: '/afk sleeping',                 module: 'Utility' },
  remind:          { description: 'Set a reminder that DMs you after a duration.', aliases: [],                 params: '<duration> <message>',     permission: null,                 usage: '/remind <duration> <message>',      example: '/remind 1h do the thing',       module: 'Utility' },
  translate:       { description: 'Translate text to another language.',           aliases: [],                 params: '<language> <text>',        permission: null,                 usage: '/translate <lang> <text>',          example: '/translate fr hello world',     module: 'Utility' },
  invite:          { description: 'Get the bot invite link.',                      aliases: [],                 params: '',                         permission: null,                 usage: '/invite',                           example: '/invite',                       module: 'Utility' },
  uptime:          { description: 'Check how long the bot has been online.',       aliases: [],                 params: '',                         permission: null,                 usage: '/uptime',                           example: '/uptime',                       module: 'Utility' },
  serverinfo:      { description: 'View detailed info about this server.',         aliases: ['si'],             params: '',                         permission: null,                 usage: '/serverinfo',                       example: '/serverinfo',                   module: 'Utility' },
  userinfo:        { description: 'View detailed info about a user.',              aliases: ['ui', 'whois'],    params: '[user]',                   permission: null,                 usage: '/userinfo [user]',                  example: '/userinfo @user',               module: 'Utility' },
  avatar:          { description: "Get a user's avatar.",                          aliases: ['av', 'pfp'],      params: '[user]',                   permission: null,                 usage: '/avatar [user]',                    example: '/avatar @user',                 module: 'Utility' },
  banner:          { description: "Get a user's profile banner.",                  aliases: ['bn'],             params: '[user]',                   permission: null,                 usage: '/banner [user]',                    example: '/banner @user',                 module: 'Utility' },
  embed:           { description: 'Create a custom embed message.',                aliases: ['ce'],             params: '<title> [description] [color]', permission: 'Manage Messages', usage: '/embed <title> [description] [color]', example: '/embed "Hello" "World" #ff6b9d', module: 'Utility' },
  poll:            { description: 'Create a poll with up to 5 options.',           aliases: [],                 params: '<question> [options...]',  permission: null,                 usage: '/poll <question> [options...]',     example: '/poll "Favourite color?" Red Blue', module: 'Utility' },
  // ── Logging ──────────────────────────────────────────────────────────────────
  log:             { description: 'Configure server log channels.',                aliases: ['logs', 'logging'],params: '<subcommand>',             permission: 'Manage Guild',       usage: '/log <setup|off|color|ignore|list>', example: '/log setup',                  module: 'Logging' },
  // ── Giveaways ────────────────────────────────────────────────────────────────
  giveaways:       { description: 'Manage giveaways.',                             aliases: ['gw'],             params: '<subcommand>',             permission: 'Manage Guild',       usage: '/giveaways <start|end|reroll|cancel|list|edit>', example: '/giveaways start 1h 1 Nitro', module: 'Giveaways' },
  // ── Autoresponder ─────────────────────────────────────────────────────────────
  autoresponder:   { description: 'Manage auto-response triggers.',                aliases: ['ar'],             params: '<subcommand>',             permission: 'Manage Guild',       usage: '/autoresponder <add|remove|list|clear>', example: '/autoresponder add hello Hi there!', module: 'Autoresponder' },
  // ── Reaction ─────────────────────────────────────────────────────────────────
  reaction:        { description: 'Auto-react to messages containing a trigger.',  aliases: [],                 params: '<subcommand>',             permission: 'Manage Guild',       usage: '/reaction <add|delete|list>',       example: '/reaction add 👋 hello',        module: 'Reaction' },
  // ── Wallet ───────────────────────────────────────────────────────────────────
  wallet:          { description: 'Manage your personal LTC wallet.',              aliases: [],                 params: '<subcommand>',             permission: null,                 usage: '/wallet <tos|setup|balance|deposit|send|tx|key|restore>', example: '/wallet balance', module: 'Wallet' },
  // ── Tickets ──────────────────────────────────────────────────────────────────
  ticket:          { description: 'Open a support ticket.',                        aliases: [],                 params: '',                         permission: null,                 usage: '/ticket',                           example: '/ticket',                       module: 'Tickets' },
  ticketsetup:     { description: 'Configure the ticket system.',                  aliases: [],                 params: '<subcommand>',             permission: 'Manage Guild',       usage: '/ticketsetup <setup|form|panel|close|transcript>', example: '/ticketsetup setup', module: 'Tickets' },
  // ── Welcome ───────────────────────────────────────────────────────────────────
  welcome:         { description: 'Configure welcome messages.',                   aliases: [],                 params: '<subcommand>',             permission: 'Manage Guild',       usage: '/welcome <setup|message|preview|disable|view>', example: '/welcome setup', module: 'Welcome' },
  // ── Anti-Raid ────────────────────────────────────────────────────────────────
  antiraid:        { description: 'Configure anti-raid protection.',               aliases: [],                 params: '<subcommand>',             permission: 'Administrator',      usage: '/antiraid <enable|disable|config|view>', example: '/antiraid enable', module: 'Anti-Raid' },
  // ── Vouching ─────────────────────────────────────────────────────────────────
  vouch:           { description: 'Leave a vouch/review for a user.',              aliases: [],                 params: '<user> <rating> [comment]',permission: null,                 usage: '/vouch add <user> <rating> [comment]', example: '/vouch add @user 5 great seller', module: 'Vouching' },
  // ── SellAuth ─────────────────────────────────────────────────────────────────
  setapikey:       { description: 'Set your SellAuth API key.',                    aliases: [],                 params: '<api_key>',                permission: 'Administrator',      usage: '/setapikey <key>',                  example: '/setapikey abc123',             module: 'SellAuth' },
  restock:         { description: 'Restock a product with keys or content.',       aliases: [],                 params: '<keys> [product_id] [variant_id]', permission: 'Administrator', usage: '/restock <keys>',                example: '/restock key1,key2',            module: 'SellAuth' },
};

const CATEGORY_DEFS = {
  Moderation:    { emoji: '🔨', description: 'Ban, mute, kick, warn and more' },
  Utility:       { emoji: 'ℹ️', description: 'Snipe, purge, lock, say and more' },
  Logging:       { emoji: '📋', description: 'Configure server event logs' },
  Giveaways:     { emoji: '🎉', description: 'Start and manage giveaways' },
  Autoresponder: { emoji: '💬', description: 'Auto-reply to message triggers' },
  Reaction:      { emoji: '🎯', description: 'Auto-react to messages' },
  Wallet:        { emoji: '💰', description: 'Real on-chain LTC wallet' },
  Tickets:       { emoji: '🎫', description: 'Support ticket system' },
  Welcome:       { emoji: '🌙', description: 'Welcome new members' },
  'Anti-Raid':   { emoji: '🛡️', description: 'Protect against raids' },
  Vouching:      { emoji: '⭐', description: 'Leave reputation for sellers' },
  SellAuth:      { emoji: '🛍️', description: 'Manage your SellAuth store' },
};

const COMMANDS_PER_PAGE = 5;

// Group commands by module
function getByModule() {
  const groups = {};
  for (const [name, cmd] of Object.entries(COMMANDS)) {
    if (!groups[cmd.module]) groups[cmd.module] = [];
    groups[cmd.module].push({ name, ...cmd });
  }
  return groups;
}

// Build the individual command detail embed (nights style)
function buildCommandEmbed(name, cmd, client) {
  const aliases = cmd.aliases.length ? cmd.aliases.join(', ') : 'None';
  const params  = cmd.params || 'None';
  const perm    = cmd.permission || 'None';
  const permStr = cmd.permission ? `⚠️ ${perm}` : '✅ Everyone';

  const usageBlock = [
    `Syntax  : /${name}${cmd.params ? ' ' + cmd.params : ''}`,
    `Example : ${cmd.example}`,
  ].join('\n');

  return new EmbedBuilder()
    .setColor('#5865F2')
    .setAuthor({ name: `Command: ${name}`, iconURL: client.user.displayAvatarURL() })
    .setDescription(cmd.description)
    .addFields(
      { name: 'Aliases',     value: aliases, inline: true },
      { name: 'Parameters',  value: params,  inline: true },
      { name: 'Information', value: permStr, inline: true },
    )
    .addFields({ name: 'Usage', value: `\`\`\`\n${usageBlock}\n\`\`\`` })
    .setFooter({ text: `Page 1/1 (1 entry) • Module: ${cmd.module}` });
}

// Build category listing embed with pagination
function buildCategoryPage(module, page, client) {
  const cmds = getByModule()[module] || [];
  const totalPages = Math.ceil(cmds.length / COMMANDS_PER_PAGE);
  const pageIndex  = Math.max(0, Math.min(page, totalPages - 1));
  const slice      = cmds.slice(pageIndex * COMMANDS_PER_PAGE, (pageIndex + 1) * COMMANDS_PER_PAGE);
  const cat        = CATEGORY_DEFS[module] || { emoji: '⚡', description: module };

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setAuthor({ name: `${cat.emoji} ${module}`, iconURL: client.user.displayAvatarURL() })
    .setDescription(cat.description);

  for (const cmd of slice) {
    const perm = cmd.permission ? `⚠️ ${cmd.permission}` : '✅ Everyone';
    embed.addFields({
      name: `/${cmd.name}${cmd.params ? ' ' + cmd.params : ''}`,
      value: `${cmd.description}\n${cmd.aliases.length ? `*Aliases: ${cmd.aliases.join(', ')}*` : ''}`,
      inline: false,
    });
  }

  embed.setFooter({ text: `Page ${pageIndex + 1}/${totalPages} (${cmds.length} entries) • Module: ${module}` });
  return { embed, totalPages, pageIndex };
}

function buildCategorySelectMenu() {
  const groups = getByModule();
  return new StringSelectMenuBuilder()
    .setCustomId('help_category')
    .setPlaceholder('Choose a category...')
    .addOptions(
      Object.entries(CATEGORY_DEFS)
        .filter(([mod]) => groups[mod]?.length)
        .map(([mod, cat]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${cat.emoji} ${mod}`)
            .setDescription(cat.description)
            .setValue(mod)
        )
    );
}

function buildPaginationRow(module, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help_page_${module}_${page - 1}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`help_page_${module}_${page + 1}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId('help_close')
      .setLabel('✖')
      .setStyle(ButtonStyle.Danger),
  );
}

// ─── Slash command definition ─────────────────────────────────────────────────
const help = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Browse all commands or look up a specific command')
    .addStringOption(o =>
      o.setName('command')
        .setDescription('Look up a specific command by name')
        .setRequired(false)
    ),

  async execute(interaction) {
    const client = interaction.client;
    const query  = interaction.options.getString('command')?.toLowerCase();

    // Specific command lookup
    if (query) {
      const cmd = COMMANDS[query];
      if (!cmd) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor('#ED4245').setDescription(`❌ Command \`${query}\` not found.`)],
          ephemeral: true,
        });
      }
      return interaction.reply({ embeds: [buildCommandEmbed(query, cmd, client)], ephemeral: true });
    }

    // Overview page
    const groups = getByModule();
    const totalCmds = Object.values(COMMANDS).length;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({ name: `${client.user.username} — Command Help`, iconURL: client.user.displayAvatarURL() })
      .setThumbnail(client.user.displayAvatarURL())
      .setDescription(
        `A powerful Discord bot with **${totalCmds} commands** across ${Object.keys(CATEGORY_DEFS).length} modules.\n\n` +
        `Use the dropdown to browse categories, or \`/help <command>\` to look up a specific command.\n\n` +
        `[Support](${SUPPORT_URL}) · [Website](${WEBSITE_URL})`
      )
      .addFields(
        Object.entries(CATEGORY_DEFS)
          .filter(([mod]) => groups[mod]?.length)
          .map(([mod, cat]) => ({
            name: `${cat.emoji} ${mod}`,
            value: `${groups[mod].length} command${groups[mod].length !== 1 ? 's' : ''}`,
            inline: true,
          }))
      )
      .setFooter({ text: `${totalCmds} total commands • flux` });

    const row = new ActionRowBuilder().addComponents(buildCategorySelectMenu());
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },

  async handleInteraction(interaction) {
    const client = interaction.client;

    if (interaction.isStringSelectMenu() && interaction.customId === 'help_category') {
      const module = interaction.values[0];
      const { embed, totalPages, pageIndex } = buildCategoryPage(module, 0, client);
      const rows = [
        new ActionRowBuilder().addComponents(buildCategorySelectMenu()),
        buildPaginationRow(module, pageIndex, totalPages),
      ];
      await interaction.update({ embeds: [embed], components: rows });
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'help_close') {
        await interaction.update({ components: [] });
        return;
      }

      if (interaction.customId.startsWith('help_page_')) {
        const parts  = interaction.customId.split('_');
        const page   = parseInt(parts[parts.length - 1]);
        const module = parts.slice(2, parts.length - 1).join('_');
        const { embed, totalPages, pageIndex } = buildCategoryPage(module, page, client);
        const rows = [
          new ActionRowBuilder().addComponents(buildCategorySelectMenu()),
          buildPaginationRow(module, pageIndex, totalPages),
        ];
        await interaction.update({ embeds: [embed], components: rows });
        return;
      }
    }
  },
};

module.exports = [help];
