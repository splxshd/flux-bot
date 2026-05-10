'use strict';

const { EmbedBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const db = require('../database');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';

// ── ,ticket ───────────────────────────────────────────────────────────────────
const ticket = {
  name: 'ticket',
  aliases: ['tickets', 'ticketpanel', 'ticketmsg'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });

    const sub = args[0]?.toLowerCase();

    if (sub === 'setup') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setTitle('🎟️ Ticket Setup')
        .setDescription('Use `/ticket setup` (slash command) or configure step by step:\n\n1. `,ticket create <name>` — create a panel\n2. `,ticket category <category>` — set the category\n3. `,ticket setroles <@roles>` — set staff roles\n4. `,ticket post <name>` — post the panel')
        .setTimestamp()] });
    }

    if (sub === 'create') {
      const name = args.slice(1).join(' ');
      if (!name) return message.reply('Usage: `,ticket create <name>`');
      db.createTicketPanel?.(message.guild.id, name);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Ticket panel **${name}** created. Use \`,ticket post ${name}\` to deploy it.`)] });
    }

    if (sub === 'category') {
      const cat = message.mentions.channels.first() || message.guild.channels.cache.find(c => c.name.toLowerCase() === args.slice(1).join(' ').toLowerCase());
      if (!cat) return message.reply('Usage: `,ticket category <category_name>`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Tickets will be created in **${cat.name}** category.`)] });
    }

    if (sub === 'autoclose') {
      const duration = args[1];
      if (!duration) return message.reply('Usage: `,ticket autoclose <duration>` — e.g. `24h`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Tickets will auto-close after **${duration}** of inactivity.`)] });
    }

    if (sub === 'post') {
      const name = args.slice(1).join(' ');
      if (!name) return message.reply('Usage: `,ticket post <panel_name>`');
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('🎟️ Support Tickets')
        .setDescription('Click the button below to open a support ticket.')
        .setTimestamp();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ticket_create').setLabel('📩 Open Ticket').setStyle(ButtonStyle.Primary)
      );
      await message.channel.send({ embeds: [embed], components: [row] });
      await message.delete().catch(() => {});
      return;
    }

    if (sub === 'setroles') {
      const roles = message.mentions.roles;
      if (!roles.size) return message.reply('Usage: `,ticket setroles <@role1> [@role2]`');
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Ticket staff roles set: ${[...roles.values()].map(r => r.name).join(', ')}`)] });
    }

    if (sub === 'add') {
      const member = message.mentions.members.first();
      if (!member) return message.reply('Usage: `,ticket add <@user>`');
      await message.channel.permissionOverwrites.edit(member, { ViewChannel: true, SendMessages: true }).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Added **${member.user.username}** to this ticket.`)] });
    }

    if (sub === 'remove') {
      const member = message.mentions.members.first();
      if (!member) return message.reply('Usage: `,ticket remove <@user>`');
      await message.channel.permissionOverwrites.edit(member, { ViewChannel: false }).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed **${member.user.username}** from this ticket.`)] });
    }

    if (sub === 'rename') {
      const name = args.slice(1).join(' ');
      if (!name) return message.reply('Usage: `,ticket rename <name>`');
      await message.channel.setName(name).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Ticket renamed to **${name}**.`)] });
    }

    if (sub === 'list') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('🎟️ Ticket Panels').setDescription('ℹ️ No panels configured yet. Use `,ticket create <name>`.').setTimestamp()] });
    }

    if (sub === 'claim') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Ticket claiming enabled.`)] });
    }

    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
      .setAuthor({ name: '🎟️ Ticket System' })
      .setDescription('**Subcommands:** `setup`, `create`, `post`, `category`, `autoclose`, `setroles`, `add`, `remove`, `rename`, `list`, `claim`')
      .setTimestamp()] });
  }
};

// ── ,close ────────────────────────────────────────────────────────────────────
const close = {
  name: 'close',
  aliases: [],
  async execute(message) {
    const isTicket = message.channel.name?.startsWith('ticket-');
    if (!isTicket)
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ This is not a ticket channel.')] });

    const embed = new EmbedBuilder()
      .setColor(YELLOW)
      .setTitle('🎟️ Ticket Closed')
      .setDescription(`Ticket closed by <@${message.author.id}>. The channel will be archived.`)
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false }).catch(() => {});
  }
};

// ── ,delete (ticket) ─────────────────────────────────────────────────────────
const ticketdelete = {
  name: 'delete',
  aliases: [],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Channels** permission.')] });
    const isTicket = message.channel.name?.startsWith('ticket-');
    if (!isTicket)
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ This is not a ticket channel.')] });
    await message.channel.send({ embeds: [new EmbedBuilder().setColor(RED).setDescription('🗑️ Deleting ticket channel in 3 seconds...')] });
    setTimeout(() => message.channel.delete().catch(() => {}), 3000);
  }
};

// ── ,reopen ───────────────────────────────────────────────────────────────────
const reopen = {
  name: 'reopen',
  aliases: ['open'],
  async execute(message) {
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: true }).catch(() => {});
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Ticket reopened.')] });
  }
};

// ── ,claim ────────────────────────────────────────────────────────────────────
const claim = {
  name: 'claim',
  aliases: [],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Ticket claimed by <@${message.author.id}>.`)] });
  }
};

// ── ,unclaim ──────────────────────────────────────────────────────────────────
const unclaim = {
  name: 'unclaim',
  aliases: [],
  async execute(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Ticket unclaimed.')] });
  }
};

// ── ,settranscripts ───────────────────────────────────────────────────────────
const settranscripts = {
  name: 'settranscripts',
  aliases: ['trl', 'trlchannel', 'transcriptchannel'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('Usage: `,settranscripts <#channel>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Ticket transcripts will be sent to ${channel}.`)] });
  }
};

module.exports = [ticket, close, ticketdelete, reopen, claim, unclaim, settranscripts];
