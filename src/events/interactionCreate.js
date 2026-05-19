'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    try {
      // ── Autocomplete ────────────────────────────────────────────────────────
      if (interaction.isAutocomplete()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd?.autocomplete) await cmd.autocomplete(interaction);
        return;
      }

      // ── Slash commands ──────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) return interaction.reply({ content: 'Unknown command.', ephemeral: true });
        await cmd.execute(interaction, client);
        return;
      }

      // ── Select menus ────────────────────────────────────────────────────────
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'help_category' || interaction.customId === 'slash_help_category') {
          const helpCmd = client.commands.get('help');
          if (helpCmd?.handleInteraction) await helpCmd.handleInteraction(interaction);
          else if (helpCmd?.handleSelect) await helpCmd.handleSelect(interaction, client);
          return;
        }

        // Panel dropdowns
        if (interaction.customId.startsWith('panel:')) {
          const panelId = interaction.customId.slice(6);
          const panelRow = db.getPanel(panelId);
          if (!panelRow) {
            return interaction.reply({ content: '❌ This panel is no longer active.', ephemeral: true });
          }
          const options = JSON.parse(panelRow.options_json);
          const chosen  = interaction.values[0];
          const opt     = options.find((o, i) => (o.value || `opt_${i}`) === chosen);
          if (!opt) return interaction.reply({ content: '❌ Unknown option.', ephemeral: true });

          // Give/remove role if configured
          if (opt.role_id && interaction.guild) {
            const member = interaction.member;
            if (member) {
              const hasRole = member.roles.cache.has(opt.role_id);
              if (hasRole) {
                await member.roles.remove(opt.role_id).catch(() => {});
                return interaction.reply({ content: opt.remove_response || `✅ Role removed.`, ephemeral: true });
              } else {
                await member.roles.add(opt.role_id).catch(() => {});
                return interaction.reply({ content: opt.response || `✅ Role given.`, ephemeral: true });
              }
            }
          }

          // Text response (ephemeral)
          const text = opt.response || '✅ Done.';
          return interaction.reply({ content: text, ephemeral: true });
        }

        // Tag menu
        if (interaction.customId === 'tag:menu') {
          const name = interaction.values[0];
          const row  = db.getTag(interaction.guild.id, name);
          if (!row) return interaction.update({ content: '❌ Tag not found.', components: [] });
          db.incrementTagUses(interaction.guild.id, name);
          await interaction.update({ content: '✅ Sent!', components: [] });
          await interaction.channel.send({ content: row.content });
          return;
        }

        if (interaction.customId === 'prefix_help_cat') {
          const general = require('../prefix/general');
          const key = interaction.values[0];
          const row = new ActionRowBuilder().addComponents(general.buildSelectMenu());
          if (key === '__home__') {
            const embed = general.buildHomeEmbed(interaction.client);
            return interaction.update({ embeds: [embed], components: [row] });
          }
          if (general.HELP_CATS[key]) {
            const embed = general.buildCategoryEmbed(key, interaction.client);
            return interaction.update({ embeds: [embed], components: [row] });
          }
          return;
        }

        return;
      }

      // ── Buttons ─────────────────────────────────────────────────────────────
      if (interaction.isButton()) {
        const id = interaction.customId;

        // Help pagination / close
        if (id.startsWith('help_page_') || id === 'help_close') {
          const helpCmd = client.commands.get('help');
          if (helpCmd?.handleInteraction) await helpCmd.handleInteraction(interaction);
          return;
        }

        // Ticket buttons
        if (id === 'open_ticket') {
          const ticketCmd = client.commands.get('ticket');
          if (ticketCmd) await ticketCmd.execute(interaction, client);
          return;
        }

        if (id === 'ticket_close') {
          const ticketSetupCmd = client.commands.get('ticketsetup');
          if (ticketSetupCmd && ticketSetupCmd.handleClose) {
            await ticketSetupCmd.handleClose(interaction, client);
          }
          return;
        }

        if (id === 'ticket_transcript') {
          const ticketSetupCmd = client.commands.get('ticketsetup');
          if (ticketSetupCmd && ticketSetupCmd.handleTranscript) {
            await ticketSetupCmd.handleTranscript(interaction, client);
          }
          return;
        }

        // Copy TX hash button
        if (id.startsWith('copy_txhash_')) {
          const hash = id.replace('copy_txhash_', '');
          await interaction.reply({ content: `\`${hash}\``, ephemeral: true });
          return;
        }

        // Copy address button
        if (id.startsWith('copy_addr_')) {
          const addr = id.replace('copy_addr_', '');
          await interaction.reply({ content: `\`${addr}\``, ephemeral: true });
          return;
        }

        // Copy amount button
        if (id.startsWith('copy_amount_')) {
          const amount = id.replace('copy_amount_', '');
          await interaction.reply({ content: `\`${amount}\``, ephemeral: true });
          return;
        }

        // Wallet TOS
        if (id === 'tos_accept') {
          db.acceptTos(interaction.user.id);
          await interaction.update({ content: '✅ TOS accepted! You can now use `/wallet setup` to create your wallet.', embeds: [], components: [] });
          return;
        }

        if (id === 'tos_decline') {
          await interaction.update({ content: '❌ TOS declined. You cannot use the wallet system.', embeds: [], components: [] });
          return;
        }

        // Wallet send confirm/cancel
        if (id.startsWith('send_yes_') || id === 'send_yes') {
          const walletCmd = client.commands.get('wallet');
          if (walletCmd && walletCmd.handleSendConfirm) {
            await walletCmd.handleSendConfirm(interaction, client);
          }
          return;
        }

        if (id === 'send_no') {
          await interaction.update({ content: '❌ Transaction cancelled.', embeds: [], components: [] });
          return;
        }

        // Wallet key rotation confirm
        if (id === 'key_yes') {
          const walletCmd = client.commands.get('wallet');
          if (walletCmd && walletCmd.handleKeyRotate) {
            await walletCmd.handleKeyRotate(interaction, client);
          }
          return;
        }

        if (id === 'key_no') {
          await interaction.update({ content: '❌ Key rotation cancelled.', embeds: [], components: [] });
          return;
        }

        // Giveaway enter / leave toggle
        if (id.startsWith('giveaway_enter_')) {
          const gwId = parseInt(id.replace('giveaway_enter_', ''));
          const giveaway = db.getGiveaway(gwId);

          if (!giveaway || giveaway.ended || giveaway.cancelled) {
            return interaction.reply({ content: '❌ This giveaway has ended.', ephemeral: true });
          }

          // Check requirements
          if (giveaway.required_roles) {
            const roles = JSON.parse(giveaway.required_roles);
            if (roles.length > 0) {
              const member = interaction.member;
              const hasRole = roles.some(rid => member?.roles?.cache?.has(rid));
              if (!hasRole) {
                return interaction.reply({ content: `❌ You need <@&${roles[0]}> to enter this giveaway.`, ephemeral: true });
              }
            }
          }

          if (giveaway.min_level > 0 || giveaway.max_level != null) {
            const lvl = db.getUserLevel(giveaway.guild_id, interaction.user.id);
            const userLevel = lvl?.level ?? 0;
            if (giveaway.min_level > 0 && userLevel < giveaway.min_level) {
              return interaction.reply({ content: `❌ You need to be at least level **${giveaway.min_level}** to enter.`, ephemeral: true });
            }
            if (giveaway.max_level != null && userLevel > giveaway.max_level) {
              return interaction.reply({ content: `❌ You must be level **${giveaway.max_level}** or below to enter.`, ephemeral: true });
            }
          }

          const userId = interaction.user.id;
          const alreadyIn = db.hasEntry(gwId, userId);

          if (alreadyIn) {
            db.removeEntry(gwId, userId);
          } else {
            db.addEntry(gwId, userId);
          }

          const newCount = db.getEntryCount(gwId);
          const { buildRow } = require('../utils/giveawayHelpers');
          await interaction.message.edit({ components: [buildRow(gwId, newCount, false)] }).catch(() => {});

          return interaction.reply({
            content: alreadyIn
              ? '👋 You have left the giveaway.'
              : '🎉 You\'ve entered the giveaway! Good luck!',
            ephemeral: true,
          });
        }

        // Giveaway participants list
        if (id.startsWith('giveaway_participants_')) {
          const gwId = parseInt(id.replace('giveaway_participants_', ''));
          const entries = db.getEntries(gwId);
          if (entries.length === 0) {
            return interaction.reply({ content: '📭 No participants yet.', ephemeral: true });
          }
          const list = entries.map(e => `<@${e.user_id}>`).join(', ');
          return interaction.reply({
            content: `**👥 Participants (${entries.length}):**\n${list}`,
            ephemeral: true,
          });
        }

        // Autoping clear confirm
        if (id === 'autoping_clear_yes') {
          db.clearAutopings(interaction.guild.id);
          await interaction.update({ content: '✅ All autoping channels cleared.', components: [] });
          return;
        }

        if (id === 'autoping_clear_no') {
          await interaction.update({ content: '❌ Cancelled.', components: [] });
          return;
        }

        // Nuke confirm
        if (id.startsWith('nuke_confirm_')) {
          const channelId = id.replace('nuke_confirm_', '');
          const channel = interaction.guild.channels.cache.get(channelId);
          if (!channel) {
            await interaction.update({ embeds: [new EmbedBuilder().setColor('#ED4245').setDescription('❌ Channel not found.')], components: [] });
            return;
          }

          await interaction.update({
            embeds: [new EmbedBuilder().setColor('#F0A500').setTitle('💥 Nuking Channel...').setDescription(`Recreating ${channel} with the same settings and permissions.`).setTimestamp()],
            components: [],
          });

          try {
            const pos = channel.rawPosition;
            const newChannel = await channel.clone({ reason: `Nuked by ${interaction.user.tag}` });
            await newChannel.setPosition(pos).catch(() => {});

            let deleteErr = null;
            await channel.delete(`Nuked by ${interaction.user.tag}`).catch(e => { deleteErr = e; });

            const nukedEmbed = new EmbedBuilder()
              .setColor('#ED4245')
              .setTitle('💥 Channel Nuked')
              .setDescription(`This channel was recreated by <@${interaction.user.id}>.`)
              .addFields(
                { name: 'Old Channel ID', value: `\`${channelId}\``, inline: true },
                { name: 'Reason', value: 'No reason provided', inline: true },
              )
              .setTimestamp();

            await newChannel.send({ embeds: [nukedEmbed] });

            if (deleteErr) {
              await newChannel.send({ embeds: [new EmbedBuilder().setColor('#ED4245')
                .setTitle('❌ Nuke Partially Failed')
                .setDescription('The new channel was created, but something failed after that.')
                .addFields({ name: '​', value: `\`${deleteErr.message}\``, inline: false })
                .setTimestamp()] });
            }

            await interaction.editReply({ embeds: [new EmbedBuilder().setColor('#57F287').setDescription(`✅ ${newChannel} has been nuked.`)], components: [] }).catch(() => {});
          } catch (e) {
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor('#ED4245').setTitle('❌ Nuke Failed').setDescription(`\`${e.message}\``)], components: [] }).catch(() => {});
          }
          return;
        }

        if (id === 'nuke_cancel') {
          await interaction.update({ embeds: [new EmbedBuilder().setColor('#FEE75C').setDescription('❌ Nuke cancelled.')], components: [] });
          return;
        }
      }
    } catch (err) {
      console.error('[interactionCreate]', err);
      const msg = { content: `❌ An error occurred: ${err.message}`, ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        interaction.followUp(msg).catch(() => {});
      } else {
        interaction.reply(msg).catch(() => {});
      }
    }
  });
};
