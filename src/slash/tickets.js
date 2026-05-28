'use strict';

const crypto = require('crypto');
const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, StringSelectMenuBuilder,
} = require('discord.js');
const db = require('../database');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';

function getTranscriptBase() {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return process.env.API_URL || 'http://localhost:4000';
}

// ─── Build category select menu ───────────────────────────────────────────────

function buildCategoryMenu(categories) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_panel_select')
    .setPlaceholder('Choose a category...')
    .addOptions(categories.slice(0, 25).map(c => {
      const opt = {
        label: c.name.slice(0, 100),
        value: c.name.slice(0, 100),
        description: (c.description || 'Open a support ticket').slice(0, 100),
      };
      if (c.emoji) {
        const isCustomId = /^\d+$/.test(c.emoji.trim());
        opt.emoji = isCustomId ? { id: c.emoji.trim() } : { name: c.emoji.trim() };
      }
      return opt;
    }));
  return new ActionRowBuilder().addComponents(select);
}

// ─── Core: open a ticket ──────────────────────────────────────────────────────

async function openTicket(interaction, client, categoryName) {
  // interaction may be deferred or not — caller should defer before calling
  const guildId = interaction.guildId;

  const settings = db.getTicketSettings(guildId);
  if (!settings || !settings.enabled) {
    return interaction.editReply({ content: '❌ Ticket system is not enabled. Ask an admin to run `/ticketsetup setup`.' });
  }

  const existing = db.all(
    'SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = ?',
    [guildId, interaction.user.id, 'open']
  );
  if (existing.length > 0) {
    return interaction.editReply({ content: `❌ You already have an open ticket: <#${existing[0].channel_id}>` });
  }

  // Determine Discord category channel for ticket
  let discordCategoryId = settings.category_id;
  let catLabel = null;

  if (categoryName) {
    const cat = db.getTicketCategory(guildId, categoryName);
    if (cat) {
      discordCategoryId = cat.discord_category_id;
      catLabel = cat.name;
    }
  }

  if (!discordCategoryId) {
    return interaction.editReply({ content: '❌ Ticket system has no category configured. Ask an admin to run `/ticketsetup setup`.' });
  }

  db.incrementTicketCount(guildId);
  const ticketNumber = db.getTicketSettings(guildId).ticket_count;
  const padded = String(ticketNumber).padStart(4, '0');

  const supportRole = settings.support_role
    ? interaction.guild.roles.cache.get(settings.support_role)
    : null;

  const channel = await interaction.guild.channels.create({
    name: `ticket-${padded}`,
    type: ChannelType.GuildText,
    parent: discordCategoryId,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      ...(supportRole ? [{
        id: supportRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      }] : []),
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
  });

  db.createTicketFull(guildId, channel.id, interaction.user.id, ticketNumber, catLabel);

  const titleStr = catLabel ? `${catLabel} — Ticket #${padded}` : `Ticket #${padded}`;

  const embed = new EmbedBuilder()
    .setTitle(`🎫 ${titleStr}`)
    .setDescription(
      (settings.open_message || '') ||
      '**How can we help you?**\nPlease describe your issue and a staff member will assist you shortly.'
    )
    .setColor(BLUE)
    .setThumbnail(interaction.guild.iconURL())
    .addFields(
      { name: '👤 Opened by', value: `<@${interaction.user.id}> (ID: \`${interaction.user.id}\`)`, inline: true },
      { name: '🛡️ Assigned Staff', value: 'Unassigned', inline: true },
    )
    .setFooter({ text: `Ticket #${padded} • nights bot` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('Assign me')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✋'),
  );

  const mention = supportRole ? `${supportRole} ` : '';
  const sentMsg = await channel.send({
    content: `${mention}<@${interaction.user.id}>`,
    embeds: [embed],
    components: [row],
  });

  // Store message ID so claim/close can update the embed
  db.updateTicketOpenMessage(channel.id, sentMsg.id);

  // Form embed (if configured)
  if (settings.form_enabled && settings.form_fields) {
    let fields;
    try { fields = JSON.parse(settings.form_fields); } catch { fields = []; }
    if (fields.length > 0) {
      const formEmbed = new EmbedBuilder()
        .setTitle(settings.form_title || '📝 Please fill in the form below')
        .setDescription(fields.map((f, i) => `**${i + 1}.** ${f}`).join('\n'))
        .setColor(settings.form_color || BLUE);
      if (settings.form_footer) formEmbed.setFooter({ text: settings.form_footer });
      await channel.send({ embeds: [formEmbed] });
    }
  }

  await interaction.editReply({ content: `✅ Your ticket has been opened: ${channel}` });
}

// ─── Core: close a ticket ─────────────────────────────────────────────────────

async function executeClose(interaction, client, reason) {
  const channel = interaction.channel;
  const t = db.getTicketByChannel(channel.id);
  if (!t) return; // caller validates

  const settings = db.getTicketSettings(interaction.guild.id);

  // Fetch up to 500 messages for transcript
  const messages = [];
  let lastId = null;
  for (let i = 0; i < 5; i++) {
    const opts = { limit: 100 };
    if (lastId) opts.before = lastId;
    const batch = await channel.messages.fetch(opts).catch(() => null);
    if (!batch || batch.size === 0) break;
    messages.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Build + save transcript
  const token = crypto.randomBytes(16).toString('hex');
  const transcriptData = messages.map(m => ({
    time: m.createdTimestamp,
    authorId: m.author.id,
    authorTag: m.author.tag,
    authorAvatar: m.author.displayAvatarURL({ size: 64 }),
    content: m.content || null,
    hasEmbed: m.embeds.length > 0,
    attachments: [...m.attachments.values()].map(a => ({ name: a.name, url: a.url })),
  }));
  db.saveTranscript(token, interaction.guild.id, channel.id, t.ticket_number, JSON.stringify(transcriptData));

  const transcriptUrl = `${getTranscriptBase()}/transcript/${token}`;

  // Close in DB
  db.closeTicketWithDetails(channel.id, reason || 'No reason provided');

  const ticketNum   = String(t.ticket_number).padStart(4, '0');
  const opener      = await client.users.fetch(t.user_id).catch(() => null);
  const participants = [...new Set(messages.filter(m => !m.author.bot).map(m => m.author.id))];
  const totalMsgs   = messages.filter(m => !m.author.bot).length;

  const transcriptRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('View Transcript')
      .setStyle(ButtonStyle.Link)
      .setURL(transcriptUrl)
      .setEmoji('📄'),
  );

  // ── Close embed (sent in ticket channel) ──────────────────────────────────
  const closeEmbed = new EmbedBuilder()
    .setColor(RED)
    .setTitle('🔒 Ticket Closed')
    .setThumbnail(interaction.guild.iconURL())
    .addFields(
      {
        name: '📋 Ticket Details',
        value: [
          `**Category:** ${t.category_name || 'General'}`,
          `**Close Reason:** ${reason || 'No reason provided'}`,
          `**Closed by:** <@${interaction.user.id}>`,
          `**Claimed by:** ${t.claimed_by ? `<@${t.claimed_by}>` : 'Unassigned'}`,
          `**Total Messages:** ${totalMsgs}`,
        ].join('\n'),
      },
      {
        name: '👥 Participants',
        value: participants.length > 0
          ? participants.slice(0, 20).map(id => `<@${id}>`).join(', ')
          : 'None',
      },
    )
    .setFooter({ text: `Ticket #${ticketNum} • deleting in 5 seconds` })
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed], components: [transcriptRow] });

  // ── Log embed ─────────────────────────────────────────────────────────────
  if (settings?.log_channel) {
    const logCh = interaction.guild.channels.cache.get(settings.log_channel);
    if (logCh) {
      const logEmbed = new EmbedBuilder()
        .setColor(RED)
        .setTitle(`📋 Ticket Closed — #${ticketNum}`)
        .addFields(
          { name: '🔒 Closed by',      value: `<@${interaction.user.id}>`,                                inline: true },
          { name: '👤 Ticket Creator', value: opener ? `<@${opener.id}>` : `\`${t.user_id}\``,           inline: true },
          { name: '📁 Channel',        value: `#${channel.name} (${t.category_name || 'General'})`,       inline: true },
          { name: '📝 Reason',         value: reason || 'No reason provided',                             inline: false },
          { name: '💬 Total Messages', value: String(totalMsgs),                                          inline: true },
        )
        .setFooter({ text: 'nights bot' })
        .setTimestamp();
      await logCh.send({ embeds: [logEmbed], components: [transcriptRow] }).catch(() => {});
    }
  }

  // ── DM ticket opener ──────────────────────────────────────────────────────
  if (opener) {
    await opener.send({
      embeds: [new EmbedBuilder()
        .setColor(RED)
        .setDescription(`Your ticket **#${ticketNum}** in **${interaction.guild.name}** has been closed.`)
        .addFields({ name: '📝 Reason', value: reason || 'No reason provided' })
        .setTimestamp()],
      components: [transcriptRow],
    }).catch(() => {});
  }

  setTimeout(() => channel.delete().catch(() => {}), 5000);
}

// ─── Core: claim a ticket ─────────────────────────────────────────────────────

async function executeClaim(interaction, client) {
  const t = db.getTicketByChannel(interaction.channel.id);
  if (!t) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
  if (t.status !== 'open') return interaction.reply({ content: '❌ This ticket is already closed.', ephemeral: true });

  const isClaimer = t.claimed_by === interaction.user.id;
  db.claimTicket(interaction.channel.id, isClaimer ? null : interaction.user.id);

  // Update the original open message embed
  if (t.open_message_id) {
    try {
      const msg = await interaction.channel.messages.fetch(t.open_message_id);
      if (msg?.embeds?.[0]) {
        const embed = EmbedBuilder.from(msg.embeds[0]);
        const fields = (embed.data.fields || []).map(f =>
          f.name === '🛡️ Assigned Staff'
            ? { ...f, value: isClaimer ? 'Unassigned' : `<@${interaction.user.id}>` }
            : f
        );
        embed.setFields(fields);
        await msg.edit({ embeds: [embed] }).catch(() => {});
      }
    } catch (_) {}
  }

  return interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(isClaimer ? YELLOW : GREEN)
      .setDescription(
        isClaimer
          ? `↩️ <@${interaction.user.id}> unclaimed this ticket.`
          : `✋ **Ticket Claimed!**\n<@${interaction.user.id}> is now handling this ticket.`
      )
      .setTimestamp()],
    ephemeral: true,
  });
}

// ─── /ticket ─────────────────────────────────────────────────────────────────

const ticket = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Open a support ticket'),

  async execute(interaction, client) {
    const categories = db.getTicketCategories(interaction.guildId);

    if (categories.length > 0) {
      return interaction.reply({
        content: '**Select a category to open a ticket:**',
        components: [buildCategoryMenu(categories)],
        ephemeral: true,
      });
    }

    // No categories — open directly
    await interaction.deferReply({ ephemeral: true });
    return openTicket(interaction, client, null);
  },

  // Exposed for use in interactionCreate.js
  openTicket,
};

// ─── /ticketsetup ─────────────────────────────────────────────────────────────

const ticketsetup = {
  data: new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Configure the ticket system')
    .addSubcommand(s => s.setName('setup').setDescription('Initial setup')
      .addChannelOption(o => o.setName('category').setDescription('Default Discord category for tickets').setRequired(true))
      .addRoleOption(o => o.setName('support_role').setDescription('Support role'))
      .addChannelOption(o => o.setName('log_channel').setDescription('Log channel'))
      .addStringOption(o => o.setName('open_message').setDescription('Welcome message in new tickets')))
    .addSubcommand(s => s.setName('panel').setDescription('Post the ticket panel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post panel in (defaults to current)'))
      .addStringOption(o => o.setName('image').setDescription('Banner image URL'))
      .addStringOption(o => o.setName('title').setDescription('Panel title'))
      .addStringOption(o => o.setName('description').setDescription('Panel description'))
      .addStringOption(o => o.setName('thumbnail').setDescription('Thumbnail URL (default: server icon)')))
    .addSubcommand(s => s.setName('addcategory').setDescription('Add a ticket category')
      .addStringOption(o => o.setName('name').setDescription('Category display name').setRequired(true))
      .addChannelOption(o => o.setName('discord_category').setDescription('Discord category channel for this type').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Short description shown in dropdown'))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji (unicode or custom emoji ID)')))
    .addSubcommand(s => s.setName('removecategory').setDescription('Remove a ticket category')
      .addStringOption(o => o.setName('name').setDescription('Category name to remove').setRequired(true)))
    .addSubcommand(s => s.setName('categories').setDescription('List all configured ticket categories'))
    .addSubcommand(s => s.setName('close').setDescription('Close the current ticket')
      .addStringOption(o => o.setName('reason').setDescription('Close reason')))
    .addSubcommand(s => s.setName('transcript').setDescription('Save transcript and close ticket'))
    .addSubcommand(s => s.setName('add').setDescription('Add a user to this ticket')
      .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a user from this ticket')
      .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)))
    .addSubcommand(s => s.setName('alert').setDescription('Ping the ticket creator to respond')
      .addStringOption(o => o.setName('message').setDescription('Custom alert message')))
    .addSubcommand(s => s.setName('move').setDescription('Move ticket to a different category')
      .addStringOption(o => o.setName('category').setDescription('Category name to move to').setRequired(true)))
    .addSubcommand(s => s.setName('rename').setDescription('Rename the ticket channel')
      .addStringOption(o => o.setName('name').setDescription('New channel name').setRequired(true)))
    .addSubcommand(s => s.setName('form').setDescription('Configure the ticket form')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable form').setRequired(true))
      .addStringOption(o => o.setName('fields').setDescription('Fields (comma-separated)'))
      .addStringOption(o => o.setName('title').setDescription('Form title'))
      .addStringOption(o => o.setName('footer').setDescription('Form footer'))
      .addStringOption(o => o.setName('color').setDescription('Form embed color')))
    .addSubcommand(s => s.setName('view').setDescription('View current ticket settings'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    // ── setup ────────────────────────────────────────────────────────────────
    if (sub === 'setup') {
      const category    = interaction.options.getChannel('category');
      const supportRole = interaction.options.getRole('support_role');
      const logChannel  = interaction.options.getChannel('log_channel');
      const openMessage = interaction.options.getString('open_message');

      db.upsertTicketSettings(interaction.guild.id, {
        category_id:  category.id,
        support_role: supportRole?.id  || null,
        log_channel:  logChannel?.id   || null,
        open_message: openMessage       || null,
        enabled: 1,
      });

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(GREEN)
          .setAuthor({ name: '✅ Ticket System Configured', iconURL: interaction.user.displayAvatarURL() })
          .addFields(
            { name: '📁 Default Category', value: `${category}`,                           inline: true },
            { name: '🛡️ Support Role',    value: supportRole ? `${supportRole}` : 'None', inline: true },
            { name: '📋 Log Channel',      value: logChannel  ? `${logChannel}`  : 'None', inline: true },
          )
          .setFooter({ text: 'nights bot' }).setTimestamp()],
        ephemeral: true,
      });

    // ── panel ────────────────────────────────────────────────────────────────
    } else if (sub === 'panel') {
      const ch        = interaction.options.getChannel('channel') || interaction.channel;
      const image     = interaction.options.getString('image');
      const title     = interaction.options.getString('title')       || 'Support Tickets';
      const desc      = interaction.options.getString('description') ||
        'Need help? Select a category below to open a support ticket.\nA staff member will assist you as soon as possible.';
      const thumbnail = interaction.options.getString('thumbnail');

      const categories = db.getTicketCategories(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle(`🎫 ${title}`)
        .setDescription(desc)
        .setColor(BLUE)
        .setThumbnail(thumbnail || interaction.guild.iconURL())
        .setFooter({ text: interaction.guild.name })
        .setTimestamp();
      if (image) embed.setImage(image);

      const components = categories.length > 0
        ? [buildCategoryMenu(categories)]
        : [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('open_ticket')
              .setLabel('Open Ticket')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🎫')
          )];

      await ch.send({ embeds: [embed], components });
      return interaction.reply({ content: `✅ Ticket panel posted in ${ch}.`, ephemeral: true });

    // ── addcategory ──────────────────────────────────────────────────────────
    } else if (sub === 'addcategory') {
      const name        = interaction.options.getString('name');
      const discordCat  = interaction.options.getChannel('discord_category');
      const description = interaction.options.getString('description');
      const emoji       = interaction.options.getString('emoji');

      if (discordCat.type !== ChannelType.GuildCategory) {
        return interaction.reply({
          content: '❌ `discord_category` must be a **Category** channel, not a text/voice channel.',
          ephemeral: true,
        });
      }

      if (db.getTicketCategory(interaction.guild.id, name)) {
        return interaction.reply({ content: `❌ A category named **${name}** already exists.`, ephemeral: true });
      }

      db.addTicketCategory(interaction.guild.id, name, description, emoji, discordCat.id);

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(GREEN)
          .setTitle('✅ Category Added')
          .addFields(
            { name: '📁 Name',              value: name,                     inline: true },
            { name: '📂 Discord Category', value: `${discordCat}`,          inline: true },
            { name: '📝 Description',      value: description || 'None',    inline: true },
          )
          .setFooter({ text: 'nights bot' }).setTimestamp()],
        ephemeral: true,
      });

    // ── removecategory ───────────────────────────────────────────────────────
    } else if (sub === 'removecategory') {
      const name = interaction.options.getString('name');
      if (!db.getTicketCategory(interaction.guild.id, name)) {
        return interaction.reply({ content: `❌ No category named **${name}** found.`, ephemeral: true });
      }
      db.removeTicketCategory(interaction.guild.id, name);
      return interaction.reply({ content: `✅ Category **${name}** removed.`, ephemeral: true });

    // ── categories ───────────────────────────────────────────────────────────
    } else if (sub === 'categories') {
      const cats = db.getTicketCategories(interaction.guild.id);
      if (cats.length === 0) {
        return interaction.reply({
          content: '📭 No categories configured yet. Use `/ticketsetup addcategory` to add one.',
          ephemeral: true,
        });
      }
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('📁 Ticket Categories')
        .setDescription(cats.map((c, i) => {
          const ch = interaction.guild.channels.cache.get(c.discord_category_id);
          return `**${i + 1}. ${c.emoji ? c.emoji + ' ' : ''}${c.name}**\n└ ${c.description || 'No description'} • \`${ch ? ch.name : c.discord_category_id}\``;
        }).join('\n\n'))
        .setFooter({ text: `${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });

    // ── close ────────────────────────────────────────────────────────────────
    } else if (sub === 'close') {
      const t = db.getTicketByChannel(interaction.channel.id);
      if (!t || t.status !== 'open') {
        return interaction.reply({ content: '❌ This is not an open ticket channel.', ephemeral: true });
      }
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await interaction.deferReply({ ephemeral: true });
      await executeClose(interaction, client, reason);
      await interaction.editReply({ content: '🔒 Ticket closed.' }).catch(() => {});

    // ── transcript ───────────────────────────────────────────────────────────
    } else if (sub === 'transcript') {
      const t = db.getTicketByChannel(interaction.channel.id);
      if (!t || t.status !== 'open') {
        return interaction.reply({ content: '❌ This is not an open ticket channel.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      await executeClose(interaction, client, 'Transcript saved');
      await interaction.editReply({ content: '📄 Transcript saved and ticket closed.' }).catch(() => {});

    // ── add ──────────────────────────────────────────────────────────────────
    } else if (sub === 'add') {
      if (!db.getTicketByChannel(interaction.channel.id)) {
        return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
      }
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      });
      return interaction.reply({ content: `✅ Added <@${user.id}> to the ticket.`, ephemeral: true });

    // ── remove ───────────────────────────────────────────────────────────────
    } else if (sub === 'remove') {
      const t = db.getTicketByChannel(interaction.channel.id);
      if (!t) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
      const user = interaction.options.getUser('user');
      if (user.id === t.user_id) {
        return interaction.reply({ content: '❌ Cannot remove the ticket creator.', ephemeral: true });
      }
      await interaction.channel.permissionOverwrites.delete(user.id);
      return interaction.reply({ content: `✅ Removed <@${user.id}> from the ticket.`, ephemeral: true });

    // ── alert ────────────────────────────────────────────────────────────────
    } else if (sub === 'alert') {
      const t = db.getTicketByChannel(interaction.channel.id);
      if (!t || t.status !== 'open') {
        return interaction.reply({ content: '❌ Not an open ticket channel.', ephemeral: true });
      }
      const msg = interaction.options.getString('message')
        || 'The staff team is awaiting your response. Please reply as soon as possible.';
      await interaction.channel.send({
        content: `<@${t.user_id}>`,
        embeds: [new EmbedBuilder()
          .setColor(YELLOW)
          .setTitle('🔔 Ticket Alert')
          .setDescription(msg)
          .setFooter({ text: `Sent by ${interaction.user.tag}` })
          .setTimestamp()],
      });
      return interaction.reply({ content: '✅ Alert sent.', ephemeral: true });

    // ── move ─────────────────────────────────────────────────────────────────
    } else if (sub === 'move') {
      const t = db.getTicketByChannel(interaction.channel.id);
      if (!t || t.status !== 'open') {
        return interaction.reply({ content: '❌ Not an open ticket channel.', ephemeral: true });
      }
      const catName = interaction.options.getString('category');
      const cat = db.getTicketCategory(interaction.guild.id, catName);
      if (!cat) {
        return interaction.reply({
          content: `❌ No category named **${catName}**. Check \`/ticketsetup categories\`.`,
          ephemeral: true,
        });
      }
      await interaction.channel.setParent(cat.discord_category_id, { lockPermissions: false });
      db.run('UPDATE tickets SET category_name = ? WHERE channel_id = ?', [cat.name, interaction.channel.id]);

      // Update embed title if possible
      if (t.open_message_id) {
        try {
          const ticketMsg = await interaction.channel.messages.fetch(t.open_message_id);
          if (ticketMsg?.embeds?.[0]) {
            const padded = String(t.ticket_number).padStart(4, '0');
            const updEmbed = EmbedBuilder.from(ticketMsg.embeds[0]);
            updEmbed.setTitle(`🎫 ${cat.name} — Ticket #${padded}`);
            await ticketMsg.edit({ embeds: [updEmbed] }).catch(() => {});
          }
        } catch (_) {}
      }

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(GREEN)
          .setDescription(`✅ Ticket moved to **${cat.name}**`)
          .setTimestamp()],
        ephemeral: true,
      });

    // ── rename ───────────────────────────────────────────────────────────────
    } else if (sub === 'rename') {
      if (!db.getTicketByChannel(interaction.channel.id)) {
        return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
      }
      const newName = interaction.options.getString('name')
        .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').slice(0, 100);
      await interaction.channel.setName(newName);
      return interaction.reply({ content: `✅ Channel renamed to \`${newName}\`.`, ephemeral: true });

    // ── form ─────────────────────────────────────────────────────────────────
    } else if (sub === 'form') {
      const enabled   = interaction.options.getBoolean('enabled');
      const fields    = interaction.options.getString('fields');
      const title     = interaction.options.getString('title');
      const footer    = interaction.options.getString('footer');
      const color     = interaction.options.getString('color');
      const fieldsArr = fields ? fields.split(',').map(f => f.trim()) : [];

      db.upsertTicketSettings(interaction.guild.id, {
        form_enabled: enabled ? 1 : 0,
        form_fields:  JSON.stringify(fieldsArr),
        form_title:   title  || null,
        form_footer:  footer || null,
        form_color:   color  || BLUE,
      });

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(enabled ? GREEN : RED)
          .setAuthor({ name: `📝 Form ${enabled ? 'Enabled' : 'Disabled'}`, iconURL: interaction.user.displayAvatarURL() })
          .addFields({ name: '📋 Fields', value: fieldsArr.length > 0 ? fieldsArr.join(', ') : 'None' })
          .setFooter({ text: 'nights bot' }).setTimestamp()],
        ephemeral: true,
      });

    // ── view ─────────────────────────────────────────────────────────────────
    } else if (sub === 'view') {
      const settings = db.getTicketSettings(interaction.guild.id);
      if (!settings) {
        return interaction.reply({ content: '❌ No settings found. Run `/ticketsetup setup` first.', ephemeral: true });
      }
      const cats = db.getTicketCategories(interaction.guild.id);
      let formFields;
      try { formFields = JSON.parse(settings.form_fields || '[]'); } catch { formFields = []; }

      const embed = new EmbedBuilder()
        .setTitle('🎫 Ticket Settings')
        .setColor(BLUE)
        .setThumbnail(interaction.guild.iconURL())
        .addFields(
          { name: '✅ Enabled',         value: settings.enabled ? 'Yes' : 'No',                            inline: true },
          { name: '📁 Default Category',value: settings.category_id ? `<#${settings.category_id}>` : 'None', inline: true },
          { name: '🛡️ Support Role',   value: settings.support_role ? `<@&${settings.support_role}>` : 'None', inline: true },
          { name: '📋 Log Channel',     value: settings.log_channel  ? `<#${settings.log_channel}>` : 'None', inline: true },
          { name: '🎟️ Total Tickets',  value: settings.ticket_count?.toString() || '0',                    inline: true },
          { name: '📂 Categories',      value: cats.length > 0 ? cats.map(c => `${c.emoji || '📁'} ${c.name}`).join(', ') : 'None', inline: false },
          { name: '📝 Form',            value: settings.form_enabled ? `Enabled — ${formFields.length} field(s)` : 'Disabled', inline: true },
        )
        .setFooter({ text: 'nights bot' }).setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  // Exposed for interactionCreate.js
  executeClose,
  executeClaim,
};

module.exports = [ticket, ticketsetup];
