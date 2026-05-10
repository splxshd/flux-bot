'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType,
} = require('discord.js');
const db = require('../database');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';

// ─── /ticket ─────────────────────────────────────────────────────────────────
const ticket = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Open a support ticket'),

  async execute(interaction, client) {
    const settings = db.getTicketSettings(interaction.guild.id);
    if (!settings || !settings.enabled || !settings.category_id) {
      return interaction.reply({ content: '❌ Ticket system is not configured. Ask an admin to run `/ticketsetup setup`.', ephemeral: true });
    }

    const existingTicket = db.all('SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = ?', [interaction.guild.id, interaction.user.id, 'open']);
    if (existingTicket.length > 0) {
      return interaction.reply({ content: `❌ You already have an open ticket: <#${existingTicket[0].channel_id}>`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    db.incrementTicketCount(interaction.guild.id);
    const updatedSettings = db.getTicketSettings(interaction.guild.id);
    const ticketNumber = updatedSettings.ticket_count;

    const supportRole = settings.support_role ? interaction.guild.roles.cache.get(settings.support_role) : null;

    const channel = await interaction.guild.channels.create({
      name: `ticket-${String(ticketNumber).padStart(4, '0')}`,
      type: ChannelType.GuildText,
      parent: settings.category_id,
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

    db.createTicket(interaction.guild.id, channel.id, interaction.user.id, ticketNumber);

    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
      .setTitle(`🎫 Ticket #${String(ticketNumber).padStart(4, '0')}`)
      .setDescription(settings.open_message || `Welcome, <@${interaction.user.id}>!\n\nA staff member will be with you shortly. Please describe your issue below.`)
      .setColor(BLUE)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '👤 Opened By', value: `<@${interaction.user.id}>`, inline: true },
        { name: '📅 Opened', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
        ...(supportRole ? [{ name: '🛡️ Support Role', value: `${supportRole}`, inline: true }] : []),
      )
      .setFooter({ text: `Ticket #${String(ticketNumber).padStart(4, '0')} • flux bot` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
      new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Save Transcript').setStyle(ButtonStyle.Secondary).setEmoji('📄'),
    );

    const mention = supportRole ? `${supportRole} ` : '';
    await channel.send({ content: `${mention}<@${interaction.user.id}>`, embeds: [embed], components: [row] });

    if (settings.form_enabled && settings.form_fields) {
      let fields;
      try { fields = JSON.parse(settings.form_fields); } catch { fields = []; }
      if (fields.length > 0) {
        const formEmbed = new EmbedBuilder()
          .setTitle(settings.form_title || '📝 Please fill in the form below')
          .setDescription(fields.map((f, i) => `**${i + 1}.** ${f}`).join('\n'))
          .setColor(settings.form_color || BLUE)
          .setFooter({ text: 'Answer each question in order' });
        if (settings.form_footer) formEmbed.setFooter({ text: settings.form_footer });
        await channel.send({ embeds: [formEmbed] });
      }
    }

    await interaction.editReply({ content: `✅ Your ticket has been opened: ${channel}` });
  },

  async handleClose(interaction, client) {
    const t = db.getTicketByChannel(interaction.channel.id);
    if (!t) return interaction.reply({ content: '❌ This is not a ticket channel.', ephemeral: true });

    const closeEmbed = new EmbedBuilder()
      .setColor(RED)
      .setAuthor({ name: `🔒 Closing Ticket — ${interaction.channel.name}`, iconURL: interaction.user.displayAvatarURL() })
      .setDescription('This ticket will be deleted in **5 seconds**.')
      .setFooter({ text: `Closed by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [closeEmbed] });
    db.closeTicket(interaction.channel.id);

    setTimeout(async () => {
      await interaction.channel.delete().catch(() => {});
    }, 5000);
  },

  async handleTranscript(interaction, client) {
    const t = db.getTicketByChannel(interaction.channel.id);
    if (!t) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });

    await interaction.deferReply();

    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].reverse();
    const content = sorted.map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || '[embed/attachment]'}`).join('\n');

    const buf = Buffer.from(content, 'utf-8');
    const attachment = { attachment: buf, name: `transcript-${interaction.channel.name}.txt` };

    const owner = await client.users.fetch(t.user_id).catch(() => null);
    if (owner) await owner.send({ content: `📄 Transcript for your ticket **${interaction.channel.name}**:`, files: [attachment] }).catch(() => {});

    const settings = db.getTicketSettings(interaction.guild.id);
    if (settings?.log_channel) {
      const logCh = interaction.guild.channels.cache.get(settings.log_channel);
      if (logCh) {
        const logEmbed = new EmbedBuilder()
          .setColor(YELLOW)
          .setAuthor({ name: `📄 Transcript — ${interaction.channel.name}`, iconURL: interaction.user.displayAvatarURL() })
          .addFields(
            { name: '🔒 Closed By', value: `<@${interaction.user.id}>`, inline: true },
            { name: '👤 Ticket Owner', value: owner ? `<@${owner.id}>` : `\`${t.user_id}\``, inline: true },
          )
          .setFooter({ text: 'flux bot' })
          .setTimestamp();
        await logCh.send({
          embeds: [logEmbed],
          files: [{ attachment: Buffer.from(content), name: `transcript-${interaction.channel.name}.txt` }],
        }).catch(() => {});
      }
    }

    db.closeTicket(interaction.channel.id);

    const closeEmbed = new EmbedBuilder()
      .setColor(YELLOW)
      .setAuthor({ name: '📄 Transcript Saved', iconURL: interaction.user.displayAvatarURL() })
      .setDescription('Transcript sent to the ticket owner. Closing in **5 seconds**...')
      .setFooter({ text: `Closed by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [closeEmbed] });

    setTimeout(async () => {
      await interaction.channel.delete().catch(() => {});
    }, 5000);
  },
};

// ─── /ticketsetup ────────────────────────────────────────────────────────────
const ticketsetup = {
  data: new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Configure the ticket system')
    .addSubcommand(s => s.setName('setup').setDescription('Initial setup')
      .addChannelOption(o => o.setName('category').setDescription('Category for tickets').setRequired(true))
      .addRoleOption(o => o.setName('support_role').setDescription('Support role'))
      .addChannelOption(o => o.setName('log_channel').setDescription('Log channel'))
      .addStringOption(o => o.setName('open_message').setDescription('Welcome message')))
    .addSubcommand(s => s.setName('form').setDescription('Configure ticket form')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable form').setRequired(true))
      .addStringOption(o => o.setName('fields').setDescription('Fields (comma-separated)'))
      .addStringOption(o => o.setName('title').setDescription('Form title'))
      .addStringOption(o => o.setName('footer').setDescription('Form footer'))
      .addStringOption(o => o.setName('color').setDescription('Form color')))
    .addSubcommand(s => s.setName('close').setDescription('Close the current ticket'))
    .addSubcommand(s => s.setName('transcript').setDescription('Save transcript and close ticket'))
    .addSubcommand(s => s.setName('add').setDescription('Add user to ticket')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove user from ticket')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
    .addSubcommand(s => s.setName('panel').setDescription('Post ticket open panel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post panel in')))
    .addSubcommand(s => s.setName('view').setDescription('View ticket settings'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const category = interaction.options.getChannel('category');
      const supportRole = interaction.options.getRole('support_role');
      const logChannel = interaction.options.getChannel('log_channel');
      const openMessage = interaction.options.getString('open_message');

      db.upsertTicketSettings(interaction.guild.id, {
        category_id: category.id,
        support_role: supportRole?.id || null,
        log_channel: logChannel?.id || null,
        open_message: openMessage || null,
        enabled: 1,
      });

      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ Ticket System Configured', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '📁 Category', value: `${category}`, inline: true },
          { name: '🛡️ Support Role', value: supportRole ? `${supportRole}` : 'None', inline: true },
          { name: '📋 Log Channel', value: logChannel ? `${logChannel}` : 'None', inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'form') {
      const enabled = interaction.options.getBoolean('enabled');
      const fields = interaction.options.getString('fields');
      const title = interaction.options.getString('title');
      const footer = interaction.options.getString('footer');
      const color = interaction.options.getString('color');

      const fieldsArr = fields ? fields.split(',').map(f => f.trim()) : [];
      db.upsertTicketSettings(interaction.guild.id, {
        form_enabled: enabled ? 1 : 0,
        form_fields: JSON.stringify(fieldsArr),
        form_title: title || null,
        form_footer: footer || null,
        form_color: color || BLUE,
      });

      const embed = new EmbedBuilder()
        .setColor(enabled ? GREEN : RED)
        .setAuthor({ name: `📝 Form ${enabled ? 'Enabled' : 'Disabled'}`, iconURL: interaction.user.displayAvatarURL() })
        .addFields({ name: '📋 Fields', value: fieldsArr.length > 0 ? fieldsArr.join(', ') : 'None' })
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'close') {
      await ticket.handleClose(interaction, client);

    } else if (sub === 'transcript') {
      await ticket.handleTranscript(interaction, client);

    } else if (sub === 'add') {
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      });
      await interaction.reply({ content: `✅ Added <@${user.id}> to the ticket.`, ephemeral: true });

    } else if (sub === 'remove') {
      const user = interaction.options.getUser('user');
      await interaction.channel.permissionOverwrites.delete(user.id);
      await interaction.reply({ content: `✅ Removed <@${user.id}> from the ticket.`, ephemeral: true });

    } else if (sub === 'panel') {
      const ch = interaction.options.getChannel('channel') || interaction.channel;

      const embed = new EmbedBuilder()
        .setTitle('🎫 Support Tickets')
        .setDescription('Need help? Click the button below to open a private support ticket.\nA staff member will assist you as soon as possible.')
        .setColor(BLUE)
        .setThumbnail(interaction.guild.iconURL())
        .addFields(
          { name: '📋 How it works', value: '1. Click **Open Ticket** below\n2. Describe your issue\n3. Wait for staff to respond', inline: false },
        )
        .setFooter({ text: interaction.guild.name })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫'),
      );

      await ch.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: `✅ Ticket panel posted in ${ch}.`, ephemeral: true });

    } else if (sub === 'view') {
      const settings = db.getTicketSettings(interaction.guild.id);
      if (!settings) return interaction.reply({ content: '❌ No ticket settings found.', ephemeral: true });

      let fields;
      try { fields = JSON.parse(settings.form_fields || '[]'); } catch { fields = []; }

      const embed = new EmbedBuilder()
        .setTitle('🎫 Ticket Settings')
        .setColor(BLUE)
        .setThumbnail(interaction.guild.iconURL())
        .addFields(
          { name: '✅ Enabled', value: settings.enabled ? 'Yes' : 'No', inline: true },
          { name: '📁 Category', value: settings.category_id ? `<#${settings.category_id}>` : 'None', inline: true },
          { name: '🛡️ Support Role', value: settings.support_role ? `<@&${settings.support_role}>` : 'None', inline: true },
          { name: '📋 Log Channel', value: settings.log_channel ? `<#${settings.log_channel}>` : 'None', inline: true },
          { name: '🎟️ Total Tickets', value: settings.ticket_count?.toString() || '0', inline: true },
          { name: '📝 Form', value: settings.form_enabled ? `Enabled — ${fields.length} field(s)` : 'Disabled', inline: true },
          ...(fields.length > 0 ? [{ name: '📄 Form Fields', value: fields.join('\n') }] : []),
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  handleClose: ticket.handleClose,
  handleTranscript: ticket.handleTranscript,
};

module.exports = [ticket, ticketsetup];
