'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const db = require('../database');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';

const tag = {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Save and send text snippets quickly')
    .addSubcommand(s => s
      .setName('send')
      .setDescription('Send a saved tag')
      .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true).setAutocomplete(true))
      .addUserOption(o => o.setName('user').setDescription('Mention a user with the tag')))
    .addSubcommand(s => s
      .setName('create')
      .setDescription('Create a new tag')
      .addStringOption(o => o.setName('name').setDescription('Tag name (no spaces)').setRequired(true))
      .addStringOption(o => o.setName('content').setDescription('Tag content').setRequired(true)))
    .addSubcommand(s => s
      .setName('edit')
      .setDescription('Edit an existing tag')
      .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('content').setDescription('New content').setRequired(true)))
    .addSubcommand(s => s
      .setName('delete')
      .setDescription('Delete a tag')
      .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true).setAutocomplete(true)))
    .addSubcommand(s => s
      .setName('list')
      .setDescription('List all saved tags'))
    .addSubcommand(s => s
      .setName('info')
      .setDescription('Show info about a tag')
      .addStringOption(o => o.setName('name').setDescription('Tag name').setRequired(true).setAutocomplete(true)))
    .addSubcommand(s => s
      .setName('menu')
      .setDescription('Pick and send a tag from a dropdown menu')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const tags = db.listTags(interaction.guild.id);
    const choices = tags
      .filter(t => t.name.includes(focused))
      .slice(0, 25)
      .map(t => ({ name: `${t.name} (${t.uses} uses)`, value: t.name }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    // ── send ──────────────────────────────────────────────────────────────────
    if (sub === 'send') {
      const name = interaction.options.getString('name');
      const user = interaction.options.getUser('user');
      const row  = db.getTag(guildId, name);
      if (!row) return interaction.reply({ content: `❌ No tag named \`${name}\`.`, ephemeral: true });
      db.incrementTagUses(guildId, name);
      const content = user ? `${user} ${row.content}` : row.content;
      await interaction.reply({ content, allowedMentions: { users: user ? [user.id] : [] } });
    }

    // ── create ────────────────────────────────────────────────────────────────
    else if (sub === 'create') {
      const name    = interaction.options.getString('name').toLowerCase().replace(/\s+/g, '-');
      const content = interaction.options.getString('content');
      if (db.getTag(guildId, name))
        return interaction.reply({ content: `❌ A tag named \`${name}\` already exists. Use \`/tag edit\` to update it.`, ephemeral: true });
      try {
        db.createTag(guildId, name, content, interaction.user.id);
        const embed = new EmbedBuilder()
          .setColor(GREEN)
          .setTitle('🏷️ Tag Created')
          .addFields(
            { name: 'Name',    value: `\`${name}\``, inline: true },
            { name: 'Length',  value: `${content.length} chars`, inline: true },
          )
          .setDescription(`> ${content.slice(0, 200)}${content.length > 200 ? '…' : ''}`)
          .setFooter({ text: `Send with /tag send • Created by ${interaction.user.username}` });
        await interaction.reply({ embeds: [embed], ephemeral: true });
      } catch {
        await interaction.reply({ content: '❌ Failed to create tag. Name may be invalid.', ephemeral: true });
      }
    }

    // ── edit ──────────────────────────────────────────────────────────────────
    else if (sub === 'edit') {
      const name    = interaction.options.getString('name');
      const content = interaction.options.getString('content');
      const row     = db.getTag(guildId, name);
      if (!row) return interaction.reply({ content: `❌ No tag named \`${name}\`.`, ephemeral: true });
      // Only creator or Manage Guild can edit
      if (row.created_by !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ You can only edit tags you created.', ephemeral: true });
      db.editTag(guildId, name, content);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(YELLOW).setTitle('🏷️ Tag Updated')
          .setDescription(`\`${name}\` has been updated.\n> ${content.slice(0, 200)}${content.length > 200 ? '…' : ''}`)],
        ephemeral: true,
      });
    }

    // ── delete ────────────────────────────────────────────────────────────────
    else if (sub === 'delete') {
      const name = interaction.options.getString('name');
      const row  = db.getTag(guildId, name);
      if (!row) return interaction.reply({ content: `❌ No tag named \`${name}\`.`, ephemeral: true });
      if (row.created_by !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.reply({ content: '❌ You can only delete tags you created.', ephemeral: true });
      db.deleteTag(guildId, name);
      await interaction.reply({ content: `🗑️ Tag \`${name}\` deleted.`, ephemeral: true });
    }

    // ── list ──────────────────────────────────────────────────────────────────
    else if (sub === 'list') {
      const tags = db.listTags(guildId);
      if (!tags.length)
        return interaction.reply({ content: '📭 No tags saved yet. Use `/tag create` to add one.', ephemeral: true });

      const lines = tags.map((t, i) => `\`${String(i + 1).padStart(2, ' ')}.\` **${t.name}** — ${t.uses} uses`);
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle(`🏷️ Tags — ${interaction.guild.name}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${tags.length} tag${tags.length !== 1 ? 's' : ''} • /tag send <name>` });
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── info ──────────────────────────────────────────────────────────────────
    else if (sub === 'info') {
      const name = interaction.options.getString('name');
      const row  = db.getTag(guildId, name);
      if (!row) return interaction.reply({ content: `❌ No tag named \`${name}\`.`, ephemeral: true });
      let creatorTag = `<@${row.created_by}>`;
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setTitle(`🏷️ ${row.name}`)
        .setDescription(`> ${row.content.slice(0, 1000)}${row.content.length > 1000 ? '…' : ''}`)
        .addFields(
          { name: 'Created by', value: creatorTag, inline: true },
          { name: 'Uses',       value: `${row.uses}`,           inline: true },
          { name: 'Created',    value: `<t:${row.created_at}:R>`, inline: true },
        )
        .setFooter({ text: 'flux bot' });
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── menu ──────────────────────────────────────────────────────────────────
    else if (sub === 'menu') {
      const tags = db.listTags(guildId);
      if (!tags.length)
        return interaction.reply({ content: '📭 No tags yet. Use `/tag create` to add one.', ephemeral: true });

      const options = tags.slice(0, 25).map(t => ({
        label: t.name,
        value: t.name,
        description: t.content.slice(0, 100),
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('tag:menu')
        .setPlaceholder('Pick a tag to send…')
        .addOptions(options);

      await interaction.reply({
        content: '**Select a tag to send:**',
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true,
      });
    }
  },
};

module.exports = [tag];
