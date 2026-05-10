'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../database');

const ticketwatcher = {
  data: new SlashCommandBuilder()
    .setName('ticketwatcher')
    .setDescription('Watch ticket categories and auto-send forms')
    .addSubcommand(s => s.setName('add').setDescription('Watch a category')
      .addChannelOption(o => o.setName('category').setDescription('Category to watch').setRequired(true))
      .addStringOption(o => o.setName('type').setDescription('Form type').setRequired(true)
        .addChoices({ name: 'support', value: 'support' }, { name: 'refund', value: 'refund' })))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a watcher')
      .addChannelOption(o => o.setName('category').setDescription('Category').setRequired(true))
      .addStringOption(o => o.setName('type').setDescription('Type (omit = remove all)').addChoices({ name: 'support', value: 'support' }, { name: 'refund', value: 'refund' })))
    .addSubcommand(s => s.setName('list').setDescription('List all watchers'))
    .addSubcommand(s => s.setName('preview').setDescription('Preview a form')
      .addChannelOption(o => o.setName('category').setDescription('Category').setRequired(true))
      .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices({ name: 'support', value: 'support' }, { name: 'refund', value: 'refund' })))
    .addSubcommand(s => s.setName('editsupport').setDescription('Edit support form template')
      .addChannelOption(o => o.setName('category').setDescription('Category').setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Title'))
      .addStringOption(o => o.setName('description').setDescription('Description'))
      .addStringOption(o => o.setName('color').setDescription('Color'))
      .addStringOption(o => o.setName('button_label').setDescription('Button label'))
      .addStringOption(o => o.setName('button_url').setDescription('Button URL')))
    .addSubcommand(s => s.setName('editrefund').setDescription('Edit refund form template')
      .addChannelOption(o => o.setName('category').setDescription('Category').setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Title'))
      .addStringOption(o => o.setName('description').setDescription('Description'))
      .addStringOption(o => o.setName('color').setDescription('Color'))
      .addStringOption(o => o.setName('button_label').setDescription('Button label'))
      .addStringOption(o => o.setName('button_url').setDescription('Button URL')))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    const defaultSupport = {
      title: '🎫 Support Request',
      description: '**Please fill in the following:**\n\n• Username\n• Order ID\n• Product\n• Issue\n• Screenshots/Proof',
      color: '#5865F2',
    };
    const defaultRefund = {
      title: '💸 Replacement / Refund Request',
      description: '**Please fill in the following:**\n\n• Username\n• Order ID\n• Product\n• Reason (replacement/refund)\n• Issue description\n• Proof',
      color: '#ED4245',
    };

    if (sub === 'add') {
      const category = interaction.options.getChannel('category');
      const type = interaction.options.getString('type');
      const defaults = type === 'support' ? defaultSupport : defaultRefund;

      db.setTicketWatcher(interaction.guild.id, category.id, type, defaults);

      const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setAuthor({ name: '✅ Watcher Added', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '📁 Category', value: `<#${category.id}>`, inline: true },
          { name: '📋 Type', value: `\`${type}\``, inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'remove') {
      const category = interaction.options.getChannel('category');
      const type = interaction.options.getString('type');
      db.removeTicketWatcher(interaction.guild.id, category.id, type || null);

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#ED4245')
          .setAuthor({ name: '🗑️ Watcher Removed', iconURL: interaction.user.displayAvatarURL() })
          .addFields({ name: '📁 Category', value: `<#${category.id}>`, inline: true }, { name: '📋 Type', value: type ? `\`${type}\`` : 'all', inline: true })
          .setFooter({ text: 'flux bot' }).setTimestamp()],
        ephemeral: true,
      });

    } else if (sub === 'list') {
      const watchers = db.getTicketWatchers(interaction.guild.id);
      if (watchers.length === 0) {
        return interaction.reply({
          embeds: [new EmbedBuilder().setColor('#5865F2').setDescription('📭 No ticket watchers configured.').setTimestamp()],
          ephemeral: true,
        });
      }

      const supportWatchers = watchers.filter(w => w.type === 'support');
      const refundWatchers  = watchers.filter(w => w.type === 'refund');

      const embed = new EmbedBuilder()
        .setTitle('🔎 Ticket Watchers')
        .setColor('#5865F2')
        .setFooter({ text: `${watchers.length} watcher(s) • flux bot` })
        .setTimestamp();

      if (supportWatchers.length > 0) embed.addFields({ name: '🎫 Support', value: supportWatchers.map(w => `<#${w.category_id}>`).join('\n'), inline: true });
      if (refundWatchers.length > 0)  embed.addFields({ name: '💸 Refund', value: refundWatchers.map(w => `<#${w.category_id}>`).join('\n'), inline: true });

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } else if (sub === 'preview') {
      const category = interaction.options.getChannel('category');
      const type = interaction.options.getString('type');
      const watcher = db.getTicketWatcher(interaction.guild.id, category.id, type);

      const defaults = type === 'support' ? defaultSupport : defaultRefund;
      const data = watcher || defaults;

      const embed = new EmbedBuilder()
        .setTitle(data.title || defaults.title)
        .setDescription(data.description || defaults.description)
        .setColor(data.color || defaults.color)
        .setFooter({ text: 'Preview — flux bot' })
        .setTimestamp();

      let button;
      if (data.button_url) {
        button = new ButtonBuilder().setLabel(data.button_label || 'Open').setURL(data.button_url).setStyle(ButtonStyle.Link);
      } else {
        button = new ButtonBuilder().setLabel(data.button_label || 'Submit').setCustomId('preview_placeholder').setStyle(ButtonStyle.Primary);
      }

      const row = new ActionRowBuilder().addComponents(button);
      await interaction.reply({ content: '**Preview:**', embeds: [embed], components: [row], ephemeral: true });

    } else if (sub === 'editsupport' || sub === 'editrefund') {
      const type = sub === 'editsupport' ? 'support' : 'refund';
      const category = interaction.options.getChannel('category');
      const existing = db.getTicketWatcher(interaction.guild.id, category.id, type);
      const defaults = type === 'support' ? defaultSupport : defaultRefund;

      const data = {
        title: interaction.options.getString('title') || existing?.title || defaults.title,
        description: interaction.options.getString('description') || existing?.description || defaults.description,
        color: interaction.options.getString('color') || existing?.color || defaults.color,
        button_label: interaction.options.getString('button_label') || existing?.button_label || null,
        button_url: interaction.options.getString('button_url') || existing?.button_url || null,
      };

      db.setTicketWatcher(interaction.guild.id, category.id, type, data);

      const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setAuthor({ name: `✅ ${type === 'support' ? 'Support' : 'Refund'} Form Updated`, iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '📁 Category', value: `<#${category.id}>`, inline: true },
          { name: '📋 Type', value: `\`${type}\``, inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

module.exports = [ticketwatcher];
