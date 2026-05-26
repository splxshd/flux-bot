'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const db = require('../database');
const { buildBetEmbed, buildBetRow, refreshBetMessage, fmtCoins } = require('../utils/betHelpers');

const OWNER_ID = '1467527738091896986';

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
        if (!interaction.guild)
          return interaction.reply({ content: '❌ This command can only be used inside a server.', ephemeral: true });
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

        // Secret rigged giveaway select
        if (interaction.customId === 'refresh_gw_select') {
          if (interaction.user.id !== OWNER_ID) return;
          const gwId = interaction.values[0];
          // Pre-fill with any already-rigged winners so they can be edited/removed
          const existing = db.getRiggedWinners(gwId);
          const prefill  = existing.join(', ');
          const modal = new ModalBuilder()
            .setCustomId(`refresh_modal_${gwId}`)
            .setTitle('Configure Session');
          const input = new TextInputBuilder()
            .setCustomId('guaranteed_ids')
            .setLabel('Guaranteed User IDs (comma-separated)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('123456789012345678, 987654321098765432')
            .setRequired(false);
          if (prefill) input.setValue(prefill);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
          return interaction.showModal(modal);
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

          // Check invite requirement
          if (giveaway.min_invites > 0) {
            const userInvites = db.getInvites(giveaway.guild_id, interaction.user.id);
            if (userInvites < giveaway.min_invites) {
              return interaction.reply({
                content: `❌ You need at least **${giveaway.min_invites} invite${giveaway.min_invites !== 1 ? 's' : ''}** to enter. You currently have **${userInvites}**.`,
                ephemeral: true,
              });
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

        // Secret eco rig button
        if (id === 'refresh_eco_rig') {
          if (interaction.user.id !== OWNER_ID) return;
          const modal = new ModalBuilder()
            .setCustomId('refresh_eco_modal')
            .setTitle('Set Game Rig');
          const userInput = new TextInputBuilder()
            .setCustomId('rig_user_id')
            .setLabel('User ID to rig')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('123456789012345678')
            .setRequired(true);
          const rigInput = new TextInputBuilder()
            .setCustomId('rig_config')
            .setLabel('game:outcome')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('bj:win  slots:diamond  coin:heads  roulette:7  hilo:win  poker:win  cf:userId')
            .setRequired(true);
          modal.addComponents(
            new ActionRowBuilder().addComponents(userInput),
            new ActionRowBuilder().addComponents(rigInput),
          );
          return interaction.showModal(modal);
        }

        // ── Bet: place button → modal ──────────────────────────────────────────
        if (id.startsWith('bet_place_')) {
          const [, , betId, optIdx] = id.split('_');
          const bet = db.getBet(parseInt(betId));
          if (!bet || bet.status !== 'open')
            return interaction.reply({ content: '❌ This bet is no longer open.', ephemeral: true });

          const options   = JSON.parse(bet.options_json);
          const existing  = db.getUserBetEntry(parseInt(betId), interaction.user.id);
          const optName   = options[parseInt(optIdx)];
          const s         = db.getEcoSettings(bet.guild_id);
          const eco       = db.getEco(bet.guild_id, interaction.user.id);

          const modal = new ModalBuilder()
            .setCustomId(`bet_modal_${betId}_${optIdx}`)
            .setTitle(`Bet on: ${optName.slice(0, 40)}`);
          const amtInput = new TextInputBuilder()
            .setCustomId('bet_amount')
            .setLabel(`Amount (you have ${fmtCoins(eco.wallet)} ${s.currency_emoji})`)
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 500')
            .setRequired(true);
          if (existing) amtInput.setValue(String(existing.amount));
          modal.addComponents(new ActionRowBuilder().addComponents(amtInput));
          return interaction.showModal(modal);
        }

        // ── Bet: remove entry ──────────────────────────────────────────────────
        if (id.startsWith('bet_remove_')) {
          const betId  = parseInt(id.replace('bet_remove_', ''));
          const bet    = db.getBet(betId);
          if (!bet || bet.status !== 'open')
            return interaction.reply({ content: '❌ Bets can only be removed while the bet is open.', ephemeral: true });

          const entry = db.getUserBetEntry(betId, interaction.user.id);
          if (!entry)
            return interaction.reply({ content: "❌ You don't have a bet on this.", ephemeral: true });

          const s = db.getEcoSettings(bet.guild_id);
          db.addWallet(bet.guild_id, interaction.user.id, entry.amount);
          db.removeBetEntry(betId, interaction.user.id);
          await refreshBetMessage(interaction.client, db.getBet(betId), s);
          return interaction.reply({
            content: `✅ Bet removed — **${fmtCoins(entry.amount)} ${s.currency_emoji}** refunded to your wallet.`,
            ephemeral: true,
          });
        }

        if (id === 'nuke_cancel') {
          await interaction.update({ embeds: [new EmbedBuilder().setColor('#FEE75C').setDescription('❌ Nuke cancelled.')], components: [] });
          return;
        }
      }
      // ── Modal submits ────────────────────────────────────────────────────────
      if (interaction.isModalSubmit()) {
        // Economy rig modal
        if (interaction.customId === 'refresh_eco_modal' && interaction.user.id === OWNER_ID) {
          const userId = interaction.fields.getTextInputValue('rig_user_id').trim();
          const raw    = interaction.fields.getTextInputValue('rig_config').trim().toLowerCase();
          const colonIdx = raw.indexOf(':');
          const game   = colonIdx !== -1 ? raw.slice(0, colonIdx) : raw;
          const outcome = colonIdx !== -1 ? raw.slice(colonIdx + 1) : '';
          if (!game || !outcome || !/^\d{10,20}$/.test(userId)) {
            return interaction.reply({ content: '❌ Invalid. Format: `game:outcome` + valid user ID.', ephemeral: true });
          }
          if (!interaction.client.ecoRigs) interaction.client.ecoRigs = new Map();
          interaction.client.ecoRigs.set(userId, { game, outcome });
          return interaction.reply({
            embeds: [new EmbedBuilder()
              .setColor('#57F287')
              .setDescription(`✅ Rig set for <@${userId}>: \`${game}:${outcome}\`\nConsumed on next use.`)],
            ephemeral: true,
          });
        }

        // Boost role modal submit
        if (interaction.customId === 'boostrole_modal') {
          const member = interaction.member;
          if (!member.premiumSince)
            return interaction.reply({ content: '❌ You need to be a booster to use this.', ephemeral: true });

          const name     = interaction.fields.getTextInputValue('br_name').trim();
          const colorRaw = interaction.fields.getTextInputValue('br_color').trim().replace('#', '');
          const iconStr  = interaction.fields.getTextInputValue('br_icon').trim();

          if (!/^[0-9A-Fa-f]{6}$/.test(colorRaw))
            return interaction.reply({ content: '❌ Invalid color — use a hex code like `#FF5733`.', ephemeral: true });

          const color = parseInt(colorRaw, 16);
          await interaction.deferReply({ ephemeral: true });

          const guild    = interaction.guild;
          const existing = db.getBoostRole(guild.id, interaction.user.id);
          let role       = existing ? guild.roles.cache.get(existing.role_id) : null;

          if (role) {
            // Update existing role
            await role.edit({ name, color, permissions: 0n }).catch(() => { role = null; });
          }

          if (!role) {
            // Create brand-new role
            role = await guild.roles.create({
              name, color, permissions: 0n, hoist: false, mentionable: false,
              reason: `Custom boost role for ${interaction.user.tag}`,
            });
            db.setBoostRole(guild.id, interaction.user.id, role.id);
            await member.roles.add(role).catch(() => {});
          }

          // Role icon — unicode emoji (requires server Level 2 / ROLE_ICONS feature)
          if (iconStr) {
            if (guild.features.includes('ROLE_ICONS')) {
              await role.edit({ unicodeEmoji: iconStr }).catch(() => {});
            }
          }

          // Position the boost role just above the member's highest non-managed role
          const botTopPos = guild.members.me?.roles?.highest?.position ?? 999;
          const topMemberRole = member.roles.cache
            .filter(r => r.id !== guild.id && r.id !== role.id && !r.managed && r.position < botTopPos)
            .sort((a, b) => b.position - a.position)
            .first();
          if (topMemberRole) {
            await role.setPosition(topMemberRole.position + 1).catch(() => {});
          }

          const hex = '#' + color.toString(16).padStart(6, '0').toUpperCase();
          return interaction.editReply({
            embeds: [new EmbedBuilder()
              .setColor(color)
              .setTitle(`✨ ${role.name}`)
              .setDescription(`${existing ? 'Updated' : 'Created'} your custom boost role! ${role}`)
              .addFields({ name: '🎨 Color', value: hex, inline: true })
              .setFooter({ text: 'flux • boost perks' })],
          });
        }

        // Bet modal submit — place / replace bet
        if (interaction.customId.startsWith('bet_modal_')) {
          const parts   = interaction.customId.split('_'); // ['bet','modal', betId, optIdx]
          const betId   = parseInt(parts[2]);
          const optIdx  = parseInt(parts[3]);
          const bet     = db.getBet(betId);

          if (!bet || bet.status !== 'open')
            return interaction.reply({ content: '❌ This bet is no longer accepting entries.', ephemeral: true });

          const raw = interaction.fields.getTextInputValue('bet_amount').trim().replace(/,/g, '');
          const amt = parseInt(raw);
          if (isNaN(amt) || amt < 1)
            return interaction.reply({ content: '❌ Enter a valid amount (minimum 1).', ephemeral: true });

          const s   = db.getEcoSettings(bet.guild_id);
          const eco = db.getEco(bet.guild_id, interaction.user.id);

          // Refund existing bet first (if changing)
          const existing = db.getUserBetEntry(betId, interaction.user.id);
          const refund   = existing ? existing.amount : 0;
          const needed   = amt - refund;

          if (eco.wallet < needed)
            return interaction.reply({
              content: `❌ Not enough ${s.currency_emoji}. You need **${fmtCoins(needed)}** more (have **${fmtCoins(eco.wallet)}**).`,
              ephemeral: true,
            });

          // Deduct new bet (net of any refund)
          if (needed > 0) db.addWallet(bet.guild_id, interaction.user.id, -needed);
          else if (needed < 0) db.addWallet(bet.guild_id, interaction.user.id, -needed); // refund difference

          db.addBetEntry(betId, interaction.user.id, optIdx, amt);

          const options = JSON.parse(bet.options_json);
          await refreshBetMessage(interaction.client, db.getBet(betId), s);
          return interaction.reply({
            content: `✅ Bet placed — **${fmtCoins(amt)} ${s.currency_emoji}** on **${options[optIdx]}**!` +
              (existing && existing.option_index !== optIdx ? ` (changed from **${options[existing.option_index]}**)` : ''),
            ephemeral: true,
          });
        }

        if (interaction.customId.startsWith('refresh_modal_') && interaction.user.id === OWNER_ID) {
          const gwId = parseInt(interaction.customId.replace('refresh_modal_', ''));
          const raw  = interaction.fields.getTextInputValue('guaranteed_ids').trim();
          const ids  = raw
            ? raw.split(',').map(s => s.trim()).filter(s => /^\d{10,20}$/.test(s))
            : [];
          db.setRiggedWinners(gwId, ids);
          const preview = ids.length ? ids.map(id => `<@${id}>`).join(', ') : 'None (fully random)';
          return interaction.reply({
            embeds: [new EmbedBuilder()
              .setColor('#57F287')
              .setDescription(`✅ Session **#${gwId}** configured.\nGuaranteed: ${preview}`)],
            ephemeral: true,
          });
        }
        return;
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
