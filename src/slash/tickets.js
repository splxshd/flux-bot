'use strict';

const crypto = require('crypto');
const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType,
  StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSupportRoleIds(settings) {
  const ids = [];
  try {
    const arr = JSON.parse(settings.support_roles || '[]');
    if (Array.isArray(arr)) ids.push(...arr);
  } catch {}
  // backwards-compat: old single column
  if (settings.support_role && !ids.includes(settings.support_role)) {
    ids.push(settings.support_role);
  }
  return ids;
}

// Returns an array of ActionRows (up to 5), each with up to 5 category buttons
function buildCategoryButtons(categories) {
  const rows = [];
  for (let i = 0; i < Math.min(categories.length, 25); i += 5) {
    const slice = categories.slice(i, i + 5);
    const row = new ActionRowBuilder().addComponents(
      slice.map(c => {
        const btn = new ButtonBuilder()
          .setCustomId(`ticket_open:${c.name.slice(0, 88)}`)
          .setLabel(c.name.slice(0, 80))
          .setStyle(ButtonStyle.Primary);
        if (c.emoji) {
          const isCustomId = /^\d{17,20}$/.test(c.emoji.trim());
          btn.setEmoji(isCustomId ? { id: c.emoji.trim() } : { name: c.emoji.trim() });
        }
        return btn;
      })
    );
    rows.push(row);
  }
  return rows;
}

// Returns a single ActionRow with a category select menu (for panels)
function buildCategorySelect(categories) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_category')
    .setPlaceholder('Select a ticket category...')
    .addOptions(
      categories.slice(0, 25).map(c => {
        const opt = {
          label: c.name.slice(0, 25),
          value: c.name.slice(0, 100),
        };
        if (c.description) opt.description = c.description.slice(0, 50);
        if (c.emoji) {
          const isCustomId = /^\d{17,20}$/.test(c.emoji.trim());
          opt.emoji = isCustomId ? { id: c.emoji.trim() } : { name: c.emoji.trim() };
        }
        return opt;
      })
    );
  return [new ActionRowBuilder().addComponents(select)];
}

// Helper: build the "How can we help you?" modal
function buildOpenModal(categoryName) {
  return new ModalBuilder()
    .setCustomId(`ticket_open_modal:${categoryName}`)
    .setTitle('Open a Ticket')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('help_answer')
        .setLabel('How can we help you?')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Describe your issue...')
        .setRequired(true)
        .setMaxLength(1000)
    ));
}

// ─── Core: open a ticket ──────────────────────────────────────────────────────

async function openTicket(interaction, client, categoryName, helpAnswer = null) {
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

  let discordCategoryId = settings.category_id;
  let catLabel = null;

  if (categoryName) {
    const cat = db.getTicketCategory(guildId, categoryName);
    if (cat) { discordCategoryId = cat.discord_category_id; catLabel = cat.name; }
  }

  if (!discordCategoryId) {
    return interaction.editReply({ content: '❌ No ticket category configured. Ask an admin to run `/ticketsetup setup`.' });
  }

  db.incrementTicketCount(guildId);
  const ticketNumber = db.getTicketSettings(guildId).ticket_count;
  const padded = String(ticketNumber).padStart(4, '0');

  const supportRoleIds = getSupportRoleIds(settings);
  const supportRoles   = supportRoleIds
    .map(id => interaction.guild.roles.cache.get(id))
    .filter(Boolean);

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
      ...supportRoles.map(r => ({
        id: r.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      })),
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

  const titleStr = catLabel ? `${catLabel} Ticket` : 'Support Ticket';

  const embed = new EmbedBuilder()
    .setTitle(titleStr)
    .setDescription(settings.open_message || 'Please wait until one of our support team members can help you.\n**Response time may vary due to many factors, so please be patient.**')
    .setColor(0x23272A)
    .addFields(
      { name: 'Ticket #',      value: `${ticketNumber}`,                                           inline: false },
      { name: 'Opened by',     value: `<@${interaction.user.id}> ( ${interaction.user.id} )`,      inline: false },
      { name: 'Assigned staff', value: 'Unassigned',                                                inline: false },
    );

  if (helpAnswer) {
    embed.addFields({ name: 'How can we help you?', value: `\`\`\`${helpAnswer.slice(0, 990)}\`\`\``, inline: false });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Assign me').setStyle(ButtonStyle.Success),
  );

  const mention = supportRoles.map(r => `${r}`).join(' ');
  const sentMsg = await channel.send({
    content: `${mention} <@${interaction.user.id}>`.trim(),
    embeds: [embed],
    components: [row],
  });

  db.updateTicketOpenMessage(channel.id, sentMsg.id);

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

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const createdEmbed = new EmbedBuilder()
    .setTitle('🎫 Ticket Created')
    .setDescription(`Your ticket has been created in ${channel}`)
    .setColor(0x23272A)
    .setFooter({ text: `${interaction.user.tag} • Today at ${timeStr}`, iconURL: interaction.user.displayAvatarURL() });
  const jumpRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🎫 Ticket')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${interaction.guildId}/${channel.id}`),
  );
  await interaction.editReply({ embeds: [createdEmbed], components: [jumpRow] });
}

// ─── Core: close a ticket ─────────────────────────────────────────────────────

async function executeClose(interaction, client, reason) {
  const channel = interaction.channel;
  const t = db.getTicketByChannel(channel.id);
  if (!t) return;

  const settings = db.getTicketSettings(interaction.guild.id);

  // Fetch up to 500 messages
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

  const ticketNum = String(t.ticket_number).padStart(4, '0');
  const opener    = await client.users.fetch(t.user_id).catch(() => null);
  const claimer   = t.claimed_by ? await client.users.fetch(t.claimed_by).catch(() => null) : null;
  const claimedByName = claimer ? claimer.username : 'Nobody';

  // Per-user message counts
  const participantCounts = {};
  messages.filter(m => !m.author.bot).forEach(m => {
    if (!participantCounts[m.author.id]) participantCounts[m.author.id] = { id: m.author.id, username: m.author.username, count: 0 };
    participantCounts[m.author.id].count++;
  });
  const participantsArr   = Object.values(participantCounts).sort((a, b) => b.count - a.count);
  const participantsValue = participantsArr.length
    ? participantsArr.slice(0, 15).map(p => `<@${p.id}> \`${p.username}\` — ${p.count} msg${p.count !== 1 ? 's' : ''}`).join('\n')
    : 'None';
  const totalMsgs = messages.filter(m => !m.author.bot).length;

  const token = crypto.randomBytes(16).toString('hex');
  db.saveTranscript(token, interaction.guild.id, channel.id, t.ticket_number,
    JSON.stringify({
      meta: {
        guildName:    interaction.guild.name,
        guildIcon:    interaction.guild.iconURL({ size: 128 }),
        channelName:  channel.name,
        ticketNumber: ticketNum,
        closedAt:     Date.now(),
        closedBy:     interaction.user.tag,
      },
      messages: messages.map(m => ({
        time:         m.createdTimestamp,
        authorId:     m.author.id,
        authorTag:    m.author.tag,
        authorAvatar: m.author.displayAvatarURL({ size: 64 }),
        isBot:        m.author.bot,
        content:      m.content || null,
        embeds: m.embeds.map(e => ({
          color:       e.color,
          title:       e.title       || null,
          url:         e.url         || null,
          description: e.description || null,
          fields:      e.fields      || [],
          thumbnail:   e.thumbnail?.url || null,
          image:       e.image?.url     || null,
          author: e.author ? {
            name:    e.author.name,
            iconURL: e.author.iconURL || null,
            url:     e.author.url    || null,
          } : null,
          footer: e.footer ? {
            text:    e.footer.text,
            iconURL: e.footer.iconURL || null,
          } : null,
          timestamp: e.timestamp || null,
        })),
        attachments: [...m.attachments.values()].map(a => ({
          name: a.name, url: a.url, contentType: a.contentType,
        })),
        components: m.components.map(row => ({
          components: row.components.map(c => ({
            type:     c.type,
            label:    c.label    || null,
            style:    c.style,
            url:      c.url      || null,
            emoji:    c.emoji ? (c.emoji.name || c.emoji.id) : null,
            disabled: c.disabled || false,
          })),
        })),
      })),
    })
  );

  const transcriptUrl = `${getTranscriptBase()}/transcript/${token}`;
  db.closeTicketWithDetails(channel.id, reason || 'No reason provided');

  const transcriptRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('View Transcript').setStyle(ButtonStyle.Link).setURL(transcriptUrl),
  );

  const closedByValue  = `<@${interaction.user.id}> \`${interaction.user.username}\``;
  const claimedByValue = claimer ? `<@${claimer.id}> \`${claimer.username}\`` : 'Nobody';

  // ── In-channel: simple closing notice ──────────────────────────────────────
  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x23272A)
      .setTitle('🔒 Closing Ticket')
      .setDescription('This ticket will be closed in 5 seconds.')
      .setTimestamp()],
    components: [transcriptRow],
  });

  // ── Log channel ─────────────────────────────────────────────────────────────
  if (settings?.log_channel) {
    const logCh = interaction.guild.channels.cache.get(settings.log_channel);
    if (logCh) {
      const openerValue = opener ? `<@${opener.id}> \`${opener.username}\`` : `\`${t.user_id}\``;
      await logCh.send({
        embeds: [new EmbedBuilder()
          .setColor(0x23272A)
          .setTitle('Ticket Closed')
          .setDescription(`Thank you for opening a support ticket. We appreciate you reaching out to us. If you need any further assistance or have additional questions, please don't hesitate to open another ticket and we'll be happy to help.`)
          .setThumbnail(interaction.guild.iconURL())
          .addFields(
            {
              name: 'Ticket Details',
              value: [
                `Ticket: \`#${ticketNum}\``,
                `Category: \`${t.category_name || 'General Support'}\``,
                `Channel: \`#${channel.name}\``,
                `Opened by: ${openerValue}`,
                `Closed by: ${closedByValue}`,
                `Claimed by: ${claimedByValue}`,
                `Close Reason: \`${reason || 'No reason provided'}\``,
                `Total Messages: \`${totalMsgs}\``,
              ].join('\n'),
            },
            { name: 'Participants', value: participantsValue },
          )],
        components: [transcriptRow],
      }).catch(() => {});
    }
  }

  // ── DM to ticket opener ─────────────────────────────────────────────────────
  if (opener) {
    await opener.send({
      embeds: [new EmbedBuilder()
        .setColor(0x23272A)
        .setTitle('Ticket Closed')
        .setDescription(`Thank you for opening a support ticket. We appreciate you reaching out to us. If you need any further assistance or have additional questions, please don't hesitate to open another ticket and we'll be happy to help.`)
        .setThumbnail(interaction.guild.iconURL())
        .addFields(
          {
            name: 'Ticket Details',
            value: [
              `Category: \`${t.category_name || 'General Support'}\``,
              `Close Reason: \`${reason || 'No reason provided'}\``,
              `Closed by: ${closedByValue}`,
              `Claimed by: ${claimedByValue}`,
              `Total Messages: \`${totalMsgs}\``,
            ].join('\n'),
          },
          { name: 'Participants', value: participantsValue },
        )],
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

  if (t.open_message_id) {
    try {
      const msg = await interaction.channel.messages.fetch(t.open_message_id);
      if (msg?.embeds?.[0]) {
        const embed = EmbedBuilder.from(msg.embeds[0]);
        const fields = (embed.data.fields || []).map(f =>
          f.name === 'Assigned staff'
            ? { ...f, value: isClaimer ? 'Unassigned' : `<@${interaction.user.id}> ( ${interaction.user.id} )` }
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
      .setDescription(isClaimer
        ? `↩️ <@${interaction.user.id}> unclaimed this ticket.`
        : `✋ **Ticket Claimed!**\n<@${interaction.user.id}> is now handling this ticket.`)
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
        content: '**Select a category below to open a ticket:**',
        components: buildCategorySelect(categories),
        ephemeral: true,
      });
    }
    return interaction.showModal(buildOpenModal(''));
  },

  openTicket,
  buildOpenModal,
};

// ─── /ticketsetup ─────────────────────────────────────────────────────────────

const ticketsetup = {
  data: new SlashCommandBuilder()
    .setName('ticketsetup')
    .setDescription('Configure the ticket system')
    .addSubcommand(s => s.setName('setup').setDescription('Initial setup — category, support roles, log channel')
      .addChannelOption(o => o.setName('category').setDescription('Default Discord category for tickets').setRequired(true))
      .addChannelOption(o => o.setName('log_channel').setDescription('Channel for close/transcript logs'))
      .addRoleOption(o => o.setName('support_role1').setDescription('Support role'))
      .addRoleOption(o => o.setName('support_role2').setDescription('2nd support role'))
      .addRoleOption(o => o.setName('support_role3').setDescription('3rd support role'))
      .addStringOption(o => o.setName('open_message').setDescription('Welcome message in new ticket channels')))
    .addSubcommand(s => s.setName('addsupportrole').setDescription('Add a support role')
      .addRoleOption(o => o.setName('role').setDescription('Role to add').setRequired(true)))
    .addSubcommand(s => s.setName('removesupportrole').setDescription('Remove a support role')
      .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true)))
    .addSubcommand(s => s.setName('panel').setDescription('Post the ticket panel')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post panel in (defaults to current)'))
      .addStringOption(o => o.setName('image').setDescription('Banner image URL'))
      .addStringOption(o => o.setName('title').setDescription('Panel title'))
      .addStringOption(o => o.setName('description').setDescription('Panel description'))
      .addStringOption(o => o.setName('thumbnail').setDescription('Thumbnail URL (default: server icon)'))
      .addStringOption(o => o.setName('color').setDescription('Embed color hex (default: #000000)')))
    .addSubcommand(s => s.setName('addcategory').setDescription('Add a ticket category to the panel dropdown')
      .addStringOption(o => o.setName('name').setDescription('Display name (e.g. "General Support")').setRequired(true))
      .addChannelOption(o => o.setName('discord_category').setDescription('Discord category channel for this type').setRequired(true))
      .addStringOption(o => o.setName('description').setDescription('Short text shown in the dropdown'))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji (unicode or custom emoji ID)')))
    .addSubcommand(s => s.setName('removecategory').setDescription('Remove a ticket category')
      .addStringOption(o => o.setName('name').setDescription('Category name to remove').setRequired(true)))
    .addSubcommand(s => s.setName('categories').setDescription('List all configured ticket categories'))
    .addSubcommand(s => s.setName('transcript').setDescription('Save transcript and close this ticket'))
    .addSubcommand(s => s.setName('form').setDescription('Configure the ticket form')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable form').setRequired(true))
      .addStringOption(o => o.setName('fields').setDescription('Questions (comma-separated)'))
      .addStringOption(o => o.setName('title').setDescription('Form embed title'))
      .addStringOption(o => o.setName('footer').setDescription('Form embed footer'))
      .addStringOption(o => o.setName('color').setDescription('Form embed color hex')))
    .addSubcommand(s => s.setName('view').setDescription('View current ticket settings'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    // ── setup ────────────────────────────────────────────────────────────────
    if (sub === 'setup') {
      const category    = interaction.options.getChannel('category');
      const logChannel  = interaction.options.getChannel('log_channel');
      const openMessage = interaction.options.getString('open_message');

      // Collect up to 3 support roles
      const newRoleIds = [1, 2, 3]
        .map(n => interaction.options.getRole(`support_role${n}`)?.id)
        .filter(Boolean);

      // Merge with existing support_roles
      const existing = db.getTicketSettings(interaction.guild.id);
      let existingIds = [];
      try { existingIds = JSON.parse(existing?.support_roles || '[]'); } catch {}
      const merged = [...new Set([...existingIds, ...newRoleIds])];

      db.upsertTicketSettings(interaction.guild.id, {
        category_id:   category.id,
        log_channel:   logChannel?.id    || null,
        open_message:  openMessage        || null,
        support_roles: JSON.stringify(merged),
        enabled: 1,
      });

      const rolesDisplay = merged.length
        ? merged.map(id => `<@&${id}>`).join(', ')
        : 'None';

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(GREEN)
          .setAuthor({ name: '✅ Ticket System Configured', iconURL: interaction.user.displayAvatarURL() })
          .addFields(
            { name: '📁 Default Category', value: `${category}`,         inline: true },
            { name: '📋 Log Channel',      value: logChannel ? `${logChannel}` : 'None', inline: true },
            { name: '🎖️ Support Roles',   value: rolesDisplay,          inline: false },
          )
          .setDescription('Use `/ticketsetup addcategory` to add panel categories, `/ticketsetup panel` to post the panel, and `/ticketsetup addsupportrole` to add more support roles.')
          .setFooter({ text: 'nights bot' }).setTimestamp()],
        ephemeral: true,
      });

    // ── addsupportrole ───────────────────────────────────────────────────────
    } else if (sub === 'addsupportrole') {
      const role = interaction.options.getRole('role');
      const settings = db.getTicketSettings(interaction.guild.id);
      let ids = [];
      try { ids = JSON.parse(settings?.support_roles || '[]'); } catch {}
      if (ids.includes(role.id)) {
        return interaction.reply({ content: `❌ ${role} is already a support role.`, ephemeral: true });
      }
      ids.push(role.id);
      db.upsertTicketSettings(interaction.guild.id, { support_roles: JSON.stringify(ids) });
      return interaction.reply({
        content: `✅ Added ${role} as a support role. (${ids.length} total)`,
        ephemeral: true,
      });

    // ── removesupportrole ────────────────────────────────────────────────────
    } else if (sub === 'removesupportrole') {
      const role = interaction.options.getRole('role');
      const settings = db.getTicketSettings(interaction.guild.id);
      let ids = [];
      try { ids = JSON.parse(settings?.support_roles || '[]'); } catch {}
      if (!ids.includes(role.id)) {
        return interaction.reply({ content: `❌ ${role} is not a support role.`, ephemeral: true });
      }
      ids = ids.filter(id => id !== role.id);
      db.upsertTicketSettings(interaction.guild.id, { support_roles: JSON.stringify(ids) });
      return interaction.reply({
        content: `✅ Removed ${role} from support roles. (${ids.length} remaining)`,
        ephemeral: true,
      });

    // ── panel ────────────────────────────────────────────────────────────────
    } else if (sub === 'panel') {
      const ch        = interaction.options.getChannel('channel') || interaction.channel;
      const image     = interaction.options.getString('image');
      const title     = interaction.options.getString('title')       || 'Soul Tickets';
      const desc      = interaction.options.getString('description') ||
        'If you need help, click on the option corresponding to the type of ticket you want to open.\n**Response time may vary due to many factors, so please be patient.**';
      const thumbnail = interaction.options.getString('thumbnail');
      const colorRaw  = interaction.options.getString('color');
      const color     = colorRaw ? colorRaw.trim() : 0x000000;

      const categories = db.getTicketCategories(interaction.guild.id);

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(color)
        .setThumbnail(thumbnail || interaction.guild.iconURL());
      if (image) embed.setImage(image);

      // Dropdown: one option per category, or a single Open Ticket button if none configured
      const components = categories.length > 0
        ? buildCategorySelect(categories)
        : [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_ticket').setLabel('Open Ticket').setStyle(ButtonStyle.Primary)
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
          content: '❌ `discord_category` must be a **Category** channel (not text/voice).',
          ephemeral: true,
        });
      }
      if (db.getTicketCategory(interaction.guild.id, name)) {
        return interaction.reply({ content: `❌ A category named **${name}** already exists.`, ephemeral: true });
      }
      db.addTicketCategory(interaction.guild.id, name, description, emoji, discordCat.id);

      const cats = db.getTicketCategories(interaction.guild.id);
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(GREEN).setTitle('✅ Category Added')
          .addFields(
            { name: '📁 Name',             value: name,                  inline: true },
            { name: '📂 Discord Category', value: `${discordCat}`,       inline: true },
            { name: '📝 Description',      value: description || 'None', inline: true },
          )
          .setFooter({ text: `${cats.length} total categor${cats.length === 1 ? 'y' : 'ies'} • Re-post the panel to apply` })
          .setTimestamp()],
        ephemeral: true,
      });

    // ── removecategory ───────────────────────────────────────────────────────
    } else if (sub === 'removecategory') {
      const name = interaction.options.getString('name');
      if (!db.getTicketCategory(interaction.guild.id, name)) {
        return interaction.reply({ content: `❌ No category named **${name}** found.`, ephemeral: true });
      }
      db.removeTicketCategory(interaction.guild.id, name);
      return interaction.reply({ content: `✅ Category **${name}** removed. Re-post the panel to apply.`, ephemeral: true });

    // ── categories ───────────────────────────────────────────────────────────
    } else if (sub === 'categories') {
      const cats = db.getTicketCategories(interaction.guild.id);
      if (cats.length === 0) {
        return interaction.reply({ content: '📭 No categories yet. Use `/ticketsetup addcategory` to add one.', ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setColor(BLUE).setTitle('📁 Ticket Categories')
        .setDescription(cats.map((c, i) => {
          const ch = interaction.guild.channels.cache.get(c.discord_category_id);
          return `**${i + 1}. ${c.emoji ? c.emoji + ' ' : ''}${c.name}**\n└ ${c.description || 'No description'} → \`${ch ? ch.name : c.discord_category_id}\``;
        }).join('\n\n'))
        .setFooter({ text: `${cats.length} categor${cats.length === 1 ? 'y' : 'ies'} — each maps to its own Discord category channel` })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });

    // ── transcript ───────────────────────────────────────────────────────────
    } else if (sub === 'transcript') {
      const t = db.getTicketByChannel(interaction.channel.id);
      if (!t || t.status !== 'open') {
        return interaction.reply({ content: '❌ Not an open ticket channel.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      await executeClose(interaction, client, 'Transcript saved');
      await interaction.editReply({ content: '📄 Transcript saved and ticket closed.' }).catch(() => {});

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
          .addFields({ name: '📋 Fields', value: fieldsArr.length ? fieldsArr.join(', ') : 'None' })
          .setFooter({ text: 'nights bot' }).setTimestamp()],
        ephemeral: true,
      });

    // ── view ─────────────────────────────────────────────────────────────────
    } else if (sub === 'view') {
      const settings = db.getTicketSettings(interaction.guild.id);
      if (!settings) return interaction.reply({ content: '❌ No settings found. Run `/ticketsetup setup` first.', ephemeral: true });

      const cats = db.getTicketCategories(interaction.guild.id);
      const roleIds = getSupportRoleIds(settings);
      let formFields;
      try { formFields = JSON.parse(settings.form_fields || '[]'); } catch { formFields = []; }

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🎫 Ticket Settings').setColor(BLUE).setThumbnail(interaction.guild.iconURL())
          .addFields(
            { name: '✅ Enabled',          value: settings.enabled ? 'Yes' : 'No',                              inline: true },
            { name: '📁 Default Category', value: settings.category_id ? `<#${settings.category_id}>` : 'None', inline: true },
            { name: '📋 Log Channel',      value: settings.log_channel ? `<#${settings.log_channel}>` : 'None', inline: true },
            { name: '🎖️ Support Roles',   value: roleIds.length ? roleIds.map(id => `<@&${id}>`).join(', ') : 'None', inline: false },
            { name: '🎟️ Total Tickets',   value: settings.ticket_count?.toString() || '0',                      inline: true },
            { name: '📂 Categories',       value: cats.length ? cats.map(c => `${c.emoji || '📁'} ${c.name}`).join(', ') : 'None (use /ticketsetup addcategory)', inline: false },
            { name: '📝 Form',             value: settings.form_enabled ? `Enabled — ${formFields.length} field(s)` : 'Disabled', inline: true },
          )
          .setFooter({ text: 'nights bot' }).setTimestamp()],
        ephemeral: true,
      });
    }
  },

  executeClose,
  executeClaim,
};

// ─── Standalone ticket channel commands ───────────────────────────────────────

const closeTicketCmd = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close this ticket')
    .addStringOption(o => o.setName('reason').setDescription('Reason for closing')),
  async execute(interaction, client) {
    const t = db.getTicketByChannel(interaction.channel.id);
    if (!t || t.status !== 'open') return interaction.reply({ content: '❌ Not an open ticket channel.', ephemeral: true });
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await interaction.deferReply({ ephemeral: true });
    await executeClose(interaction, client, reason);
    await interaction.editReply({ content: '🔒 Ticket closed.' }).catch(() => {});
  },
};

const alert = {
  data: new SlashCommandBuilder()
    .setName('alert')
    .setDescription('Ping the ticket creator to remind them to respond')
    .addStringOption(o => o.setName('message').setDescription('Custom alert message')),
  async execute(interaction) {
    const t = db.getTicketByChannel(interaction.channel.id);
    if (!t || t.status !== 'open') return interaction.reply({ content: '❌ Not an open ticket channel.', ephemeral: true });
    const msg = interaction.options.getString('message') || 'The staff team is awaiting your response. Please reply as soon as possible.';
    await interaction.channel.send({
      content: `<@${t.user_id}>`,
      embeds: [new EmbedBuilder()
        .setColor(YELLOW).setTitle('🔔 Ticket Alert').setDescription(msg)
        .setFooter({ text: `Sent by ${interaction.user.tag}` }).setTimestamp()],
    });
    return interaction.reply({ content: '✅ Alert sent.', ephemeral: true });
  },
};

const claim = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim or unclaim this ticket'),
  async execute(interaction, client) {
    return executeClaim(interaction, client);
  },
};

const move = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move this ticket to a different category')
    .addStringOption(o => o.setName('category').setDescription('Category name to move to').setRequired(true)),
  async execute(interaction) {
    const t = db.getTicketByChannel(interaction.channel.id);
    if (!t || t.status !== 'open') return interaction.reply({ content: '❌ Not an open ticket channel.', ephemeral: true });
    const catName = interaction.options.getString('category');
    const cat = db.getTicketCategory(interaction.guild.id, catName);
    if (!cat) {
      // Show available categories to help
      const all = db.getTicketCategories(interaction.guild.id);
      const list = all.length ? all.map(c => `• ${c.name}`).join('\n') : 'No categories configured.';
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(RED)
          .setDescription(`❌ No category named **${catName}** found.\n\n**Available categories:**\n${list}`)],
        ephemeral: true,
      });
    }
    await interaction.channel.setParent(cat.discord_category_id, { lockPermissions: false });
    db.run('UPDATE tickets SET category_name = ? WHERE channel_id = ?', [cat.name, interaction.channel.id]);

    if (t.open_message_id) {
      try {
        const ticketMsg = await interaction.channel.messages.fetch(t.open_message_id);
        if (ticketMsg?.embeds?.[0]) {
          const padded = String(t.ticket_number).padStart(4, '0');
          const upd = EmbedBuilder.from(ticketMsg.embeds[0]);
          upd.setTitle(`🎫 ${cat.name} — Ticket #${padded}`);
          await ticketMsg.edit({ embeds: [upd] }).catch(() => {});
        }
      } catch (_) {}
    }
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Ticket moved to **${cat.name}**`).setTimestamp()],
      ephemeral: true,
    });
  },
};

const add = {
  data: new SlashCommandBuilder()
    .setName('add')
    .setDescription('Add a user to this ticket')
    .addUserOption(o => o.setName('user').setDescription('User to add').setRequired(true)),
  async execute(interaction) {
    if (!db.getTicketByChannel(interaction.channel.id)) {
      return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
    }
    const user = interaction.options.getUser('user');
    await interaction.channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    });
    return interaction.reply({ content: `✅ Added <@${user.id}> to the ticket.`, ephemeral: true });
  },
};

const remove = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a user from this ticket')
    .addUserOption(o => o.setName('user').setDescription('User to remove').setRequired(true)),
  async execute(interaction) {
    const t = db.getTicketByChannel(interaction.channel.id);
    if (!t) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
    const user = interaction.options.getUser('user');
    if (user.id === t.user_id) return interaction.reply({ content: '❌ Cannot remove the ticket creator.', ephemeral: true });
    await interaction.channel.permissionOverwrites.delete(user.id);
    return interaction.reply({ content: `✅ Removed <@${user.id}> from the ticket.`, ephemeral: true });
  },
};

const rename = {
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename this ticket channel')
    .addStringOption(o => o.setName('name').setDescription('New channel name').setRequired(true)),
  async execute(interaction) {
    if (!db.getTicketByChannel(interaction.channel.id)) {
      return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });
    }
    const newName = interaction.options.getString('name')
      .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').slice(0, 100);
    await interaction.channel.setName(newName);
    return interaction.reply({ content: `✅ Channel renamed to \`${newName}\`.`, ephemeral: true });
  },
};

const info = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show info about this ticket'),
  async execute(interaction, client) {
    const t = db.getTicketByChannel(interaction.channel.id);
    if (!t) return interaction.reply({ content: '❌ Not a ticket channel.', ephemeral: true });

    const opener  = await client.users.fetch(t.user_id).catch(() => null);
    const claimer = t.claimed_by ? await client.users.fetch(t.claimed_by).catch(() => null) : null;
    const padded  = String(t.ticket_number).padStart(4, '0');

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle(`🎫 Ticket #${padded}`)
      .setThumbnail(opener?.displayAvatarURL() || null)
      .addFields(
        { name: '👤 Opened by',      value: opener ? `<@${opener.id}>` : `\`${t.user_id}\``,    inline: true },
        { name: '📁 Category',       value: t.category_name || 'General',                        inline: true },
        { name: '🔖 Status',         value: t.status === 'open' ? '🟢 Open' : '🔴 Closed',      inline: true },
        { name: '🛡️ Claimed by',    value: claimer ? `<@${claimer.id}>` : 'Unassigned',          inline: true },
        { name: '📅 Opened',         value: `<t:${t.created_at}:R>`,                             inline: true },
        ...(t.closed_at ? [{ name: '🔒 Closed', value: `<t:${t.closed_at}:R>`, inline: true }] : []),
        ...(t.close_reason ? [{ name: '📝 Close Reason', value: t.close_reason, inline: false }] : []),
      )
      .setFooter({ text: 'nights bot' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

// Temporarily unregistered from slash to stay under Discord's 100-command limit
module.exports = [ticket, ticketsetup, closeTicketCmd, alert, claim, move, add, remove, rename, info];
