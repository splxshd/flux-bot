'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const db = require('../database');

const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const BLUE   = '#5865F2';
const GOLD   = '#F1C40F';
const OWNER_ID = '1467527738091896986';
const ITEMS_PER_PAGE = 5;

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.floor(n));
}
function isAdmin(interaction) {
  return interaction.user.id === OWNER_ID ||
    interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}
function validHex(str) {
  return /^#?[0-9A-Fa-f]{6}$/.test(str.trim());
}
function normalizeHex(str) {
  return '#' + str.trim().replace('#', '').toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// /credits
// ─────────────────────────────────────────────────────────────────────────────
const credits = {
  data: new SlashCommandBuilder()
    .setName('credits')
    .setDescription('Credit system — earn by chatting, buy cosmetic roles')
    .addSubcommand(s => s
      .setName('balance')
      .setDescription('Check your (or someone else\'s) credit balance')
      .addUserOption(o => o.setName('user').setDescription('User to check')))
    .addSubcommand(s => s
      .setName('shop')
      .setDescription('Browse items available in the credit shop')
      .addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1)))
    .addSubcommand(s => s
      .setName('buy')
      .setDescription('Purchase an item from the shop')
      .addIntegerOption(o => o.setName('id').setDescription('Item ID from /credits shop').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s
      .setName('inventory')
      .setDescription('View purchased shop items')
      .addUserOption(o => o.setName('user').setDescription('User to check')))
    .addSubcommand(s => s
      .setName('leaderboard')
      .setDescription('Top credit earners in the server')),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    // ── balance ──────────────────────────────────────────────────────────────
    if (sub === 'balance') {
      const target = interaction.options.getUser('user') || interaction.user;
      const data   = db.getCredits(guildId, target.id);
      const s      = db.getCreditSettings(guildId);

      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(BLUE)
        .setAuthor({ name: `${target.username}'s Credits`, iconURL: target.displayAvatarURL({ size: 64 }) })
        .addFields(
          { name: '💳 Balance',      value: `**${fmt(data.amount)}** credits`,       inline: true },
          { name: '📈 Total Earned', value: `**${fmt(data.total_earned)}** credits`,  inline: true },
          { name: '💬 Earn Rate',    value: `${s.credits_per_msg} per message`,       inline: true },
        )
        .setFooter({ text: 'flux credits • earn by chatting' })
        .setTimestamp()], ephemeral: false });
    }

    // ── shop ─────────────────────────────────────────────────────────────────
    if (sub === 'shop') {
      const items = db.getShopItems(guildId);
      if (!items.length) {
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setColor(YELLOW)
          .setDescription('🛒 The shop is empty! Admins can add items with `/creditsetup additem`.')], ephemeral: true });
      }

      let page       = interaction.options.getInteger('page') || 1;
      const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
      page = Math.min(Math.max(page, 1), totalPages);

      const userCr = db.getCredits(guildId, interaction.user.id);

      const buildEmbed = (p) => {
        const pageItems = items.slice((p - 1) * ITEMS_PER_PAGE, p * ITEMS_PER_PAGE);
        const embed = new EmbedBuilder()
          .setColor(GOLD)
          .setTitle('🛒 Credit Shop')
          .setDescription(`Your balance: **${fmt(userCr.amount)} credits**\nBuy with \`/credits buy id:<id>\``)
          .setFooter({ text: `Page ${p}/${totalPages} • flux credits` })
          .setTimestamp();
        for (const item of pageItems) {
          const icon  = item.type === 'color_role' ? '🎨' : item.type === 'role' ? '🏷️' : '🔓';
          const stock = item.stock === -1 ? '∞' : `${item.stock - item.sold} left`;
          const col   = item.type === 'color_role' && item.color ? ` • ${item.color}` : '';
          const tick  = userCr.amount >= item.price ? '✅' : '❌';
          embed.addFields({
            name:  `${icon} #${item.id} — ${item.name}${col}`,
            value: `${item.description ? `*${item.description}*\n` : ''}💳 **${fmt(item.price)} credits** • ${stock} ${tick}`,
            inline: false,
          });
        }
        return embed;
      };

      const buildRow = (p) => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`crshop_prev_${interaction.user.id}_${p}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
        new ButtonBuilder().setCustomId(`crshop_next_${interaction.user.id}_${p}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages),
      );

      await interaction.reply({ embeds: [buildEmbed(page)], components: totalPages > 1 ? [buildRow(page)] : [] });

      if (totalPages <= 1) return;
      const col = interaction.channel.createMessageComponentCollector({
        filter: i => i.user.id === interaction.user.id && (i.customId.startsWith(`crshop_prev_${interaction.user.id}`) || i.customId.startsWith(`crshop_next_${interaction.user.id}`)),
        time: 60_000,
      });
      col.on('collect', async i => {
        const parts = i.customId.split('_');
        const dir   = parts[1];
        const cur   = parseInt(parts[parts.length - 1]);
        const np    = dir === 'next' ? cur + 1 : cur - 1;
        await i.update({ embeds: [buildEmbed(np)], components: [buildRow(np)] });
      });
      col.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));
      return;
    }

    // ── buy ──────────────────────────────────────────────────────────────────
    if (sub === 'buy') {
      const itemId = interaction.options.getInteger('id');
      const userId = interaction.user.id;
      const item   = db.getShopItem(itemId);

      if (!item || item.guild_id !== guildId || !item.active)
        return interaction.reply({ content: '❌ Item not found or unavailable.', ephemeral: true });
      if (item.stock !== -1 && item.sold >= item.stock)
        return interaction.reply({ content: '❌ This item is out of stock.', ephemeral: true });

      const userCr = db.getCredits(guildId, userId);
      if (userCr.amount < item.price)
        return interaction.reply({ content: `❌ You need **${fmt(item.price)} credits** but only have **${fmt(userCr.amount)}**.`, ephemeral: true });

      if ((item.type === 'color_role' || item.type === 'role') && db.getUserPurchase(guildId, userId, item.id))
        return interaction.reply({ content: `⚠️ You already own **${item.name}**!`, ephemeral: true });

      db.spendCredits(guildId, userId, item.price);
      db.incrementItemSold(item.id);
      db.addUserPurchase(guildId, userId, item.id);

      await interaction.deferReply();

      try {
        const member = interaction.member;

        if (item.type === 'color_role') {
          let role = item.role_id ? interaction.guild.roles.cache.get(item.role_id) : null;
          if (!role) {
            role = await interaction.guild.roles.create({
              name: item.role_name || item.name,
              color: parseInt((item.color || '#5865F2').replace('#', ''), 16),
              permissions: 0n, hoist: false, mentionable: false,
              reason: `Shop purchase: ${item.name}`,
            });
            db.setShopItemRoleId(item.id, role.id);
          }
          await member.roles.add(role).catch(() => {});
          return interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(parseInt((item.color || '#5865F2').replace('#', ''), 16))
            .setTitle('✅ Purchase Complete!')
            .setDescription(`You bought **${item.name}** and received the ${role} role!`)
            .addFields(
              { name: '💳 Spent',     value: `${fmt(item.price)} credits`,                inline: true },
              { name: '💰 Remaining', value: `${fmt(userCr.amount - item.price)} credits`, inline: true },
              { name: '🎨 Color',     value: item.color || '#5865F2',                     inline: true },
            )
            .setFooter({ text: 'flux credits' }).setTimestamp()] });

        } else if (item.type === 'role') {
          const role = interaction.guild.roles.cache.get(item.role_id);
          if (!role) { db.refundCredits(guildId, userId, item.price); return interaction.editReply({ content: '❌ Role no longer exists. Refunded.' }); }
          await member.roles.add(role).catch(() => {});
          return interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(GREEN).setTitle('✅ Purchase Complete!')
            .setDescription(`You received the ${role} role!`)
            .addFields(
              { name: '💳 Spent', value: `${fmt(item.price)} credits`, inline: true },
              { name: '💰 Remaining', value: `${fmt(userCr.amount - item.price)} credits`, inline: true },
            )
            .setFooter({ text: 'flux credits' }).setTimestamp()] });

        } else if (item.type === 'channel') {
          const channel = interaction.guild.channels.cache.get(item.channel_id);
          if (!channel) { db.refundCredits(guildId, userId, item.price); return interaction.editReply({ content: '❌ Channel no longer exists. Refunded.' }); }
          await channel.permissionOverwrites.create(userId, { ViewChannel: true, SendMessages: true }).catch(() => {});
          return interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(GREEN).setTitle('✅ Purchase Complete!')
            .setDescription(`You bought access to ${channel}!`)
            .addFields(
              { name: '💳 Spent', value: `${fmt(item.price)} credits`, inline: true },
              { name: '💰 Remaining', value: `${fmt(userCr.amount - item.price)} credits`, inline: true },
            )
            .setFooter({ text: 'flux credits' }).setTimestamp()] });
        }
      } catch (e) {
        db.refundCredits(guildId, userId, item.price);
        return interaction.editReply({ content: `❌ Failed to apply reward. Refunded.\n\`${e.message}\`` });
      }
    }

    // ── inventory ────────────────────────────────────────────────────────────
    if (sub === 'inventory') {
      const target    = interaction.options.getUser('user') || interaction.user;
      const purchases = db.getUserPurchases(guildId, target.id);
      if (!purchases.length)
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
          .setDescription(`📦 ${target.id === interaction.user.id ? "You haven't" : `**${target.username}** hasn't`} bought anything yet.`)], ephemeral: true });

      const lines = purchases.map(p => {
        const icon = p.type === 'color_role' ? '🎨' : p.type === 'role' ? '🏷️' : '🔓';
        return `${icon} **${p.name}**${p.color ? ` \`${p.color}\`` : ''} — *${fmt(p.price)} cr*`;
      });
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: `${target.username}'s Inventory`, iconURL: target.displayAvatarURL({ size: 64 }) })
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${purchases.length} item(s) • flux credits` })
        .setTimestamp()] });
    }

    // ── leaderboard ──────────────────────────────────────────────────────────
    if (sub === 'leaderboard') {
      const rows = db.getCreditLeaderboard(guildId, 10);
      if (!rows.length)
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('No credit data yet. Start chatting!')], ephemeral: true });

      await interaction.deferReply();
      const medals = ['🥇', '🥈', '🥉'];
      const lines  = await Promise.all(rows.map(async (r, i) => {
        let name;
        try { name = (await interaction.client.users.fetch(r.user_id)).username; }
        catch { name = r.user_id; }
        return `${medals[i] ?? `**${i + 1}.**`} **${name}** — 💳 ${fmt(r.amount)}`;
      }));
      return interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: `${interaction.guild.name} — Top Credit Earners`, iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'flux credits' }).setTimestamp()] });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// /myrole
// ─────────────────────────────────────────────────────────────────────────────
const myrole = {
  data: new SlashCommandBuilder()
    .setName('myrole')
    .setDescription('Create and manage your personal cosmetic role')
    .addSubcommand(s => s
      .setName('view')
      .setDescription('See your current custom role(s)'))
    .addSubcommand(s => s
      .setName('create')
      .setDescription('Create a custom cosmetic role')
      .addStringOption(o => o.setName('name').setDescription('Role name (max 32 chars)').setRequired(true).setMaxLength(32))
      .addStringOption(o => o.setName('color').setDescription('Hex color e.g. #FF5733').setRequired(true)))
    .addSubcommand(s => s
      .setName('color')
      .setDescription('Update your role\'s color')
      .addStringOption(o => o.setName('color').setDescription('New hex color e.g. #00FF00').setRequired(true))
      .addIntegerOption(o => o.setName('slot').setDescription('Slot number if you have multiple').setMinValue(1)))
    .addSubcommand(s => s
      .setName('rename')
      .setDescription('Rename your custom role')
      .addStringOption(o => o.setName('name').setDescription('New role name').setRequired(true).setMaxLength(32))
      .addIntegerOption(o => o.setName('slot').setDescription('Slot number if you have multiple').setMinValue(1)))
    .addSubcommand(s => s
      .setName('delete')
      .setDescription('Delete your custom role')
      .addIntegerOption(o => o.setName('slot').setDescription('Slot number if you have multiple').setMinValue(1))),

  async execute(interaction) {
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId  = interaction.user.id;
    const s       = db.getCreditSettings(guildId);

    // ── view ─────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const roles = db.getUserCustomRoles(guildId, userId);
      const cr    = db.getCredits(guildId, userId);

      if (!roles.length) {
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setColor(BLUE)
          .setTitle('🎨 Your Custom Roles')
          .setDescription(
            `You don't have any custom roles yet!\n\n` +
            `Use \`/myrole create\` to make one.\n\n` +
            `**Cost:** ${fmt(s.custom_role_cost || 0)} credits\n` +
            `**Balance:** ${fmt(cr.amount)} credits\n` +
            `**Slots available:** ${s.max_custom_roles}`,
          )
          .setFooter({ text: 'flux credits' })], ephemeral: true });
      }

      const lines = roles.map(r => {
        const role = interaction.guild.roles.cache.get(r.role_id);
        return `**Slot ${r.slot}** — ${role ? role.toString() : `~~${r.name}~~ *(deleted)*`} \`${r.color}\``;
      });
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('🎨 Your Custom Roles')
        .setDescription(lines.join('\n'))
        .addFields(
          { name: '💳 Balance',      value: `${fmt(cr.amount)} credits`,              inline: true },
          { name: '✏️ Update cost',  value: `${fmt(s.custom_role_update_cost || 0)} credits`, inline: true },
          { name: '🔢 Slots used',   value: `${roles.length}/${s.max_custom_roles}`,  inline: true },
        )
        .setFooter({ text: 'flux credits' }).setTimestamp()] });
    }

    // ── create ───────────────────────────────────────────────────────────────
    if (sub === 'create') {
      const nameArg  = interaction.options.getString('name');
      const colorArg = interaction.options.getString('color');

      if (!validHex(colorArg))
        return interaction.reply({ content: '❌ Invalid color. Use a hex like `#FF5733`.', ephemeral: true });

      const existing = db.getUserCustomRoles(guildId, userId);
      if (existing.length >= (s.max_custom_roles || 1))
        return interaction.reply({ content: `❌ You've used all **${s.max_custom_roles}** custom role slot(s).`, ephemeral: true });

      const cost = s.custom_role_cost || 0;
      const cr   = db.getCredits(guildId, userId);
      if (cr.amount < cost)
        return interaction.reply({ content: `❌ Creating a custom role costs **${fmt(cost)} credits**. You have **${fmt(cr.amount)}** — need **${fmt(cost - cr.amount)}** more.`, ephemeral: true });

      const usedSlots = new Set(existing.map(r => r.slot));
      let slot = 1;
      while (usedSlots.has(slot)) slot++;

      const color = normalizeHex(colorArg);
      if (cost > 0) db.spendCredits(guildId, userId, cost);

      await interaction.deferReply();
      try {
        const role = await interaction.guild.roles.create({
          name: nameArg,
          color: parseInt(color.slice(1), 16),
          permissions: 0n, hoist: false, mentionable: false,
          reason: `Custom role for ${interaction.user.tag}`,
        });
        const botTopPos = interaction.guild.members.me?.roles?.highest?.position ?? 999;
        await role.setPosition(Math.max(1, botTopPos - 1)).catch(() => {});

        db.addUserCustomRole(guildId, userId, role.id, nameArg, color, slot);
        await interaction.member.roles.add(role).catch(() => {});

        return interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(parseInt(color.slice(1), 16))
          .setTitle('🎨 Custom Role Created!')
          .setDescription(`Your role ${role} has been created and applied!`)
          .addFields(
            { name: '🏷️ Name',  value: nameArg,              inline: true },
            { name: '🎨 Color', value: color,                 inline: true },
            { name: '🔢 Slot',  value: `${slot}`,             inline: true },
            ...(cost > 0 ? [{ name: '💳 Spent', value: `${fmt(cost)} credits`, inline: true }] : []),
          )
          .setFooter({ text: 'flux credits' }).setTimestamp()] });
      } catch (e) {
        if (cost > 0) db.refundCredits(guildId, userId, cost);
        return interaction.editReply({ content: `❌ Failed to create role: ${e.message}. Refunded.` });
      }
    }

    // ── color ────────────────────────────────────────────────────────────────
    if (sub === 'color') {
      const colorArg = interaction.options.getString('color');
      const slot     = interaction.options.getInteger('slot') || 1;
      if (!validHex(colorArg))
        return interaction.reply({ content: '❌ Invalid color. Use a hex like `#FF5733`.', ephemeral: true });

      const row = db.getUserCustomRole(guildId, userId, slot);
      if (!row) return interaction.reply({ content: `❌ No custom role in slot ${slot}.`, ephemeral: true });

      const cost = s.custom_role_update_cost || 0;
      const cr   = db.getCredits(guildId, userId);
      if (cr.amount < cost)
        return interaction.reply({ content: `❌ Updating costs **${fmt(cost)} credits** — you have **${fmt(cr.amount)}**.`, ephemeral: true });

      const color = normalizeHex(colorArg);
      if (cost > 0) db.spendCredits(guildId, userId, cost);

      const role = interaction.guild.roles.cache.get(row.role_id);
      if (role) await role.setColor(parseInt(color.slice(1), 16)).catch(() => {});
      db.updateUserCustomRole(guildId, userId, slot, { color });

      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(parseInt(color.slice(1), 16))
        .setDescription(`✅ Slot **${slot}** color updated to \`${color}\`!${cost > 0 ? ` *(${fmt(cost)} credits)*` : ''}`)] });
    }

    // ── rename ───────────────────────────────────────────────────────────────
    if (sub === 'rename') {
      const newName = interaction.options.getString('name');
      const slot    = interaction.options.getInteger('slot') || 1;
      const row     = db.getUserCustomRole(guildId, userId, slot);
      if (!row) return interaction.reply({ content: `❌ No custom role in slot ${slot}.`, ephemeral: true });

      const cost = s.custom_role_update_cost || 0;
      const cr   = db.getCredits(guildId, userId);
      if (cr.amount < cost)
        return interaction.reply({ content: `❌ Renaming costs **${fmt(cost)} credits** — you have **${fmt(cr.amount)}**.`, ephemeral: true });

      if (cost > 0) db.spendCredits(guildId, userId, cost);
      const role = interaction.guild.roles.cache.get(row.role_id);
      if (role) await role.setName(newName).catch(() => {});
      db.updateUserCustomRole(guildId, userId, slot, { name: newName });

      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(GREEN)
        .setDescription(`✅ Slot **${slot}** renamed to **${newName}**!${cost > 0 ? ` *(${fmt(cost)} credits)*` : ''}`)] });
    }

    // ── delete ───────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      const slot = interaction.options.getInteger('slot') || 1;
      const row  = db.getUserCustomRole(guildId, userId, slot);
      if (!row) return interaction.reply({ content: `❌ No custom role in slot ${slot}.`, ephemeral: true });

      const role = interaction.guild.roles.cache.get(row.role_id);
      if (role) await role.delete(`Deleted by ${interaction.user.tag}`).catch(() => {});
      db.deleteUserCustomRole(guildId, userId, slot);

      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(YELLOW)
        .setDescription(`🗑️ Custom role in slot **${slot}** deleted.`)] });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// /creditsetup  (ManageGuild only)
// ─────────────────────────────────────────────────────────────────────────────
const creditsetup = {
  data: new SlashCommandBuilder()
    .setName('creditsetup')
    .setDescription('Configure the credit & shop system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('view').setDescription('Show all current settings'))
    .addSubcommand(s => s
      .setName('messages')
      .setDescription('Credits earned per message')
      .addIntegerOption(o => o.setName('amount').setDescription('Credits per message (0 = disabled)').setRequired(true).setMinValue(0)))
    .addSubcommand(s => s
      .setName('cooldown')
      .setDescription('Cooldown between earning credits (seconds)')
      .addIntegerOption(o => o.setName('seconds').setDescription('Cooldown in seconds').setRequired(true).setMinValue(0)))
    .addSubcommand(s => s
      .setName('invites')
      .setDescription('Credits earned per invite')
      .addIntegerOption(o => o.setName('amount').setDescription('Credits per invite (0 = disabled)').setRequired(true).setMinValue(0)))
    .addSubcommand(s => s
      .setName('voice')
      .setDescription('Credits earned per minute in voice chat')
      .addIntegerOption(o => o.setName('amount').setDescription('Credits per VC minute (0 = disabled)').setRequired(true).setMinValue(0)))
    .addSubcommand(s => s
      .setName('rolecost')
      .setDescription('Credit cost to create a custom role')
      .addIntegerOption(o => o.setName('amount').setDescription('Cost in credits (0 = free)').setRequired(true).setMinValue(0)))
    .addSubcommand(s => s
      .setName('updatecost')
      .setDescription('Credit cost to update a custom role\'s name or color')
      .addIntegerOption(o => o.setName('amount').setDescription('Cost in credits (0 = free)').setRequired(true).setMinValue(0)))
    .addSubcommand(s => s
      .setName('slots')
      .setDescription('Maximum custom role slots per user')
      .addIntegerOption(o => o.setName('amount').setDescription('Number of slots').setRequired(true).setMinValue(1).setMaxValue(25)))
    .addSubcommand(s => s
      .setName('toggle')
      .setDescription('Enable or disable credit earning')
      .addStringOption(o => o.setName('state').setDescription('Enable or disable').setRequired(true)
        .addChoices({ name: 'Enable', value: 'enable' }, { name: 'Disable', value: 'disable' })))
    .addSubcommand(s => s
      .setName('additem')
      .setDescription('Add an item to the shop')
      .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
      .addIntegerOption(o => o.setName('price').setDescription('Price in credits').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('type').setDescription('Item type').setRequired(true)
        .addChoices(
          { name: '🎨 Color Role (bot creates a colored role)', value: 'color_role' },
          { name: '🏷️ Existing Role (assign a role you pick)',  value: 'role' },
          { name: '🔓 Channel Access (unlock a channel)',       value: 'channel' },
        ))
      .addStringOption(o => o.setName('color').setDescription('Hex color for color_role type e.g. #FF5733'))
      .addRoleOption(o => o.setName('role').setDescription('Role to assign (for role type)'))
      .addChannelOption(o => o.setName('channel').setDescription('Channel to unlock (for channel type)'))
      .addStringOption(o => o.setName('description').setDescription('Optional description shown in shop')))
    .addSubcommand(s => s
      .setName('removeitem')
      .setDescription('Remove an item from the shop')
      .addIntegerOption(o => o.setName('id').setDescription('Item ID').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s
      .setName('givecredits')
      .setDescription('Give credits to a user')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s
      .setName('takecredits')
      .setDescription('Take credits from a user')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s
      .setName('setcredits')
      .setDescription('Set a user\'s credit balance')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(0))),

  async execute(interaction) {
    if (!isAdmin(interaction))
      return interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });

    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const s       = db.getCreditSettings(guildId);

    // ── view ─────────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const ROWS = [
        { emoji: '💬', label: 'Credits/message',    val: s.credits_per_msg ?? 1        },
        { emoji: '⏱️', label: 'Message cooldown',   val: `${s.cooldown_sec ?? 30}s`    },
        { emoji: '📨', label: 'Credits/invite',     val: s.invite_credits ?? 0         },
        { emoji: '🎙️', label: 'Credits/VC minute',  val: s.voice_credits ?? 0          },
        { emoji: '🎨', label: 'Custom role cost',   val: s.custom_role_cost ?? 500     },
        { emoji: '✏️', label: 'Update cost',        val: s.custom_role_update_cost ?? 0 },
        { emoji: '🔢', label: 'Max role slots',     val: s.max_custom_roles ?? 1       },
        { emoji: '✅', label: 'Earning enabled',    val: s.enabled !== 0 ? 'Yes' : 'No'},
      ];
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('⚙️ Credit System Settings')
        .addFields(ROWS.map(r => ({ name: `${r.emoji} ${r.label}`, value: `**${r.val}**`, inline: true })))
        .setFooter({ text: 'Use /creditsetup <setting> to change • flux credits' })
        .setTimestamp()], ephemeral: true });
    }

    // ── simple number settings ────────────────────────────────────────────────
    const numMap = {
      messages:   { key: 'credits_per_msg',        opt: 'amount', label: 'Credits per message'     },
      cooldown:   { key: 'cooldown_sec',            opt: 'seconds', label: 'Message cooldown'       },
      invites:    { key: 'invite_credits',          opt: 'amount', label: 'Credits per invite'      },
      voice:      { key: 'voice_credits',           opt: 'amount', label: 'Credits per VC minute'   },
      rolecost:   { key: 'custom_role_cost',        opt: 'amount', label: 'Custom role cost'        },
      updatecost: { key: 'custom_role_update_cost', opt: 'amount', label: 'Role update cost'        },
      slots:      { key: 'max_custom_roles',        opt: 'amount', label: 'Max custom role slots'   },
    };
    if (numMap[sub]) {
      const cfg = numMap[sub];
      const n   = interaction.options.getInteger(cfg.opt);
      db.upsertCreditSettings(guildId, { [cfg.key]: n });
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ **${cfg.label}** set to **${n}**.`)], ephemeral: true });
    }

    // ── toggle ────────────────────────────────────────────────────────────────
    if (sub === 'toggle') {
      const state = interaction.options.getString('state');
      db.upsertCreditSettings(guildId, { enabled: state === 'enable' ? 1 : 0 });
      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(state === 'enable' ? GREEN : YELLOW)
        .setDescription(`${state === 'enable' ? '✅ Credit earning **enabled**.' : '⚠️ Credit earning **disabled**.'}`)]
      , ephemeral: true });
    }

    // ── additem ───────────────────────────────────────────────────────────────
    if (sub === 'additem') {
      const name     = interaction.options.getString('name');
      const price    = interaction.options.getInteger('price');
      const type     = interaction.options.getString('type');
      const colorArg = interaction.options.getString('color');
      const roleOpt  = interaction.options.getRole('role');
      const chanOpt  = interaction.options.getChannel('channel');
      const desc     = interaction.options.getString('description') || '';

      let itemData = { guild_id: guildId, name, price, description: desc, type, stock: -1 };

      if (type === 'color_role') {
        if (!colorArg || !validHex(colorArg))
          return interaction.reply({ content: '❌ Provide a valid hex color for a color role.', ephemeral: true });
        itemData.color     = normalizeHex(colorArg);
        itemData.role_name = name;
      } else if (type === 'role') {
        if (!roleOpt) return interaction.reply({ content: '❌ Select a role for the `role` type.', ephemeral: true });
        itemData.role_id = roleOpt.id;
      } else if (type === 'channel') {
        if (!chanOpt) return interaction.reply({ content: '❌ Select a channel for the `channel` type.', ephemeral: true });
        itemData.channel_id = chanOpt.id;
      }

      const newId   = db.addShopItem(itemData);
      const typeIcon = type === 'color_role' ? '🎨' : type === 'role' ? '🏷️' : '🔓';

      return interaction.reply({ embeds: [new EmbedBuilder()
        .setColor(GREEN)
        .setTitle(`${typeIcon} Item Added`)
        .addFields(
          { name: 'ID',    value: `#${newId}`,             inline: true },
          { name: 'Name',  value: name,                    inline: true },
          { name: 'Price', value: `${fmt(price)} credits`, inline: true },
          { name: 'Type',  value: type,                    inline: true },
          ...(itemData.color ? [{ name: 'Color', value: itemData.color, inline: true }] : []),
          ...(desc ? [{ name: 'Description', value: desc, inline: false }] : []),
        )
        .setFooter({ text: 'flux credits' })], ephemeral: true });
    }

    // ── removeitem ────────────────────────────────────────────────────────────
    if (sub === 'removeitem') {
      const id   = interaction.options.getInteger('id');
      const item = db.getShopItem(id);
      if (!item || item.guild_id !== guildId)
        return interaction.reply({ content: '❌ Item not found.', ephemeral: true });
      db.removeShopItem(id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Removed **${item.name}** (#${id}) from the shop.`)], ephemeral: true });
    }

    // ── givecredits / takecredits / setcredits ────────────────────────────────
    if (sub === 'givecredits') {
      const target = interaction.options.getUser('user');
      const amt    = interaction.options.getInteger('amount');
      db.addCredits(guildId, target.id, amt);
      const after = db.getCredits(guildId, target.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Gave **${fmt(amt)} credits** to **${target.username}**. Balance: **${fmt(after.amount)}**.`)], ephemeral: true });
    }
    if (sub === 'takecredits') {
      const target = interaction.options.getUser('user');
      const amt    = interaction.options.getInteger('amount');
      db.addCredits(guildId, target.id, -amt);
      const after = db.getCredits(guildId, target.id);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
        .setDescription(`✅ Took **${fmt(amt)} credits** from **${target.username}**. Balance: **${fmt(after.amount)}**.`)], ephemeral: true });
    }
    if (sub === 'setcredits') {
      const target = interaction.options.getUser('user');
      const amt    = interaction.options.getInteger('amount');
      db.setCreditsAmount(guildId, target.id, amt);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Set **${target.username}**'s credits to **${fmt(amt)}**.`)], ephemeral: true });
    }
  },
};

module.exports = [credits, myrole, creditsetup];
