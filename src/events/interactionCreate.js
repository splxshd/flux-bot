'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database');

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    try {
      // ── Slash commands ──────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) return interaction.reply({ content: 'Unknown command.', ephemeral: true });
        await cmd.execute(interaction, client);
        return;
      }

      // ── Select menus ────────────────────────────────────────────────────────
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'slash_help_category') {
          const helpCmd = client.commands.get('help');
          if (helpCmd && helpCmd.handleSelect) {
            await helpCmd.handleSelect(interaction, client);
          }
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

        // Giveaway enter
        if (id.startsWith('giveaway_enter_')) {
          await interaction.reply({ content: '🎉 You have entered the giveaway!', ephemeral: true });
          return;
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

        // Nuke schedule confirm
        if (id.startsWith('nuke_confirm_')) {
          const channelId = id.replace('nuke_confirm_', '');
          const channel = interaction.guild.channels.cache.get(channelId);
          if (!channel) {
            await interaction.update({ content: '❌ Channel not found.', components: [] });
            return;
          }
          try {
            const newChannel = await channel.clone();
            await channel.delete();
            await newChannel.send('💥 Channel nuked!');
            await interaction.update({ content: `✅ Channel ${newChannel} has been nuked.`, components: [] });
          } catch (e) {
            await interaction.update({ content: `❌ Failed to nuke: ${e.message}`, components: [] });
          }
          return;
        }

        if (id === 'nuke_cancel') {
          await interaction.update({ content: '❌ Nuke cancelled.', components: [] });
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
