'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  WebhookClient,
} = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const db = require('../database');
const { parseDuration, formatDuration, truncate } = require('../utils/helpers');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';

/** username\nID — two-line value matching reference embed style */
function uv(user) { return `${user.username}\n${user.id}`; }

/** Log a mod action to mod_history, returns Case # */
function logCase(guildId, userId, modId, action, reason = 'No reason provided') {
  try {
    const r = db.run(
      'INSERT INTO mod_history (guild_id, user_id, mod_id, action, reason) VALUES (?,?,?,?,?)',
      [guildId, userId, modId, action, reason],
    );
    return r?.lastInsertRowid ?? '?';
  } catch { return '?'; }
}

// ─── /ping ───────────────────────────────────────────────────────────────────
const ping = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  async execute(interaction, client) {
    const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });
    const rtt = sent.createdTimestamp - interaction.createdTimestamp;
    const ws  = Math.round(client.ws.ping);

    const bar = (ms) => ms < 100 ? '🟢' : ms < 200 ? '🟡' : '🔴';

    const embed = new EmbedBuilder()
      .setAuthor({ name: '🏓 Pong!', iconURL: client.user.displayAvatarURL() })
      .setColor(rtt < 100 ? GREEN : rtt < 200 ? YELLOW : RED)
      .addFields(
        { name: 'Roundtrip', value: `${bar(rtt)} **${rtt}ms**`, inline: true },
        { name: 'WebSocket', value: `${bar(ws)} **${ws}ms**`, inline: true },
      )
      .setFooter({ text: 'flux bot' })
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  },
};

// ─── /say ────────────────────────────────────────────────────────────────────
const say = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Make the bot say something')
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to current)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const msg = interaction.options.getString('message');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    await channel.send(msg);
    await interaction.reply({ content: '✅ Message sent.', ephemeral: true });
  },
};

// ─── /purge ──────────────────────────────────────────────────────────────────
const purge = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete messages in bulk')
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('user').setDescription('Only delete from this user'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');

    let messages = await interaction.channel.messages.fetch({ limit: 100 });
    if (user) messages = messages.filter(m => m.author.id === user.id);
    messages = [...messages.values()].slice(0, amount);

    const deleted = await interaction.channel.bulkDelete(messages, true).catch(() => ({ size: 0 }));
    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setAuthor({ name: `🗑️ Purge — ${deleted.size ?? messages.length} messages deleted`, iconURL: interaction.user.displayAvatarURL() })
      .addFields(
        { name: '📍 Channel', value: `${interaction.channel}`, inline: true },
        ...(user ? [{ name: '👤 Filter', value: `${user.tag}`, inline: true }] : []),
      )
      .setFooter({ text: 'flux bot' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};


// ─── /snipe ──────────────────────────────────────────────────────────────────
const snipe = {
  data: new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('Show the last deleted message in this channel'),
  async execute(interaction) {
    const row = db.getSnipe(interaction.guild.id, interaction.channel.id, 'delete');
    if (!row || !row.content) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Nothing to snipe in this channel.').setTimestamp()],
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${row.author_tag || 'Unknown'} — deleted message`, iconURL: row.author_avatar || undefined })
      .setDescription(row.content)
      .setColor(RED)
      .addFields({ name: '📍 Channel', value: `${interaction.channel}`, inline: true })
      .setFooter({ text: `Sniped by ${interaction.user.tag}` })
      .setTimestamp(row.deleted_at * 1000);

    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /editsnipe ──────────────────────────────────────────────────────────────
const editsnipe = {
  data: new SlashCommandBuilder()
    .setName('editsnipe')
    .setDescription('Show the last edited message (before edit)'),
  async execute(interaction) {
    const row = db.getSnipe(interaction.guild.id, interaction.channel.id, 'edit');
    if (!row || !row.content) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('❌ Nothing to editsnipe in this channel.').setTimestamp()],
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${row.author_tag || 'Unknown'} — before edit`, iconURL: row.author_avatar || undefined })
      .setDescription(row.content)
      .setColor(YELLOW)
      .addFields({ name: '📍 Channel', value: `${interaction.channel}`, inline: true })
      .setFooter({ text: `Sniped by ${interaction.user.tag}` })
      .setTimestamp(row.deleted_at * 1000);

    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /clearsnipe ─────────────────────────────────────────────────────────────
const clearsnipe = {
  data: new SlashCommandBuilder()
    .setName('clearsnipe')
    .setDescription('Clear the snipe cache for this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    db.clearSnipe(interaction.guild.id, interaction.channel.id);
    await interaction.reply({ content: '✅ Snipe cache cleared.', ephemeral: true });
  },
};

// ─── /lock ───────────────────────────────────────────────────────────────────
const lock = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel (prevent everyone from sending)')
    .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to current)'))
    .addStringOption(o => o.setName('reason').setDescription('Reason for locking'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason  = interaction.options.getString('reason') || 'No reason provided';
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    const caseId = logCase(interaction.guild.id, channel.id, interaction.user.id, 'lock', reason);
    const embed = new EmbedBuilder()
      .setColor(RED)
      .setTitle('🔒 Channel Locked')
      .addFields(
        { name: 'Channel',   value: `#${channel.name}\n${channel.id}`, inline: true },
        { name: 'Moderator', value: uv(interaction.user),              inline: true },
        { name: 'Reason',    value: reason },
      )
      .setFooter({ text: `Case #${caseId}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /unlock ─────────────────────────────────────────────────────────────────
const unlock = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to current)'))
    .addStringOption(o => o.setName('reason').setDescription('Reason for unlocking'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason  = interaction.options.getString('reason') || 'No reason provided';
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    const caseId = logCase(interaction.guild.id, channel.id, interaction.user.id, 'unlock', reason);
    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setTitle('🔓 Channel Unlocked')
      .addFields(
        { name: 'Channel',   value: `#${channel.name}\n${channel.id}`, inline: true },
        { name: 'Moderator', value: uv(interaction.user),              inline: true },
        { name: 'Reason',    value: reason },
      )
      .setFooter({ text: `Case #${caseId}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /hide ───────────────────────────────────────────────────────────────────
const hide = {
  data: new SlashCommandBuilder()
    .setName('hide')
    .setDescription('Hide a channel from @everyone')
    .addChannelOption(o => o.setName('channel').setDescription('Channel'))
    .addStringOption(o => o.setName('reason').setDescription('Reason for hiding'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason  = interaction.options.getString('reason') || 'No reason provided';
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
    const caseId = logCase(interaction.guild.id, channel.id, interaction.user.id, 'hide', reason);
    const embed = new EmbedBuilder()
      .setColor(RED)
      .setTitle('🙈 Channel Hidden')
      .addFields(
        { name: 'Channel',   value: `#${channel.name}\n${channel.id}`, inline: true },
        { name: 'Moderator', value: uv(interaction.user),              inline: true },
        { name: 'Reason',    value: reason },
      )
      .setFooter({ text: `Case #${caseId}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /unhide ─────────────────────────────────────────────────────────────────
const unhide = {
  data: new SlashCommandBuilder()
    .setName('unhide')
    .setDescription('Unhide a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel'))
    .addStringOption(o => o.setName('reason').setDescription('Reason for unhiding'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason  = interaction.options.getString('reason') || 'No reason provided';
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: null });
    const caseId = logCase(interaction.guild.id, channel.id, interaction.user.id, 'unhide', reason);
    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setTitle('👁️ Channel Visible')
      .addFields(
        { name: 'Channel',   value: `#${channel.name}\n${channel.id}`, inline: true },
        { name: 'Moderator', value: uv(interaction.user),              inline: true },
        { name: 'Reason',    value: reason },
      )
      .setFooter({ text: `Case #${caseId}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /slowmode ───────────────────────────────────────────────────────────────
const slowmode = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set channel slowmode')
    .addIntegerOption(o => o.setName('seconds').setDescription('Seconds (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .addChannelOption(o => o.setName('channel').setDescription('Channel'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const secs = interaction.options.getInteger('seconds');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    await channel.setRateLimitPerUser(secs);
    const caseId = logCase(interaction.guild.id, channel.id, interaction.user.id, 'slowmode', `${secs}s`);
    const embed = new EmbedBuilder()
      .setColor(secs === 0 ? GREEN : YELLOW)
      .setTitle(secs === 0 ? '🐇 Slowmode Disabled' : `🐌 Slowmode Set`)
      .addFields(
        { name: 'Channel',   value: `#${channel.name}\n${channel.id}`, inline: true },
        { name: 'Moderator', value: uv(interaction.user),              inline: true },
        { name: 'Duration',  value: secs === 0 ? 'Disabled' : `${secs}s` },
      )
      .setFooter({ text: `Case #${caseId}` })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// ─── /channel ────────────────────────────────────────────────────────────────
const channel = {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Manage channels')
    .addSubcommand(s => s.setName('info').setDescription('Show channel info')
      .addChannelOption(o => o.setName('channel').setDescription('Channel')))
    .addSubcommand(s => s.setName('create').setDescription('Create a channel')
      .addStringOption(o => o.setName('name').setDescription('Channel name').setRequired(true))
      .addStringOption(o => o.setName('type').setDescription('text or voice').addChoices({ name: 'text', value: 'text' }, { name: 'voice', value: 'voice' }))
      .addChannelOption(o => o.setName('category').setDescription('Category')))
    .addSubcommand(s => s.setName('delete').setDescription('Delete a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'info') {
      const ch = interaction.options.getChannel('channel') || interaction.channel;
      const typeNames = { 0: 'Text', 2: 'Voice', 4: 'Category', 5: 'Announcement', 13: 'Stage', 15: 'Forum' };
      const embed = new EmbedBuilder()
        .setTitle(`#${ch.name}`)
        .setColor(BLUE)
        .addFields(
          { name: '🆔 ID', value: ch.id, inline: true },
          { name: '📋 Type', value: typeNames[ch.type] || ch.type.toString(), inline: true },
          { name: '📅 Created', value: `<t:${Math.floor(ch.createdTimestamp / 1000)}:R>`, inline: true },
          { name: '📁 Category', value: ch.parent?.name || 'None', inline: true },
          { name: '🐌 Slowmode', value: ch.rateLimitPerUser ? `${ch.rateLimitPerUser}s` : 'Off', inline: true },
          { name: '🔒 NSFW', value: ch.nsfw ? 'Yes' : 'No', inline: true },
          { name: '📌 Topic', value: ch.topic || 'None' },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'create') {
      const name = interaction.options.getString('name');
      const type = interaction.options.getString('type') || 'text';
      const category = interaction.options.getChannel('category');
      const chType = type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
      const created = await interaction.guild.channels.create({ name, type: chType, parent: category?.id });
      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ Channel Created', iconURL: interaction.user.displayAvatarURL() })
        .addFields({ name: '📍 Channel', value: `${created}`, inline: true }, { name: '📋 Type', value: type, inline: true })
        .setFooter({ text: 'flux bot' }).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'delete') {
      const ch = interaction.options.getChannel('channel');
      const chName = ch.name;
      await ch.delete();
      const embed = new EmbedBuilder()
        .setColor(RED)
        .setAuthor({ name: '🗑️ Channel Deleted', iconURL: interaction.user.displayAvatarURL() })
        .addFields({ name: '📍 Name', value: `#${chName}`, inline: true })
        .setFooter({ text: 'flux bot' }).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

// ─── /thread ─────────────────────────────────────────────────────────────────
const thread = {
  data: new SlashCommandBuilder()
    .setName('thread')
    .setDescription('Manage threads')
    .addSubcommand(s => s.setName('add').setDescription('Add a user to a thread')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addChannelOption(o => o.setName('thread').setDescription('Thread channel').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a user from a thread')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addChannelOption(o => o.setName('thread').setDescription('Thread channel').setRequired(true)))
    .addSubcommand(s => s.setName('lock').setDescription('Lock a thread')
      .addChannelOption(o => o.setName('thread').setDescription('Thread channel').setRequired(true)))
    .addSubcommand(s => s.setName('unlock').setDescription('Unlock a thread')
      .addChannelOption(o => o.setName('thread').setDescription('Thread channel').setRequired(true)))
    .addSubcommand(s => s.setName('rename').setDescription('Rename a thread')
      .addChannelOption(o => o.setName('thread').setDescription('Thread channel').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('New name').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const threadCh = interaction.options.getChannel('thread');

    const threadEmbed = (title, color, fields = []) => new EmbedBuilder()
      .setColor(color).setAuthor({ name: title, iconURL: interaction.user.displayAvatarURL() })
      .addFields(...fields).setFooter({ text: 'flux bot' }).setTimestamp();

    if (sub === 'add') {
      const user = interaction.options.getUser('user');
      await threadCh.members.add(user.id);
      await interaction.reply({ embeds: [threadEmbed('➕ Thread Member Added', GREEN, [{ name: '👤 User', value: `<@${user.id}>`, inline: true }, { name: '🧵 Thread', value: `${threadCh}`, inline: true }])], ephemeral: true });
    } else if (sub === 'remove') {
      const user = interaction.options.getUser('user');
      await threadCh.members.remove(user.id);
      await interaction.reply({ embeds: [threadEmbed('➖ Thread Member Removed', RED, [{ name: '👤 User', value: `<@${user.id}>`, inline: true }, { name: '🧵 Thread', value: `${threadCh}`, inline: true }])], ephemeral: true });
    } else if (sub === 'lock') {
      await threadCh.setLocked(true);
      await interaction.reply({ embeds: [threadEmbed('🔒 Thread Locked', RED, [{ name: '🧵 Thread', value: `${threadCh}`, inline: true }])], ephemeral: true });
    } else if (sub === 'unlock') {
      await threadCh.setLocked(false);
      await interaction.reply({ embeds: [threadEmbed('🔓 Thread Unlocked', GREEN, [{ name: '🧵 Thread', value: `${threadCh}`, inline: true }])], ephemeral: true });
    } else if (sub === 'rename') {
      const name = interaction.options.getString('name');
      await threadCh.setName(name);
      await interaction.reply({ embeds: [threadEmbed('✏️ Thread Renamed', BLUE, [{ name: '🧵 Thread', value: `${threadCh}`, inline: true }, { name: '📝 New Name', value: name, inline: true }])], ephemeral: true });
    }
  },
};

// ─── /webhook ────────────────────────────────────────────────────────────────
const webhook = {
  data: new SlashCommandBuilder()
    .setName('webhook')
    .setDescription('Manage webhooks')
    .addSubcommand(s => s.setName('create').setDescription('Create a webhook')
      .addStringOption(o => o.setName('name').setDescription('Webhook name').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel')))
    .addSubcommand(s => s.setName('list').setDescription('List saved webhooks'))
    .addSubcommand(s => s.setName('delete').setDescription('Delete a webhook')
      .addStringOption(o => o.setName('id').setDescription('Webhook DB ID').setRequired(true)))
    .addSubcommand(s => s.setName('send').setDescription('Send a message via webhook')
      .addStringOption(o => o.setName('id').setDescription('Webhook DB ID').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageWebhooks),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const name = interaction.options.getString('name');
      const ch = interaction.options.getChannel('channel') || interaction.channel;
      const wh = await ch.createWebhook({ name });
      const id = uuidv4();
      db.addWebhook(id, interaction.guild.id, ch.id, wh.url, name);
      await interaction.reply({ content: `✅ Webhook **${name}** created in ${ch}.\nID: \`${id}\``, ephemeral: true });
    } else if (sub === 'list') {
      const whs = db.getWebhooks(interaction.guild.id);
      if (whs.length === 0) return interaction.reply({ content: 'No webhooks saved.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle('🪝 Saved Webhooks')
        .setColor(BLUE)
        .setDescription(whs.map(w => `**${w.name}** — \`${w.id}\`\n<#${w.channel_id}>`).join('\n\n'))
        .setFooter({ text: `${whs.length} webhook(s) • flux bot` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'delete') {
      const id = interaction.options.getString('id');
      const wh = db.getWebhooks(interaction.guild.id).find(w => w.id === id);
      if (!wh) return interaction.reply({ content: '❌ Webhook not found.', ephemeral: true });
      const client = new WebhookClient({ url: wh.webhook_url });
      await client.delete().catch(() => {});
      db.removeWebhook(id);
      await interaction.reply({ content: '✅ Webhook deleted.', ephemeral: true });
    } else if (sub === 'send') {
      const id = interaction.options.getString('id');
      const message = interaction.options.getString('message');
      const wh = db.getWebhooks(interaction.guild.id).find(w => w.id === id);
      if (!wh) return interaction.reply({ content: '❌ Webhook not found.', ephemeral: true });
      const client = new WebhookClient({ url: wh.webhook_url });
      await client.send(message);
      await interaction.reply({ content: '✅ Message sent via webhook.', ephemeral: true });
    }
  },
};

// ─── /stickymessage ──────────────────────────────────────────────────────────
const stickymessage = {
  data: new SlashCommandBuilder()
    .setName('stickymessage')
    .setDescription('Manage sticky messages')
    .addSubcommand(s => s.setName('add').setDescription('Add a sticky message to a channel')
      .addStringOption(o => o.setName('content').setDescription('Message content').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('Label to identify this sticky (required if adding multiple)'))
      .addIntegerOption(o => o.setName('messages').setDescription('Repost after this many messages (default 25)').setMinValue(1).setMaxValue(500))
      .addChannelOption(o => o.setName('channel').setDescription('Channel')))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a sticky message from a channel')
      .addStringOption(o => o.setName('name').setDescription('Name of the sticky to remove (omit to remove all)'))
      .addChannelOption(o => o.setName('channel').setDescription('Channel')))
    .addSubcommand(s => s.setName('view').setDescription('View sticky messages for a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel')))
    .addSubcommand(s => s.setName('list').setDescription('List all sticky messages in this server'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const sub      = interaction.options.getSubcommand();
    const ch       = interaction.options.getChannel('channel') || interaction.channel;
    const name     = interaction.options.getString('name');

    if (sub === 'add') {
      const content   = interaction.options.getString('content');
      const interval  = interaction.options.getInteger('messages') ?? 25;
      const existing  = db.getStickiesForChannel(interaction.guild.id, ch.id);
      if (existing.length > 0 && !name) {
        return interaction.reply({ content: '❌ This channel already has a sticky. Provide a `name` so you can tell them apart.', ephemeral: true });
      }
      if (name && existing.some(s => s.name === name)) {
        return interaction.reply({ content: `❌ A sticky named \`${name}\` already exists in ${ch}.`, ephemeral: true });
      }
      db.setStickyMessage(interaction.guild.id, ch.id, content, name || null, interval);
      const label = name ? ` (\`${name}\`)` : '';
      await interaction.reply({ content: `✅ Sticky message${label} added to ${ch} — reposts every **${interval}** messages.`, ephemeral: true });

    } else if (sub === 'remove') {
      const existing = db.getStickiesForChannel(interaction.guild.id, ch.id);
      if (existing.length === 0) return interaction.reply({ content: `❌ No sticky messages in ${ch}.`, ephemeral: true });
      if (name) {
        const match = existing.find(s => s.name === name);
        if (!match) return interaction.reply({ content: `❌ No sticky named \`${name}\` in ${ch}.`, ephemeral: true });
        db.removeStickyById(match.id);
        await interaction.reply({ content: `✅ Sticky \`${name}\` removed from ${ch}.`, ephemeral: true });
      } else {
        db.removeStickyMessage(interaction.guild.id, ch.id);
        await interaction.reply({ content: `✅ All ${existing.length} sticky message(s) removed from ${ch}.`, ephemeral: true });
      }

    } else if (sub === 'view') {
      const rows = db.getStickiesForChannel(interaction.guild.id, ch.id);
      if (rows.length === 0) return interaction.reply({ content: `❌ No sticky messages in ${ch}.`, ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle(`📌 Stickies in #${ch.name}`)
        .setColor(BLUE)
        .setDescription(rows.map((r, i) => {
          const label = r.name ? `**${r.name}**` : `#${i + 1}`;
          return `${label} · every ${r.interval || 25} msgs\n> ${truncate(r.content, 120)}`;
        }).join('\n\n'))
        .setFooter({ text: `${rows.length} sticky message(s)` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'list') {
      const rows = db.getAllStickyMessages(interaction.guild.id);
      if (rows.length === 0) return interaction.reply({ content: 'No sticky messages in this server.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle('📌 Sticky Messages')
        .setColor(BLUE)
        .setDescription(rows.map(r => {
          const label = r.name ? ` \`${r.name}\`` : '';
          return `<#${r.channel_id}>${label}\n> ${truncate(r.content, 80)}`;
        }).join('\n\n'))
        .setFooter({ text: `${rows.length} sticky message(s) • flux bot` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

// ─── /alias ──────────────────────────────────────────────────────────────────
const alias = {
  data: new SlashCommandBuilder()
    .setName('alias')
    .setDescription('Manage command aliases')
    .addSubcommand(s => s.setName('add').setDescription('Add an alias')
      .addStringOption(o => o.setName('alias').setDescription('Alias name').setRequired(true))
      .addStringOption(o => o.setName('command').setDescription('Command to map to').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove an alias')
      .addStringOption(o => o.setName('alias').setDescription('Alias name').setRequired(true)))
    .addSubcommand(s => s.setName('view').setDescription('View a specific alias')
      .addStringOption(o => o.setName('alias').setDescription('Alias name').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List all aliases'))
    .addSubcommand(s => s.setName('removeall').setDescription('Remove all aliases'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const a = interaction.options.getString('alias');
      const cmd = interaction.options.getString('command');
      db.addAlias(interaction.guild.id, a, cmd);
      await interaction.reply({ content: `✅ Alias \`${a}\` → \`${cmd}\` added.`, ephemeral: true });
    } else if (sub === 'remove') {
      const a = interaction.options.getString('alias');
      db.removeAlias(interaction.guild.id, a);
      await interaction.reply({ content: `✅ Alias \`${a}\` removed.`, ephemeral: true });
    } else if (sub === 'view') {
      const a = interaction.options.getString('alias');
      const row = db.getAlias(interaction.guild.id, a);
      if (!row) return interaction.reply({ content: '❌ Alias not found.', ephemeral: true });
      await interaction.reply({ content: `\`${row.alias}\` → \`${row.command}\``, ephemeral: true });
    } else if (sub === 'list') {
      const rows = db.getAllAliases(interaction.guild.id);
      if (rows.length === 0) return interaction.reply({ content: 'No aliases.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle('🔗 Command Aliases')
        .setColor(BLUE)
        .setDescription(rows.map(r => `\`${r.alias}\` → \`${r.command}\``).join('\n'))
        .setFooter({ text: `${rows.length} alias(es) • flux bot` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'removeall') {
      db.removeAllAliases(interaction.guild.id);
      await interaction.reply({ content: '✅ All aliases removed.', ephemeral: true });
    }
  },
};

// ─── /calc ───────────────────────────────────────────────────────────────────
const calc = {
  data: new SlashCommandBuilder()
    .setName('calc')
    .setDescription('Evaluate a math expression')
    .addStringOption(o => o.setName('expression').setDescription('Math expression').setRequired(true)),
  async execute(interaction) {
    const expr = interaction.options.getString('expression');
    try {
      const result = Function('"use strict"; const Math = globalThis.Math; return (' + expr + ')')();
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setAuthor({ name: '🧮 Calculator' })
        .addFields(
          { name: 'Expression', value: `\`${expr}\``, inline: true },
          { name: 'Result', value: `**${result}**`, inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } catch {
      await interaction.reply({ content: '❌ Invalid expression.', ephemeral: true });
    }
  },
};

// ─── /afk ────────────────────────────────────────────────────────────────────
const afk = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set yourself as AFK')
    .addStringOption(o => o.setName('reason').setDescription('AFK reason')),
  async execute(interaction) {
    const reason = interaction.options.getString('reason') || 'AFK';
    db.setAfk(interaction.guild.id, interaction.user.id, reason);
    const embed = new EmbedBuilder()
      .setColor(YELLOW)
      .setAuthor({ name: `💤 ${interaction.user.tag} is now AFK`, iconURL: interaction.user.displayAvatarURL() })
      .addFields({ name: '💬 Reason', value: reason })
      .setFooter({ text: 'You will be removed from AFK when you send a message.' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /remind ─────────────────────────────────────────────────────────────────
const remind = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder')
    .addStringOption(o => o.setName('time').setDescription('When to remind (e.g. 10m, 1h)').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Reminder message').setRequired(true)),
  async execute(interaction) {
    const timeStr = interaction.options.getString('time');
    const message = interaction.options.getString('message');
    const durationMs = parseDuration(timeStr);
    if (!durationMs) return interaction.reply({ content: '❌ Invalid time format.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setAuthor({ name: '⏰ Reminder Set', iconURL: interaction.user.displayAvatarURL() })
      .addFields(
        { name: '⏱️ In', value: formatDuration(durationMs), inline: true },
        { name: '💬 Message', value: message, inline: false },
      )
      .setFooter({ text: 'flux bot' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    setTimeout(async () => {
      const reminderEmbed = new EmbedBuilder()
        .setColor(YELLOW)
        .setAuthor({ name: `⏰ Reminder — ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
        .setDescription(message)
        .setFooter({ text: 'flux bot' })
        .setTimestamp();
      interaction.followUp({ content: `<@${interaction.user.id}>`, embeds: [reminderEmbed] }).catch(() => {});
    }, durationMs);
  },
};

// ─── /uptime ─────────────────────────────────────────────────────────────────
const uptime = {
  data: new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Show bot uptime'),
  async execute(interaction, client) {
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: '⏱️ Bot Uptime', iconURL: client.user.displayAvatarURL() })
      .setDescription(`**${formatDuration(client.uptime)}**`)
      .setFooter({ text: 'flux bot' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};

// botuptime → moved to prefix commands


// pins, firstmsg, google, image, prefix → moved to prefix commands

// ─── /translate ──────────────────────────────────────────────────────────────
const translate = {
  data: new SlashCommandBuilder()
    .setName('translate')
    .setDescription('Translate text')
    .addStringOption(o => o.setName('text').setDescription('Text to translate').setRequired(true))
    .addStringOption(o => o.setName('to').setDescription('Target language code (e.g. en, fr, es)').setRequired(true))
    .addStringOption(o => o.setName('from').setDescription('Source language code (default: auto)')),
  async execute(interaction) {
    await interaction.deferReply();
    const text = interaction.options.getString('text');
    const to = interaction.options.getString('to');
    const from = interaction.options.getString('from') || 'auto';

    try {
      let translated;
      if (process.env.GOOGLE_TRANSLATE_KEY) {
        const res = await axios.post(
          `https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_TRANSLATE_KEY}`,
          { q: text, target: to, source: from !== 'auto' ? from : undefined, format: 'text' },
          { timeout: 8000 }
        );
        translated = res.data.data.translations[0].translatedText;
      } else {
        const langPair = from !== 'auto' ? `${from}|${to}` : `en|${to}`;
        const res = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`, { timeout: 8000 });
        translated = res.data.responseData.translatedText;
      }

      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setAuthor({ name: '🌐 Translation', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: `Original (${from})`, value: truncate(text, 512) },
          { name: `Translated (${to})`, value: truncate(translated, 512) },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch {
      await interaction.editReply('❌ Translation failed.');
    }
  },
};

// ─── /log ────────────────────────────────────────────────────────────────────
const log = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('Configure server logging')
    .addSubcommand(s => s.setName('setup').setDescription('Set log channel')
      .addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true)))
    .addSubcommand(s => s.setName('off').setDescription('Disable logging'))
    .addSubcommand(s => s.setName('color').setDescription('Set embed color')
      .addStringOption(o => o.setName('color').setDescription('Hex color (e.g. #FF0000)').setRequired(true)))
    .addSubcommand(s => s.setName('ignore').setDescription('Ignore a channel from logs')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)))
    .addSubcommand(s => s.setName('unignore').setDescription('Unignore a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('Show current log config'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = db.getGuildSettings(interaction.guild.id);
    const ignored = (() => { try { return JSON.parse(settings?.log_ignored || '[]'); } catch { return []; } })();

    if (sub === 'setup') {
      const ch = interaction.options.getChannel('channel');
      db.upsertGuildSettings(interaction.guild.id, { log_channel: ch.id });
      await interaction.reply({ content: `✅ Log channel set to ${ch}.`, ephemeral: true });
    } else if (sub === 'off') {
      db.upsertGuildSettings(interaction.guild.id, { log_channel: null });
      await interaction.reply({ content: '✅ Logging disabled.', ephemeral: true });
    } else if (sub === 'color') {
      const color = interaction.options.getString('color');
      db.upsertGuildSettings(interaction.guild.id, { log_color: color });
      await interaction.reply({ content: `✅ Log color set to \`${color}\`.`, ephemeral: true });
    } else if (sub === 'ignore') {
      const ch = interaction.options.getChannel('channel');
      if (!ignored.includes(ch.id)) ignored.push(ch.id);
      db.upsertGuildSettings(interaction.guild.id, { log_ignored: JSON.stringify(ignored) });
      await interaction.reply({ content: `✅ ${ch} is now ignored from logs.`, ephemeral: true });
    } else if (sub === 'unignore') {
      const ch = interaction.options.getChannel('channel');
      const updated = ignored.filter(id => id !== ch.id);
      db.upsertGuildSettings(interaction.guild.id, { log_ignored: JSON.stringify(updated) });
      await interaction.reply({ content: `✅ ${ch} is no longer ignored.`, ephemeral: true });
    } else if (sub === 'list') {
      const embed = new EmbedBuilder()
        .setTitle('📋 Log Configuration')
        .setColor(BLUE)
        .addFields(
          { name: '📍 Channel', value: settings?.log_channel ? `<#${settings.log_channel}>` : 'Disabled', inline: true },
          { name: '🎨 Color', value: settings?.log_color || '#5865F2', inline: true },
          { name: '🚫 Ignored', value: ignored.length > 0 ? ignored.map(id => `<#${id}>`).join(', ') : 'None' },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

// ─── /autoresponder ──────────────────────────────────────────────────────────
const autoresponder = {
  data: new SlashCommandBuilder()
    .setName('autoresponder')
    .setDescription('Manage auto-responders')
    .addSubcommand(s => s.setName('add').setDescription('Add a trigger|response')
      .addStringOption(o => o.setName('trigger').setDescription('Trigger text').setRequired(true))
      .addStringOption(o => o.setName('response').setDescription('Response text').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a trigger')
      .addStringOption(o => o.setName('trigger').setDescription('Trigger text').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List all auto-responders'))
    .addSubcommand(s => s.setName('clear').setDescription('Clear all auto-responders'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const trigger = interaction.options.getString('trigger');
      const response = interaction.options.getString('response');
      db.addAutoresponder(interaction.guild.id, trigger, response);
      await interaction.reply({ content: `✅ Auto-responder added: \`${trigger}\` → ${truncate(response, 80)}`, ephemeral: true });
    } else if (sub === 'remove') {
      const trigger = interaction.options.getString('trigger');
      db.removeAutoresponder(interaction.guild.id, trigger);
      await interaction.reply({ content: `✅ Auto-responder \`${trigger}\` removed.`, ephemeral: true });
    } else if (sub === 'list') {
      const rows = db.getAutoresponders(interaction.guild.id);
      if (rows.length === 0) return interaction.reply({ content: 'No auto-responders.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle('📢 Auto-Responders')
        .setColor(BLUE)
        .setDescription(rows.map(r => `\`${r.trigger}\`\n> ${truncate(r.response, 80)}`).join('\n\n'))
        .setFooter({ text: `${rows.length} trigger(s) • flux bot` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'clear') {
      db.clearAutoresponders(interaction.guild.id);
      await interaction.reply({ content: '✅ All auto-responders cleared.', ephemeral: true });
    }
  },
};

// ─── /reaction ───────────────────────────────────────────────────────────────
const reaction = {
  data: new SlashCommandBuilder()
    .setName('reaction')
    .setDescription('Manage auto-reactions')
    .addSubcommand(s => s.setName('add').setDescription('Add auto-reaction trigger')
      .addStringOption(o => o.setName('trigger').setDescription('Trigger text').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji to react with').setRequired(true)))
    .addSubcommand(s => s.setName('delete').setDescription('Remove an auto-reaction')
      .addStringOption(o => o.setName('trigger').setDescription('Trigger').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true)))
    .addSubcommand(s => s.setName('deleteall').setDescription('Delete all auto-reactions'))
    .addSubcommand(s => s.setName('list').setDescription('List auto-reactions'))
    .addSubcommand(s => s.setName('messages').setDescription('Add a reaction role message')
      .addStringOption(o => o.setName('message_id').setDescription('Message ID').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const trigger = interaction.options.getString('trigger');
      const emoji = interaction.options.getString('emoji');
      db.addReaction(interaction.guild.id, trigger, emoji);
      await interaction.reply({ content: `✅ Auto-reaction added: \`${trigger}\` → ${emoji}`, ephemeral: true });
    } else if (sub === 'delete') {
      const trigger = interaction.options.getString('trigger');
      const emoji = interaction.options.getString('emoji');
      db.removeReaction(interaction.guild.id, trigger, emoji);
      await interaction.reply({ content: `✅ Auto-reaction removed.`, ephemeral: true });
    } else if (sub === 'deleteall') {
      db.deleteAllReactions(interaction.guild.id);
      await interaction.reply({ content: '✅ All auto-reactions deleted.', ephemeral: true });
    } else if (sub === 'list') {
      const rows = db.getReactions(interaction.guild.id);
      if (rows.length === 0) return interaction.reply({ content: 'No auto-reactions.', ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle('📣 Auto-Reactions')
        .setColor(BLUE)
        .setDescription(rows.map(r => `${r.emoji}  \`${r.trigger}\``).join('\n'))
        .setFooter({ text: `${rows.length} reaction(s) • flux bot` })
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'messages') {
      const msgId = interaction.options.getString('message_id');
      const emoji = interaction.options.getString('emoji');
      const role = interaction.options.getRole('role');
      db.addReactionMessage(interaction.guild.id, msgId, emoji, role.id);
      await interaction.reply({ content: `✅ Reaction role set: ${emoji} on \`${msgId}\` → ${role}.`, ephemeral: true });
    }
  },
};

// ─── /serverinfo ─────────────────────────────────────────────────────────────
const serverinfo = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show information about this server'),
  async execute(interaction) {
    const g = interaction.guild;
    await g.members.fetch().catch(() => {});
    const bots  = g.members.cache.filter(m => m.user.bot).size;
    const humans = g.memberCount - bots;
    const channels = g.channels.cache;
    const text  = channels.filter(c => c.type === ChannelType.GuildText).size;
    const voice = channels.filter(c => c.type === ChannelType.GuildVoice).size;
    const boost = g.premiumSubscriptionCount || 0;

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: g.name, iconURL: g.iconURL() ?? undefined })
      .setThumbnail(g.iconURL({ size: 256 }) ?? null)
      .addFields(
        { name: '🆔 Server ID',     value: g.id,                                              inline: true },
        { name: '👑 Owner',          value: `<@${g.ownerId}>`,                                 inline: true },
        { name: '📅 Created',        value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`,  inline: true },
        { name: '👥 Members',        value: `${g.memberCount} (${humans} humans, ${bots} bots)`, inline: true },
        { name: '💬 Channels',       value: `${text} text · ${voice} voice`,                   inline: true },
        { name: '🎭 Roles',          value: `${g.roles.cache.size}`,                           inline: true },
        { name: '😀 Emojis',         value: `${g.emojis.cache.size}`,                          inline: true },
        { name: '✨ Boost Level',    value: `Level ${g.premiumTier} (${boost} boosts)`,         inline: true },
        { name: '🔒 Verification',   value: g.verificationLevel.toString(),                    inline: true },
      )
      .setFooter({ text: 'flux bot' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /userinfo ───────────────────────────────────────────────────────────────
const userinfo = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show information about a user')
    .addUserOption(o => o.setName('user').setDescription('User (defaults to yourself)')),
  async execute(interaction) {
    const user   = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id) || await interaction.guild.members.fetch(user.id).catch(() => null);

    const roles = member?.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `${r}`)
      .slice(0, 10)
      .join(', ') || 'None';

    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : BLUE)
      .setAuthor({ name: `${user.tag}`, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🆔 User ID',     value: user.id,                                                                      inline: true },
        { name: '🤖 Bot',         value: user.bot ? 'Yes' : 'No',                                                      inline: true },
        { name: '📅 Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,                      inline: true },
        ...(member ? [
          { name: '📥 Joined Server',  value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,                    inline: true },
          { name: '🎭 Top Role',       value: `${member.roles.highest}`,                                               inline: true },
          { name: '🏷️ Nickname',       value: member.nickname || 'None',                                               inline: true },
          { name: `🎭 Roles (${member.roles.cache.size - 1})`, value: roles.slice(0, 512) },
        ] : []),
      )
      .setFooter({ text: 'flux bot' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /avatar ─────────────────────────────────────────────────────────────────
const avatar = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Show a user's avatar")
    .addUserOption(o => o.setName('user').setDescription('User (defaults to yourself)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);
    const guildAvatar = member?.avatarURL({ size: 1024 });
    const globalAvatar = user.displayAvatarURL({ size: 1024 });

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${user.tag}'s avatar` })
      .setImage(guildAvatar || globalAvatar)
      .setFooter({ text: 'flux bot' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Global').setStyle(ButtonStyle.Link).setURL(globalAvatar),
      ...(guildAvatar ? [new ButtonBuilder().setLabel('Server').setStyle(ButtonStyle.Link).setURL(guildAvatar)] : []),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};

// ─── /banner ─────────────────────────────────────────────────────────────────
const banner = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription("Show a user's profile banner")
    .addUserOption(o => o.setName('user').setDescription('User (defaults to yourself)')),
  async execute(interaction) {
    const user = await (interaction.options.getUser('user') || interaction.user).fetch();
    const bannerURL = user.bannerURL({ size: 1024 });

    if (!bannerURL) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ **${user.tag}** has no banner.`)],
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(user.accentColor ?? BLUE)
      .setAuthor({ name: `${user.tag}'s banner` })
      .setImage(bannerURL)
      .setFooter({ text: 'flux bot' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /embed ──────────────────────────────────────────────────────────────────
const embed = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Send a custom embed')
    .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Embed body').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Hex color (e.g. #7c6ff7)'))
    .addStringOption(o => o.setName('image').setDescription('Image URL'))
    .addStringOption(o => o.setName('thumbnail').setDescription('Thumbnail URL'))
    .addStringOption(o => o.setName('footer').setDescription('Footer text'))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to send in (defaults to current)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const title       = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color       = interaction.options.getString('color') || BLUE;
    const image       = interaction.options.getString('image');
    const thumbnail   = interaction.options.getString('thumbnail');
    const footer      = interaction.options.getString('footer');
    const ch          = interaction.options.getChannel('channel') || interaction.channel;

    const customEmbed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();

    if (image)     customEmbed.setImage(image);
    if (thumbnail) customEmbed.setThumbnail(thumbnail);
    if (footer)    customEmbed.setFooter({ text: footer });

    await ch.send({ embeds: [customEmbed] });
    await interaction.reply({ content: `✅ Embed sent in ${ch}.`, ephemeral: true });
  },
};

// ─── /poll ───────────────────────────────────────────────────────────────────
const poll = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll')
    .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(o => o.setName('options').setDescription('Options separated by | (up to 5, leave blank for yes/no)'))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to send in')),
  async execute(interaction) {
    const question = interaction.options.getString('question');
    const optStr   = interaction.options.getString('options');
    const ch       = interaction.options.getChannel('channel') || interaction.channel;

    const EMOJIS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
    const options = optStr
      ? optStr.split('|').map(s => s.trim()).filter(Boolean).slice(0, 5)
      : null;

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `📊 Poll by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTitle(question)
      .setDescription(options ? options.map((o, i) => `${EMOJIS[i]} ${o}`).join('\n') : '👍 Yes   ·   👎 No')
      .setFooter({ text: 'flux bot' })
      .setTimestamp();

    const msg = await ch.send({ embeds: [embed] });
    if (options) {
      for (let i = 0; i < options.length; i++) await msg.react(EMOJIS[i]).catch(() => {});
    } else {
      await msg.react('👍').catch(() => {});
      await msg.react('👎').catch(() => {});
    }

    await interaction.reply({ content: `✅ Poll sent in ${ch}.`, ephemeral: true });
  },
};

module.exports = [
  ping, say, purge, snipe, editsnipe, clearsnipe,
  lock, unlock, hide, unhide, slowmode, channel, thread, webhook,
  stickymessage, alias, calc, afk, remind, uptime,
  translate,
  log, autoresponder, reaction,
  serverinfo, userinfo, avatar, banner, embed, poll,
];
