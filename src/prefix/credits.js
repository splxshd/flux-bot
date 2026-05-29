'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const db = require('../database');
const { generateCreditsCard } = require('../utils/creditsCard');
const { generateThemedCard, THEME_NAMES } = require('../utils/themedCard');

const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const BLUE   = '#5865F2';
const GOLD   = '#F1C40F';
const OWNER_ID = '1467527738091896986';

const ITEMS_PER_PAGE = 5;

const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITY_BADGE = { common: '⬜ Common', uncommon: '🟩 Uncommon', rare: '🟦 Rare', epic: '🟪 Epic', legendary: '🟨 Legendary' };
const RARITY_COLOR = { common: '#95a5a6', uncommon: '#2ecc71', rare: '#3498db', epic: '#9b59b6', legendary: '#f1c40f' };

function _msTilMidnightUTC() {
  const now = Date.now();
  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  return midnight - now;
}
function _msTilNextMonday() {
  const now = new Date();
  const day = now.getUTCDay();
  const daysLeft = (8 - day) % 7 || 7;
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysLeft);
  next.setUTCHours(0, 0, 0, 0);
  return next - now;
}
function _fmtMs(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function isAdmin(message) {
  return message.author.id === OWNER_ID ||
    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.floor(n));
}

// ── ,credits [@user] ──────────────────────────────────────────────────────────
const credits = {
  name: 'credits',
  aliases: ['cr', 'creds'],
  async execute(message) {
    const target  = message.mentions.users.first() || message.author;
    const guildId = message.guild.id;
    const data    = db.getCredits(guildId, target.id);
    const s       = db.getCreditSettings(guildId);
    const items   = db.getShopItems(guildId);

    const equippedTheme = db.getUserTheme(guildId, target.id);
    const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });

    try {
      let buffer;
      if (equippedTheme && THEME_NAMES.includes(equippedTheme)) {
        buffer = await generateThemedCard({
          username:    target.username,
          avatarUrl,
          balance:     data.amount,
          totalEarned: data.total_earned,
          shopItems:   items,
          theme:       equippedTheme,
        });
      } else {
        buffer = await generateCreditsCard({
          username:    target.username,
          avatarUrl,
          balance:     data.amount,
          totalEarned: data.total_earned,
          shopItems:   items,
        });
      }
      const attachment = new AttachmentBuilder(buffer, { name: 'credits.png' });
      await message.reply({ files: [attachment] });
    } catch (err) {
      console.error('[credits card]', err);
      // Fallback to embed if canvas fails
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setAuthor({ name: `${target.username}'s Credits`, iconURL: target.displayAvatarURL({ size: 64 }) })
        .addFields(
          { name: '💳 Balance',      value: `**${fmt(data.amount)}** credits`,       inline: true },
          { name: '📈 Total Earned', value: `**${fmt(data.total_earned)}** credits`,  inline: true },
          { name: '💬 Earn Rate',    value: `${s.credits_per_msg} per message`,       inline: true },
        )
        .setFooter({ text: 'flux credits • earn by chatting' })
        .setTimestamp();
      await message.reply({ embeds: [embed] });
    }
  },
};

// ── ,shop [page] ──────────────────────────────────────────────────────────────
const shop = {
  name: 'shop',
  aliases: ['store', 'creditshop'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const items   = db.getShopItems(guildId);

    if (!items.length) {
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(YELLOW)
        .setDescription('🛒 The shop is empty! Admins can add items with `,additem`.')] });
    }

    let page       = Math.max(1, parseInt(args[0]) || 1);
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
    page = Math.min(page, totalPages);

    const userCr = db.getCredits(guildId, message.author.id);

    function buildEmbed(p) {
      const start     = (p - 1) * ITEMS_PER_PAGE;
      const pageItems = items.slice(start, start + ITEMS_PER_PAGE);

      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('🛒 Credit Shop')
        .setDescription(`Your balance: **${fmt(userCr.amount)} credits**\nBuy items with \`,buy <id>\``)
        .setFooter({ text: `Page ${p}/${totalPages} • flux credits` })
        .setTimestamp();

      for (const item of pageItems) {
        const typeIcon  = item.type === 'color_role' ? '🎨' : item.type === 'role' ? '🏷️' : '🔓';
        const stockStr  = item.stock === -1 ? '∞' : `${item.stock - item.sold} left`;
        const colorStr  = item.type === 'color_role' && item.color ? ` • ${item.color}` : '';
        const canAfford = userCr.amount >= item.price ? '✅' : '❌';
        const desc      = item.description ? `*${item.description}*\n` : '';
        embed.addFields({
          name:  `${typeIcon} #${item.id} — ${item.name}${colorStr}`,
          value: `${desc}💳 **${fmt(item.price)} credits** • Stock: ${stockStr} ${canAfford}`,
          inline: false,
        });
      }
      return embed;
    }

    function buildRow(p) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`shop_prev_${message.author.id}_${p}`)
          .setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(p <= 1),
        new ButtonBuilder()
          .setCustomId(`shop_next_${message.author.id}_${p}`)
          .setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages),
      );
    }

    const msg = await message.reply({
      embeds: [buildEmbed(page)],
      components: totalPages > 1 ? [buildRow(page)] : [],
    });

    if (totalPages <= 1) return;

    const col = msg.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id &&
        (i.customId.startsWith(`shop_prev_${message.author.id}`) ||
         i.customId.startsWith(`shop_next_${message.author.id}`)),
      time: 60_000,
    });

    col.on('collect', async (i) => {
      const parts  = i.customId.split('_');
      const dir    = parts[1]; // 'prev' or 'next'
      const cur    = parseInt(parts[parts.length - 1]);
      const newP   = dir === 'next' ? cur + 1 : cur - 1;
      await i.update({ embeds: [buildEmbed(newP)], components: [buildRow(newP)] });
    });

    col.on('end', () => msg.edit({ components: [] }).catch(() => {}));
  },
};

// ── ,buy <id or name> ─────────────────────────────────────────────────────────
const buy = {
  name: 'buy',
  aliases: ['purchase', 'buyitem'],
  async execute(message, args, client) {
    if (!args.length) return message.reply('Usage: `,buy <item id>`');

    const guildId = message.guild.id;
    const userId  = message.author.id;
    const query   = args[0];
    const itemId  = parseInt(query);

    const item = !isNaN(itemId)
      ? db.getShopItem(itemId)
      : db.getShopItemByName(guildId, args.join(' '));

    if (!item || item.guild_id !== guildId || !item.active) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription('❌ Item not found or unavailable. Check `,shop` for valid IDs.')] });
    }

    if (item.stock !== -1 && item.sold >= item.stock) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription('❌ This item is **out of stock**.')] });
    }

    const userCr = db.getCredits(guildId, userId);
    if (userCr.amount < item.price) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ You need **${fmt(item.price)} credits** but only have **${fmt(userCr.amount)}**.\nKeep chatting to earn more!`)] });
    }

    // Prevent duplicate purchases
    if (item.type === 'color_role' || item.type === 'role') {
      if (db.getUserPurchase(guildId, userId, item.id)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
          .setDescription(`⚠️ You already own **${item.name}**!`)] });
      }
    }
    if (item.type === 'theme' && item.theme_name) {
      if (db.hasTheme(guildId, userId, item.theme_name)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
          .setDescription(`⚠️ You already own the **${item.theme_name}** card theme! Equip it with \`,cardtheme ${item.theme_name}\`.`)] });
      }
    }

    // Deduct + record
    db.spendCredits(guildId, userId, item.price);
    db.incrementItemSold(item.id);
    db.addUserPurchase(guildId, userId, item.id);

    try {
      if (item.type === 'theme') {
        const themeName = item.theme_name;
        if (!themeName) {
          db.refundCredits(guildId, userId, item.price);
          return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
            .setDescription('❌ This theme item has no theme configured. You have been refunded.')] });
        }
        db.addOwnedTheme(guildId, userId, themeName);
        db.setEquippedTheme(guildId, userId, themeName);
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(parseInt((RARITY_COLOR[item.rarity] || '#5865F2').replace('#', ''), 16))
          .setTitle('🎴 Theme Unlocked!')
          .setDescription(`You bought **${item.name}** and unlocked the **${themeName}** card theme!\nIt has been auto-equipped — run \`,credits\` to see it.`)
          .addFields(
            { name: '💳 Spent',     value: `${fmt(item.price)} credits`,                 inline: true },
            { name: '💰 Remaining', value: `${fmt(userCr.amount - item.price)} credits`, inline: true },
            { name: '✨ Rarity',    value: RARITY_BADGE[item.rarity] || 'Common',        inline: true },
          )
          .setFooter({ text: 'flux credits' })
          .setTimestamp()] });

      } else if (item.type === 'color_role') {
        let role = item.role_id ? message.guild.roles.cache.get(item.role_id) : null;
        if (!role) {
          const colorInt = item.color ? parseInt(item.color.replace('#', ''), 16) : 0x5865F2;
          role = await message.guild.roles.create({
            name: item.role_name || item.name,
            color: colorInt,
            permissions: 0n,
            hoist: false,
            mentionable: false,
            reason: `Shop purchase: ${item.name}`,
          });
          db.setShopItemRoleId(item.id, role.id);
        }
        await message.member.roles.add(role).catch(() => {});

        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(parseInt((item.color || '#5865F2').replace('#', ''), 16))
          .setTitle('✅ Purchase Complete!')
          .setDescription(`You bought **${item.name}** and received the ${role} role!`)
          .addFields(
            { name: '💳 Spent',     value: `${fmt(item.price)} credits`,                       inline: true },
            { name: '💰 Remaining', value: `${fmt(userCr.amount - item.price)} credits`,        inline: true },
            { name: '🎨 Color',     value: item.color || '#5865F2',                             inline: true },
          )
          .setFooter({ text: 'flux credits' })
          .setTimestamp()] });

      } else if (item.type === 'role') {
        const role = message.guild.roles.cache.get(item.role_id);
        if (!role) {
          db.refundCredits(guildId, userId, item.price);
          return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
            .setDescription('❌ The role for this item no longer exists. You have been refunded.')] });
        }
        await message.member.roles.add(role).catch(() => {});

        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(GREEN)
          .setTitle('✅ Purchase Complete!')
          .setDescription(`You bought **${item.name}** and received the ${role} role!`)
          .addFields(
            { name: '💳 Spent',     value: `${fmt(item.price)} credits`,                 inline: true },
            { name: '💰 Remaining', value: `${fmt(userCr.amount - item.price)} credits`, inline: true },
          )
          .setFooter({ text: 'flux credits' })
          .setTimestamp()] });

      } else if (item.type === 'channel') {
        const channel = message.guild.channels.cache.get(item.channel_id);
        if (!channel) {
          db.refundCredits(guildId, userId, item.price);
          return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
            .setDescription('❌ The channel for this item no longer exists. You have been refunded.')] });
        }
        await channel.permissionOverwrites.create(userId, {
          ViewChannel: true,
          SendMessages: true,
        }).catch(() => {});

        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(GREEN)
          .setTitle('✅ Purchase Complete!')
          .setDescription(`You bought access to **${channel.name}**!\nHead over to ${channel}.`)
          .addFields(
            { name: '💳 Spent',     value: `${fmt(item.price)} credits`,                 inline: true },
            { name: '💰 Remaining', value: `${fmt(userCr.amount - item.price)} credits`, inline: true },
          )
          .setFooter({ text: 'flux credits' })
          .setTimestamp()] });
      }

    } catch (err) {
      db.refundCredits(guildId, userId, item.price);
      console.error('[buy]', err);
      await message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ Something went wrong applying the reward. You have been refunded.\n\`${err.message}\``)] });
    }
  },
};

// ── ,inventory [@user] ────────────────────────────────────────────────────────
const inventory = {
  name: 'inventory',
  aliases: ['inv', 'myitems', 'purchases'],
  async execute(message) {
    const target    = message.mentions.users.first() || message.author;
    const guildId   = message.guild.id;
    const purchases = db.getUserPurchases(guildId, target.id);
    const isSelf    = target.id === message.author.id;

    if (!purchases.length) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setDescription(`📦 ${isSelf ? "You haven't" : `**${target.username}** hasn't`} bought anything from the shop yet.\nCheck out \`,shop\`!`)] });
    }

    const lines = purchases.map(p => {
      const typeIcon  = p.type === 'color_role' ? '🎨' : p.type === 'role' ? '🏷️' : '🔓';
      const colorStr  = p.type === 'color_role' && p.color ? ` \`${p.color}\`` : '';
      return `${typeIcon} **${p.name}**${colorStr} — *${fmt(p.price)} cr*`;
    });

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(GOLD)
      .setAuthor({ name: `${target.username}'s Inventory`, iconURL: target.displayAvatarURL({ size: 64 }) })
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${purchases.length} item${purchases.length !== 1 ? 's' : ''} owned • flux credits` })
      .setTimestamp()] });
  },
};

// ── ,creditlead ───────────────────────────────────────────────────────────────
const creditlead = {
  name: 'creditlead',
  aliases: ['crlead', 'credittop', 'crtop'],
  async execute(message) {
    const guildId = message.guild.id;
    const rows    = db.getCreditLeaderboard(guildId, 10);

    if (!rows.length) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setDescription('No credit data yet. Start chatting!')] });
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines  = await Promise.all(rows.map(async (r, i) => {
      let name;
      try { name = (await message.client.users.fetch(r.user_id)).username; }
      catch { name = r.user_id; }
      return `${medals[i] ?? `**${i + 1}.**`} **${name}** — 💳 ${fmt(r.amount)} credits`;
    }));

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(GOLD)
      .setAuthor({ name: `${message.guild.name} — Top Credit Earners`, iconURL: message.guild.iconURL({ dynamic: true }) || undefined })
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'flux credits' })
      .setTimestamp()] });
  },
};

// ── ,additem (admin) ──────────────────────────────────────────────────────────
// ,additem Name | price | color #HEX [role name override] [| description]
// ,additem Name | price | role @role [| description]
// ,additem Name | price | channel #channel [| description]
const additem = {
  name: 'additem',
  aliases: ['addshopitem', 'shopadditem'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
    }

    const raw   = message.content.slice(message.content.indexOf(' ') + 1);
    const parts = raw.split('|').map(p => p.trim());

    if (parts.length < 3) {
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('📦 ,additem Usage')
        .addFields(
          { name: '🎨 Color Role',   value: '`,additem Name | price | color #HEX [role name]`', inline: false },
          { name: '🏷️ Existing Role', value: '`,additem Name | price | role @role`',             inline: false },
          { name: '🔓 Channel Access', value: '`,additem Name | price | channel #channel`',      inline: false },
        )
        .setDescription('Separate all parts with `|`. Optionally add a 5th part as a description.')
        .setFooter({ text: 'flux credits' })] });
    }

    const name  = parts[0];
    const price = parseInt(parts[1]);
    if (!name || isNaN(price) || price < 1) {
      return message.reply('❌ Invalid name or price.');
    }

    const guildId = message.guild.id;

    // Extract rarity from any segment (if a segment is purely a rarity keyword)
    let rarity = 'common';
    const rarityIdx = parts.findIndex((p, i) => i >= 2 && RARITIES.includes(p.trim().toLowerCase()));
    if (rarityIdx !== -1) {
      rarity = parts[rarityIdx].trim().toLowerCase();
      parts.splice(rarityIdx, 1);
    }

    // Auto-detect type when user skips the keyword and just puts @role / #HEX / hex directly
    let seg3 = (parts[2] || '').trim();
    let seg4 = parts[3] || '';
    const desc = parts[4] || '';

    // If 3rd segment is just a role mention/ID, inject "role" keyword
    if (/^<@&\d+>$/.test(seg3) || /^\d{17,20}$/.test(seg3)) {
      seg4 = seg3; seg3 = 'role';
    }
    // If 3rd segment is a bare hex (#RRGGBB or RRGGBB), inject "color" keyword
    else if (/^#?[0-9A-Fa-f]{6}$/.test(seg3)) {
      seg4 = seg3.startsWith('#') ? seg3 : '#' + seg3;
      seg3 = 'color ' + seg4; seg4 = '';
    }

    const typePart = seg3.toLowerCase();
    const dataPart = seg4;
    let itemData = { guild_id: guildId, name, price, description: desc, active: 1, stock: -1, sold: 0, rarity };

    if (typePart.startsWith('color')) {
      const combined = seg3 + ' ' + dataPart;
      const hexMatch = combined.match(/#([0-9A-Fa-f]{6})/i);
      if (!hexMatch) return message.reply('❌ Provide a hex color like `#FF5733`.');
      const color    = '#' + hexMatch[1].toUpperCase();
      const afterHex = combined.replace(/#[0-9A-Fa-f]{6}/i, '').replace(/^color\s*/i, '').trim();
      itemData.type      = 'color_role';
      itemData.color     = color;
      itemData.role_name = afterHex || name;

    } else if (typePart.startsWith('role')) {
      const rid  = dataPart.replace(/[<@&>]/g, '').trim() || message.mentions.roles.first()?.id;
      const role = rid ? message.guild.roles.cache.get(rid) : null;
      if (!role) return message.reply('❌ Role not found. Mention it or paste its ID in the 4th segment.');
      itemData.type    = 'role';
      itemData.role_id = role.id;

    } else if (typePart.startsWith('channel')) {
      const cid     = dataPart.replace(/[<#>]/g, '').trim() || message.mentions.channels.first()?.id;
      const channel = cid ? message.guild.channels.cache.get(cid) : null;
      if (!channel) return message.reply('❌ Channel not found. Mention it or paste its ID in the 4th segment.');
      itemData.type       = 'channel';
      itemData.channel_id = channel.id;

    } else if (typePart.startsWith('theme')) {
      // ,additem Galaxy Theme | 8000 | theme galaxy | epic | Dazzling galaxy card
      const themeName = (typePart.replace(/^theme\s*/i, '').trim() || dataPart.trim()).toLowerCase();
      if (!themeName) return message.reply('❌ Provide a theme name. e.g. `,additem Galaxy Theme | 8000 | theme galaxy | epic`');
      if (!THEME_NAMES.includes(themeName)) {
        return message.reply(`❌ Unknown theme \`${themeName}\`. Available: ${THEME_NAMES.map(t => `\`${t}\``).join(', ')}`);
      }
      itemData.type       = 'theme';
      itemData.theme_name = themeName;

    } else {
      return message.reply('❌ Type must be `color`, `role`, `channel`, or `theme <name>`.\n' +
        '**Theme example:** `,additem Galaxy Theme | 8000 | theme galaxy | epic | Dazzling galaxy card`');
    }

    const newId    = db.addShopItem(itemData);
    const typeIcon = { color_role: '🎨', role: '🏷️', channel: '🔓', theme: '🎴' }[itemData.type] || '📦';

    const fields = [
      { name: 'ID',     value: `#${newId}`,             inline: true },
      { name: 'Name',   value: name,                    inline: true },
      { name: 'Price',  value: `${fmt(price)} credits`, inline: true },
      { name: 'Type',   value: itemData.type,           inline: true },
      { name: 'Rarity', value: RARITY_BADGE[rarity],   inline: true },
    ];
    if (itemData.color)      fields.push({ name: 'Color',  value: itemData.color,      inline: true });
    if (itemData.theme_name) fields.push({ name: 'Theme',  value: itemData.theme_name, inline: true });
    if (desc)                fields.push({ name: 'Description', value: desc,           inline: false });

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(RARITY_COLOR[rarity] || GREEN)
      .setTitle(`${typeIcon} Item Added to Shop`)
      .addFields(fields)
      .setFooter({ text: 'flux credits' })] });
  },
};

// ── ,removeitem <id> (admin) ──────────────────────────────────────────────────
const removeitem = {
  name: 'removeitem',
  aliases: ['delitem', 'deleteshopitem', 'removeshopitem'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
    }
    const id   = parseInt(args[0]);
    if (isNaN(id)) return message.reply('Usage: `,removeitem <id>`');
    const item = db.getShopItem(id);
    if (!item || item.guild_id !== message.guild.id) return message.reply('❌ Item not found.');
    db.removeShopItem(id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setDescription(`✅ Removed **${item.name}** (ID #${id}) from the shop.`)] });
  },
};

// ── ,givecr / ,takecr / ,setcr (admin) ───────────────────────────────────────
const givecr = {
  name: 'givecr',
  aliases: ['givecredits', 'addcredits', 'addcr'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
    }
    const target = message.mentions.users.first();
    const amt    = parseInt(args[1] ?? args[0]);
    if (!target || isNaN(amt) || amt <= 0) return message.reply('Usage: `,givecr @user <amount>`');
    db.addCredits(message.guild.id, target.id, amt);
    const after = db.getCredits(message.guild.id, target.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setDescription(`✅ Gave **${fmt(amt)} credits** to **${target.username}**.\nNew balance: **${fmt(after.amount)}**.`)] });
  },
};

const takecr = {
  name: 'takecr',
  aliases: ['takecredits', 'removecredits', 'removecr'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
    }
    const target = message.mentions.users.first();
    const amt    = parseInt(args[1] ?? args[0]);
    if (!target || isNaN(amt) || amt <= 0) return message.reply('Usage: `,takecr @user <amount>`');
    db.addCredits(message.guild.id, target.id, -amt);
    const after = db.getCredits(message.guild.id, target.id);
    await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
      .setDescription(`✅ Took **${fmt(amt)} credits** from **${target.username}**.\nNew balance: **${fmt(after.amount)}**.`)] });
  },
};

const setcr = {
  name: 'setcr',
  aliases: ['setcredits'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
    }
    const target = message.mentions.users.first();
    const amt    = parseInt(args[1] ?? args[0]);
    if (!target || isNaN(amt) || amt < 0) return message.reply('Usage: `,setcr @user <amount>`');
    db.setCreditsAmount(message.guild.id, target.id, amt);
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setDescription(`✅ Set **${target.username}**'s credits to **${fmt(amt)}**.`)] });
  },
};

// ── ,shopconfig (admin) ───────────────────────────────────────────────────────
const shopconfig = {
  name: 'shopconfig',
  aliases: ['creditconfig', 'crconfig', 'creditsconfig'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
    }

    const guildId = message.guild.id;
    const s       = db.getCreditSettings(guildId);
    const sub     = args[0]?.toLowerCase();

    if (sub === 'credits' || sub === 'rate') {
      const n = parseInt(args[1]);
      if (isNaN(n) || n < 0) return message.reply('Usage: `,shopconfig credits <amount>`');
      db.upsertCreditSettings(guildId, { credits_per_msg: n });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Credits per message set to **${n}**.`)] });
    }
    if (sub === 'cooldown' || sub === 'cd') {
      const n = parseInt(args[1]);
      if (isNaN(n) || n < 0) return message.reply('Usage: `,shopconfig cooldown <seconds>`');
      db.upsertCreditSettings(guildId, { cooldown_sec: n });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Credit cooldown set to **${n}s**.`)] });
    }
    if (sub === 'enable' || sub === 'on') {
      db.upsertCreditSettings(guildId, { enabled: 1 });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Credit earning enabled.')] });
    }
    if (sub === 'disable' || sub === 'off') {
      db.upsertCreditSettings(guildId, { enabled: 0 });
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⚠️ Credit earning disabled.')] });
    }

    // Show current config
    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('⚙️ Credit Shop Config')
      .addFields(
        { name: '💬 Credits/Message', value: `${s.credits_per_msg}`,        inline: true },
        { name: '⏱️ Cooldown',        value: `${s.cooldown_sec}s`,           inline: true },
        { name: '✅ Enabled',         value: s.enabled ? 'Yes' : 'No',       inline: true },
      )
      .setDescription('**Subcommands:** `credits <n>`, `cooldown <s>`, `enable`, `disable`')
      .setFooter({ text: 'flux credits' })] });
  },
};

// ── ,myrole ───────────────────────────────────────────────────────────────────
// ,myrole                        → show your roles / help
// ,myrole create <name> <#hex>   → pay credits and create a custom role
// ,myrole color [slot] <#hex>    → update color of a role slot
// ,myrole rename [slot] <name>   → rename a role slot
// ,myrole delete [slot]          → delete a role slot (no refund)
const myrole = {
  name: 'myrole',
  aliases: ['customrole', 'mycolor', 'rolecolor'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const s       = db.getCreditSettings(guildId);
    const sub     = args[0]?.toLowerCase();

    // ── View / help ──────────────────────────────────────────────────────────
    if (!sub || sub === 'view' || sub === 'list') {
      const roles = db.getUserCustomRoles(guildId, userId);
      const cr    = db.getCredits(guildId, userId);

      if (!roles.length) {
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(BLUE)
          .setTitle('🎨 Custom Roles')
          .setDescription(
            `You don't have any custom roles yet!\n\n` +
            `**Create one:**\n\`\`,myrole create <name> <#hex>\`\`\n\n` +
            `**Cost:** ${fmt(s.custom_role_cost)} credits\n` +
            `**Your balance:** ${fmt(cr.amount)} credits\n` +
            `**Max slots:** ${s.max_custom_roles}`,
          )
          .setFooter({ text: 'flux credits' })] });
      }

      const lines = roles.map(r => {
        const role = message.guild.roles.cache.get(r.role_id);
        return `**Slot ${r.slot}** — ${role ? role.toString() : `~~${r.name}~~ *(deleted)*`} \`${r.color}\``;
      });

      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('🎨 Your Custom Roles')
        .setDescription(lines.join('\n'))
        .addFields(
          { name: '💳 Balance',    value: `${fmt(cr.amount)} credits`,     inline: true },
          { name: '📝 Update cost', value: `${fmt(s.custom_role_update_cost || 0)} credits`, inline: true },
          { name: '🔧 Slots used', value: `${roles.length}/${s.max_custom_roles}`, inline: true },
        )
        .setFooter({ text: 'flux credits' })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ── Create ───────────────────────────────────────────────────────────────
    if (sub === 'create' || sub === 'make' || sub === 'new') {
      const hexArg  = args.find(a => /^#[0-9A-Fa-f]{6}$/.test(a));
      const nameArg = args.slice(1).filter(a => !/^#[0-9A-Fa-f]{6}$/.test(a)).join(' ').trim();

      if (!hexArg || !nameArg) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
          .setDescription('❌ Usage: `,myrole create <name> <#HEX>`\nExample: `,myrole create Crimson #FF0000`')] });
      }
      if (nameArg.length > 32) return message.reply('❌ Role name must be 32 characters or less.');

      const existingRoles = db.getUserCustomRoles(guildId, userId);
      if (existingRoles.length >= s.max_custom_roles) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
          .setDescription(`❌ You've used all **${s.max_custom_roles}** custom role slot${s.max_custom_roles !== 1 ? 's' : ''}.`)] });
      }

      const cost = s.custom_role_cost || 0;
      const cr   = db.getCredits(guildId, userId);
      if (cr.amount < cost) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
          .setDescription(`❌ Creating a custom role costs **${fmt(cost)} credits**.\nYou have **${fmt(cr.amount)}** — need **${fmt(cost - cr.amount)}** more.`)] });
      }

      // Find next free slot
      const usedSlots = new Set(existingRoles.map(r => r.slot));
      let slot = 1;
      while (usedSlots.has(slot)) slot++;

      const color = '#' + hexArg.slice(1).toUpperCase();
      if (cost > 0) db.spendCredits(guildId, userId, cost);

      try {
        const role = await message.guild.roles.create({
          name: nameArg,
          color: parseInt(color.slice(1), 16),
          permissions: 0n,
          hoist: false,
          mentionable: false,
          reason: `Custom role for ${message.author.tag}`,
        });

        // Position below bot's highest role so bot can always manage it
        const botTopPos = message.guild.members.me?.roles?.highest?.position ?? 999;
        await role.setPosition(Math.max(1, botTopPos - 1)).catch(() => {});

        db.addUserCustomRole(guildId, userId, role.id, nameArg, color, slot);
        await message.member.roles.add(role).catch(() => {});

        await message.reply({ embeds: [new EmbedBuilder()
          .setColor(parseInt(color.slice(1), 16))
          .setTitle('🎨 Custom Role Created!')
          .setDescription(`Your custom role ${role} has been created and applied!`)
          .addFields(
            { name: '🏷️ Name',  value: nameArg,                inline: true },
            { name: '🎨 Color', value: color,                  inline: true },
            { name: '🔢 Slot',  value: `${slot}`,              inline: true },
            ...(cost > 0 ? [{ name: '💳 Spent', value: `${fmt(cost)} credits`, inline: true }] : []),
          )
          .setFooter({ text: 'flux credits' })
          .setTimestamp()] });

      } catch (e) {
        if (cost > 0) db.refundCredits(guildId, userId, cost);
        await message.reply({ embeds: [new EmbedBuilder().setColor(RED)
          .setDescription(`❌ Failed to create role: ${e.message}. Refunded.`)] });
      }
      return;
    }

    // ── Update color ──────────────────────────────────────────────────────────
    if (sub === 'color' || sub === 'colour') {
      const hexArg = args.find(a => /^#[0-9A-Fa-f]{6}$/.test(a));
      if (!hexArg) return message.reply('❌ Usage: `,myrole color <#HEX>` or `,myrole color <slot> <#HEX>`');

      const slotArg = parseInt(args[1]);
      const slot    = !isNaN(slotArg) && slotArg >= 1 ? slotArg : 1;
      const row     = db.getUserCustomRole(guildId, userId, slot);

      if (!row) return message.reply(`❌ You don't have a custom role in slot ${slot}.`);

      const cost = s.custom_role_update_cost || 0;
      const cr   = db.getCredits(guildId, userId);
      if (cr.amount < cost) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
          .setDescription(`❌ Updating costs **${fmt(cost)} credits** — you have **${fmt(cr.amount)}**.`)] });
      }

      const color = '#' + hexArg.slice(1).toUpperCase();
      if (cost > 0) db.spendCredits(guildId, userId, cost);

      const role = message.guild.roles.cache.get(row.role_id);
      if (role) {
        await role.setColor(parseInt(color.slice(1), 16)).catch(() => {});
      }
      db.updateUserCustomRole(guildId, userId, slot, { color });

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(parseInt(color.slice(1), 16))
        .setDescription(`✅ Slot **${slot}** color updated to \`${color}\`!${cost > 0 ? ` (${fmt(cost)} credits spent)` : ''}`)] });
      return;
    }

    // ── Rename ────────────────────────────────────────────────────────────────
    if (sub === 'rename' || sub === 'name') {
      const slotArg = parseInt(args[1]);
      let slot      = 1;
      let nameStart = 1;
      if (!isNaN(slotArg) && slotArg >= 1) { slot = slotArg; nameStart = 2; }

      const newName = args.slice(nameStart).join(' ').trim();
      if (!newName) return message.reply('❌ Usage: `,myrole rename <name>` or `,myrole rename <slot> <name>`');
      if (newName.length > 32) return message.reply('❌ Role name must be 32 characters or less.');

      const row = db.getUserCustomRole(guildId, userId, slot);
      if (!row) return message.reply(`❌ You don't have a custom role in slot ${slot}.`);

      const cost = s.custom_role_update_cost || 0;
      const cr   = db.getCredits(guildId, userId);
      if (cr.amount < cost) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
          .setDescription(`❌ Renaming costs **${fmt(cost)} credits** — you have **${fmt(cr.amount)}**.`)] });
      }

      if (cost > 0) db.spendCredits(guildId, userId, cost);

      const role = message.guild.roles.cache.get(row.role_id);
      if (role) await role.setName(newName).catch(() => {});
      db.updateUserCustomRole(guildId, userId, slot, { name: newName });

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(GREEN)
        .setDescription(`✅ Slot **${slot}** renamed to **${newName}**!${cost > 0 ? ` (${fmt(cost)} credits spent)` : ''}`)] });
      return;
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    if (sub === 'delete' || sub === 'remove' || sub === 'del') {
      const slotArg = parseInt(args[1]);
      const slot    = !isNaN(slotArg) && slotArg >= 1 ? slotArg : 1;
      const row     = db.getUserCustomRole(guildId, userId, slot);

      if (!row) return message.reply(`❌ You don't have a custom role in slot ${slot}.`);

      const role = message.guild.roles.cache.get(row.role_id);
      if (role) await role.delete(`Custom role deleted by ${message.author.tag}`).catch(() => {});
      db.deleteUserCustomRole(guildId, userId, slot);

      await message.reply({ embeds: [new EmbedBuilder()
        .setColor(YELLOW)
        .setDescription(`🗑️ Custom role in slot **${slot}** has been deleted.`)] });
      return;
    }

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('🎨 ,myrole Help')
      .addFields(
        { name: 'Create', value: '`,myrole create <name> <#hex>`', inline: false },
        { name: 'Update Color', value: '`,myrole color [slot] <#hex>`', inline: false },
        { name: 'Rename', value: '`,myrole rename [slot] <name>`', inline: false },
        { name: 'Delete', value: '`,myrole delete [slot]`', inline: false },
        { name: 'View', value: '`,myrole`', inline: false },
      )
      .setFooter({ text: 'flux credits' })] });
  },
};

// ── ,creditsetup ──────────────────────────────────────────────────────────────
const creditsetup = {
  name: 'creditsetup',
  aliases: ['crsetup', 'setupcredits', 'earnsetup'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
    }

    const guildId = message.guild.id;
    const s       = db.getCreditSettings(guildId);
    const sub     = args[0]?.toLowerCase();

    const SETTINGS = {
      messages:   { key: 'credits_per_msg',        label: 'Credits per message',        emoji: '💬', default: 1   },
      cooldown:   { key: 'cooldown_sec',            label: 'Message cooldown (seconds)', emoji: '⏱️', default: 30  },
      invites:    { key: 'invite_credits',          label: 'Credits per invite',         emoji: '📨', default: 0   },
      voice:      { key: 'voice_credits',           label: 'Credits per VC minute',      emoji: '🎙️', default: 0   },
      rolecost:   { key: 'custom_role_cost',        label: 'Custom role creation cost',  emoji: '🎨', default: 800000 },
      updatecost: { key: 'custom_role_update_cost', label: 'Custom role update cost',    emoji: '✏️', default: 0   },
      slots:      { key: 'max_custom_roles',        label: 'Max custom role slots',      emoji: '🔢', default: 1   },
    };

    if (sub && SETTINGS[sub]) {
      const n = parseInt(args[1]);
      if (isNaN(n) || n < 0) return message.reply(`Usage: \`,creditsetup ${sub} <number>\``);
      db.upsertCreditSettings(guildId, { [SETTINGS[sub].key]: n });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ **${SETTINGS[sub].label}** set to **${n}**.`)] });
    }

    if (sub === 'enable' || sub === 'on') {
      db.upsertCreditSettings(guildId, { enabled: 1 });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ Credit earning **enabled**.')] });
    }
    if (sub === 'disable' || sub === 'off') {
      db.upsertCreditSettings(guildId, { enabled: 0 });
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⚠️ Credit earning **disabled**.')] });
    }

    // Show full setup panel
    const fields = Object.entries(SETTINGS).map(([subKey, cfg]) => ({
      name:   `${cfg.emoji} ${cfg.label}`,
      value:  `**${s[cfg.key] ?? cfg.default}**\n\`\`,creditsetup ${subKey} <n>\`\``,
      inline: true,
    }));
    fields.push({
      name:  '✅ Enabled',
      value: `**${s.enabled !== 0 ? 'Yes' : 'No'}**\n\`\`,creditsetup enable/disable\`\``,
      inline: true,
    });

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(GOLD)
      .setTitle('⚙️ Credit Earn Setup')
      .setDescription(
        '**Credits** are earned automatically. Configure how much each activity awards.\n' +
        'Set any value to **0** to disable that earn method.',
      )
      .addFields(fields)
      .setFooter({ text: 'flux credits' })
      .setTimestamp()] });
  },
};

// ── ,reseteco @user ───────────────────────────────────────────────────────────
const reseteco = {
  name: 'reseteco',
  aliases: ['resetcredits', 'resetbal', 'wipecredits'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
    }
    const target = message.mentions.users.first();
    if (!target) return message.reply('Usage: `,reseteco @user`');

    db.resetCredits(message.guild.id, target.id);

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(YELLOW)
      .setDescription(`🗑️ Reset **${target.username}**'s balance and total earned to **0**.`)] });
  },
};

// ── ,pointhelp ────────────────────────────────────────────────────────────────
const pointhelp = {
  name: 'pointhelp',
  aliases: ['creditshelp', 'crhelp', 'shophelp', 'pointshelp', 'credithelp'],
  async execute(message) {
    const s    = db.getCreditSettings(message.guild.id);
    const rate = s.credits_per_msg ?? 1;
    const cd   = s.cooldown_sec ?? 30;

    // Build earn description dynamically
    const earnParts = [`💬 **${rate} cr** per message (${cd}s cooldown)`];
    if (s.invite_credits) earnParts.push(`📨 **${s.invite_credits} cr** per invite`);
    if (s.voice_credits)  earnParts.push(`🎙️ **${s.voice_credits} cr** per VC minute`);

    const embeds = [
      // ── Page 1: user commands ──────────────────────────────────────────────
      new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: 'Credits & Shop — User Commands', iconURL: message.client.user.displayAvatarURL() })
        .setDescription(
          `**How to earn credits:**\n${earnParts.join('\n')}\n\n` +
          `Spend them in the shop, bid in auctions, or create custom roles.`
        )
        .addFields(
          {
            name: '💳 Balance',
            value: [
              '`,credits [@user]` — view your credits card',
              '`,creditlead` — top earners leaderboard',
            ].join('\n'),
            inline: false,
          },
          {
            name: '🛒 Shop',
            value: [
              '`,shop [page]` — browse all items for sale',
              '`,buy <id>` — purchase an item by ID',
              '`,inventory [@user]` — view owned items',
            ].join('\n'),
            inline: false,
          },
          {
            name: '🔨 Auctions',
            value: [
              '`,auction list` — see all active auctions',
              '`,auction info <id>` — detailed view + bid history',
              '`,bid <amount>` — place a bid (credits held in escrow)',
              '`,mybids` — see every auction you\'re bidding on',
              '',
              '*Bidding in the last 2 min extends the auction by 2 min.*',
              '*You\'re refunded instantly if someone outbids you.*',
            ].join('\n'),
            inline: false,
          },
          {
            name: '🎨 Custom Roles',
            value: [
              '`,myrole` — view your custom roles',
              '`,myrole create <name> <#hex>` — create a role (**' + fmt(s.custom_role_cost ?? 0) + ' cr**)',
              '`,myrole color [slot] <#hex>` — change the color',
              '`,myrole rename [slot] <name>` — rename it',
              '`,myrole delete [slot]` — delete it',
            ].join('\n'),
            inline: false,
          },
        )
        .setFooter({ text: 'Credits System • Page 1/2 — Admin commands on page 2' })
        .setTimestamp(),

      // ── Page 2: admin commands ─────────────────────────────────────────────
      new EmbedBuilder()
        .setColor(GOLD)
        .setAuthor({ name: 'Credits & Shop — Admin Commands', iconURL: message.client.user.displayAvatarURL() })
        .setDescription('These commands require **Manage Server** permission.')
        .addFields(
          {
            name: '🏪 Shop Management',
            value: [
              '`,additem Name | price | color #HEX` — add a color role item',
              '`,additem Name | price | role @role` — add an existing role item',
              '`,additem Name | price | channel #ch` — add channel access item',
              '`,removeitem <id>` — remove an item from the shop',
            ].join('\n'),
            inline: false,
          },
          {
            name: '🔨 Auction Management',
            value: [
              '`,auction create <item> | <start bid> | <duration>` — start an auction',
              '  Optional: `| <desc> | <image url> | <min increment>`',
              '  Duration examples: `30m`, `1h`, `6h`, `24h`, `3d`',
              '`,auction end <id>` — force-end an auction early',
              '`,auction cancel <id>` — cancel + refund highest bidder',
            ].join('\n'),
            inline: false,
          },
          {
            name: '💰 Credit Management',
            value: [
              '`,givecr @user <amount>` — give credits to a user',
              '`,takecr @user <amount>` — remove credits from a user',
              '`,setcr @user <amount>` — set a user\'s balance',
              '`,reseteco @user` — wipe balance + total earned to 0',
            ].join('\n'),
            inline: false,
          },
          {
            name: '⚙️ Configuration',
            value: [
              '`,creditsetup` — configure earn rates, VC credits, custom role costs',
              '  `messages <n>` `cooldown <s>` `invites <n>` `voice <n>`',
              '  `rolecost <n>` `updatecost <n>` `slots <n>` `enable/disable`',
            ].join('\n'),
            inline: false,
          },
        )
        .setFooter({ text: 'Credits System • Page 2/2' })
        .setTimestamp(),
    ];

    // Send page 1 with navigation buttons
    const { ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
    let page = 0;

    function row(p) {
      return new ARB().addComponents(
        new BB().setCustomId(`crhelp_prev_${message.author.id}`).setLabel('◀ Back').setStyle(BS.Secondary).setDisabled(p === 0),
        new BB().setCustomId(`crhelp_next_${message.author.id}`).setLabel('Next ▶').setStyle(BS.Secondary).setDisabled(p === embeds.length - 1),
      );
    }

    const sent = await message.reply({ embeds: [embeds[page]], components: [row(page)] });

    const col = sent.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id &&
        (i.customId === `crhelp_prev_${message.author.id}` || i.customId === `crhelp_next_${message.author.id}`),
      time: 120_000,
    });

    col.on('collect', async i => {
      if (i.customId === `crhelp_next_${message.author.id}`) page++;
      else page--;
      await i.update({ embeds: [embeds[page]], components: [row(page)] });
    });

    col.on('end', () => sent.edit({ components: [] }).catch(() => {}));
  },
};

// ── ,previewthemes ────────────────────────────────────────────────────────────
const previewthemes = {
  name: 'previewthemes',
  aliases: ['themepreviews', 'cardthemes', 'cardpreviews'],
  async execute(message) {
    const guildId   = message.guild.id;
    const items     = db.getShopItems(guildId).slice(0, 4);
    const data      = db.getCredits(guildId, message.author.id);
    const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });

    const loading = await message.reply({ embeds: [new EmbedBuilder().setColor(GOLD)
      .setDescription(`🎨 Generating **${THEME_NAMES.length}** card theme previews, one sec...`)] });

    const files = [];
    for (const theme of THEME_NAMES) {
      try {
        const buf = await generateThemedCard({
          username:    message.author.username,
          avatarUrl,
          balance:     data.amount,
          totalEarned: data.total_earned,
          shopItems:   items,
          theme,
        });
        files.push(new AttachmentBuilder(buf, { name: `theme_${theme}.png` }));
      } catch (e) {
        console.error(`[previewthemes:${theme}]`, e);
      }
    }

    await loading.delete().catch(() => {});
    await message.reply({
      content: `🎨 **Card Theme Previews** — buy them with \`,buytheme <name>\`\n` +
               THEME_NAMES.map((t, i) => `**${i+1}.** \`${t}\``).join(' • '),
      files,
    });
  },
};

// ── ,themes ───────────────────────────────────────────────────────────────────
// Lists all 8 themes, their prices (guild-specific), and which ones you own.
const themes = {
  name: 'themes',
  aliases: ['cardthemelist', 'themelist', 'mythemes'],
  async execute(message) {
    const guildId = message.guild.id;
    const userId  = message.author.id;

    const owned     = db.getUserOwnedThemes(guildId, userId);
    const equipped  = db.getUserTheme(guildId, userId);
    const priceRows = db.getAllThemePrices(guildId);
    const priceMap  = Object.fromEntries(priceRows.map(r => [r.theme, r.price]));

    const DISPLAY = {
      holographic: '✦ Holographic',
      city:        '🌃 Neon City',
      sakura:      '🌸 Sakura',
      royal:       '♛ Royal',
      glass:       '💠 Glass',
      galaxy:      '🌌 Galaxy',
      academia:    '📚 Academia',
      paper:       '📜 Paper',
    };

    const lines = THEME_NAMES.map(t => {
      const price   = priceMap[t] ?? 5000;
      const own     = owned.includes(t) ? '✅' : '❌';
      const equip   = equipped === t ? ' **(equipped)**' : '';
      return `${own} **${DISPLAY[t] || t}** — \`${fmt(price)}\` cr${equip}`;
    });

    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle('🎨 Card Themes')
      .setDescription(lines.join('\n'))
      .addFields(
        { name: 'How to buy',   value: '`,buytheme <name>`', inline: true },
        { name: 'How to equip', value: '`,cardtheme <name>`', inline: true },
      )
      .setFooter({ text: 'Use ,previewthemes to see how each looks' });

    await message.reply({ embeds: [embed] });
  },
};

// ── ,buytheme <name> ──────────────────────────────────────────────────────────
const buytheme = {
  name: 'buytheme',
  aliases: ['purchasetheme', 'gettheme'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const input   = args[0]?.toLowerCase();

    if (!input) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ Usage: \`,buytheme <name>\`\nThemes: ${THEME_NAMES.join(', ')}`)] });
    }

    // Fuzzy match — "halographic" → "holographic", "academy" → "academia"
    const ALIASES_MAP = { halographic: 'holographic', neon: 'city', 'neon city': 'city', academy: 'academia' };
    const theme = ALIASES_MAP[input] || THEME_NAMES.find(t => t === input || t.startsWith(input)) || null;

    if (!theme) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ Unknown theme \`${input}\`.\nAvailable: ${THEME_NAMES.map(t => `\`${t}\``).join(', ')}`)] });
    }

    if (db.hasTheme(guildId, userId, theme)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
        .setDescription(`✅ You already own the **${theme}** theme! Equip it with \`,cardtheme ${theme}\`.`)] });
    }

    const price = db.getThemePrice(guildId, theme);
    const data  = db.getCredits(guildId, userId);

    if (data.amount < price) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ You need **${fmt(price)}** credits but only have **${fmt(data.amount)}**.`)] });
    }

    db.spendCredits(guildId, userId, price);
    db.addOwnedTheme(guildId, userId, theme);
    db.setEquippedTheme(guildId, userId, theme);

    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setTitle('🎨 Theme Purchased!')
      .setDescription(`You bought and equipped the **${theme}** card theme for **${fmt(price)}** credits.\nYour credits card will now use this theme!`)
      .addFields({ name: 'Remaining balance', value: `**${fmt(data.amount - price)}** credits`, inline: true })] });
  },
};

// ── ,cardtheme [name] ─────────────────────────────────────────────────────────
// With name: equips an owned theme (or "none" to remove)
// Without name: shows current equipped theme
const cardtheme = {
  name: 'cardtheme',
  aliases: ['settheme', 'equiptheme', 'mytheme'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;
    const input   = args[0]?.toLowerCase();

    if (!input) {
      const equipped = db.getUserTheme(guildId, userId);
      const owned    = db.getUserOwnedThemes(guildId, userId);
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setTitle('🎨 Your Card Theme')
        .addFields(
          { name: 'Equipped', value: equipped ? `\`${equipped}\`` : 'None (default card)', inline: true },
          { name: 'Owned',    value: owned.length ? owned.map(t => `\`${t}\``).join(', ') : 'None', inline: true },
        )
        .setFooter({ text: 'Use ,buytheme <name> to purchase themes' })] });
    }

    if (input === 'none' || input === 'default' || input === 'remove') {
      db.setEquippedTheme(guildId, userId, null);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription('✅ Removed your equipped theme. Your credits card will show the default style.')] });
    }

    const ALIASES_MAP = { halographic: 'holographic', neon: 'city', 'neon city': 'city', academy: 'academia' };
    const theme = ALIASES_MAP[input] || THEME_NAMES.find(t => t === input || t.startsWith(input)) || null;

    if (!theme) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ Unknown theme \`${input}\`.\nAvailable: ${THEME_NAMES.map(t => `\`${t}\``).join(', ')}`)] });
    }

    if (!db.hasTheme(guildId, userId, theme)) {
      const price = db.getThemePrice(guildId, theme);
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ You don't own the **${theme}** theme. Buy it with \`,buytheme ${theme}\` for **${fmt(price)}** credits.`)] });
    }

    db.setEquippedTheme(guildId, userId, theme);
    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setDescription(`✅ Equipped the **${theme}** card theme! Your \`,credits\` card will now use it.`)] });
  },
};

// ── ,givetheme @user <name> ───────────────────────────────────────────────────
// Admin: give a theme to a user for free
const givetheme = {
  name: 'givetheme',
  aliases: ['addtheme'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription('❌ You need **Manage Server** permission to use this.')] });
    }

    const guildId = message.guild.id;
    const target  = message.mentions.users.first();
    const input   = args[1]?.toLowerCase() || args[0]?.toLowerCase();

    if (!target || !input || message.mentions.users.size === 0) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription('❌ Usage: `,givetheme @user <theme>`')] });
    }

    const ALIASES_MAP = { halographic: 'holographic', neon: 'city', academy: 'academia' };
    const theme = ALIASES_MAP[input] || THEME_NAMES.find(t => t === input || t.startsWith(input)) || null;

    if (!theme) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ Unknown theme \`${input}\`. Available: ${THEME_NAMES.join(', ')}`)] });
    }

    db.addOwnedTheme(guildId, target.id, theme);

    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setDescription(`✅ Gave the **${theme}** card theme to ${target.toString()}. They can equip it with \`,cardtheme ${theme}\`.`)] });
  },
};

// ── ,setthemeprice <name> <price> ─────────────────────────────────────────────
// Admin: set the price for a theme in this guild
const setthemeprice = {
  name: 'setthemeprice',
  aliases: ['themeprice', 'themesetprice'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription('❌ You need **Manage Server** permission to use this.')] });
    }

    const guildId = message.guild.id;
    const input   = args[0]?.toLowerCase();
    const price   = parseInt(args[1]);

    if (!input || isNaN(price) || price < 0) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription('❌ Usage: `,setthemeprice <theme> <price>`\nExample: `,setthemeprice galaxy 8000`')] });
    }

    const ALIASES_MAP = { halographic: 'holographic', neon: 'city', academy: 'academia' };
    const theme = ALIASES_MAP[input] || THEME_NAMES.find(t => t === input || t.startsWith(input)) || null;

    if (!theme) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ Unknown theme \`${input}\`. Available: ${THEME_NAMES.join(', ')}`)] });
    }

    db.setThemePrice(guildId, theme, price);

    await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setDescription(`✅ Set **${theme}** theme price to **${fmt(price)}** credits.`)] });
  },
};

// ── ,dailyshop ────────────────────────────────────────────────────────────────
// Personalised 4-item shop that resets at midnight UTC, seeded per user+date.
const dailyshop = {
  name: 'dailyshop',
  aliases: ['daily', 'dshop'],
  async execute(message) {
    const guildId = message.guild.id;
    const userId  = message.author.id;

    const itemIds = db.generateUserDailyShop(guildId, userId);
    const items   = db.getShopItemsByIds(itemIds);
    const userCr  = db.getCredits(guildId, userId);
    const resets  = _fmtMs(_msTilMidnightUTC());

    if (!items.length) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
        .setDescription('🛒 No items in the shop pool yet! Admins can add items with `,additem`.')] });
    }

    const typeIcon = { color_role: '🎨', role: '🏷️', channel: '🔓', theme: '🎴' };

    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle('🌅 Your Daily Shop')
      .setDescription(`💳 Balance: **${fmt(userCr.amount)} credits** • Resets in **${resets}**\nBuy with \`,buy <id>\``)
      .setFooter({ text: 'Your shop is unique • refreshes midnight UTC • flux credits' })
      .setTimestamp();

    for (const item of items) {
      const icon    = typeIcon[item.type] || '📦';
      const badge   = RARITY_BADGE[item.rarity] || '⬜ Common';
      const stock   = item.stock === -1 ? '∞' : `${Math.max(0, item.stock - item.sold)} left`;
      const canBuy  = userCr.amount >= item.price ? '✅' : '❌';
      const owned   = (item.type === 'theme' && db.hasTheme(guildId, userId, item.theme_name))
                   || ((item.type === 'color_role' || item.type === 'role') && db.getUserPurchase(guildId, userId, item.id))
                   ? ' *(owned)*' : '';
      embed.addFields({
        name:  `${icon} #${item.id} — ${item.name}${owned}`,
        value: `${item.description ? `*${item.description}*\n` : ''}${badge} • **${fmt(item.price)} cr** • ${stock} ${canBuy}`,
        inline: false,
      });
    }

    await message.reply({ embeds: [embed] });
  },
};

// ── ,weeklyshop ───────────────────────────────────────────────────────────────
// Personalised 6-item shop that resets each Monday, seeded per user+week.
const weeklyshop = {
  name: 'weeklyshop',
  aliases: ['weekly', 'wshop'],
  async execute(message) {
    const guildId = message.guild.id;
    const userId  = message.author.id;

    const itemIds = db.generateUserWeeklyShop(guildId, userId);
    const items   = db.getShopItemsByIds(itemIds);
    const userCr  = db.getCredits(guildId, userId);
    const resets  = _fmtMs(_msTilNextMonday());

    if (!items.length) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
        .setDescription('🛒 No items in the shop pool yet! Admins can add items with `,additem`.')] });
    }

    const typeIcon = { color_role: '🎨', role: '🏷️', channel: '🔓', theme: '🎴' };

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🗓️ Your Weekly Shop')
      .setDescription(`💳 Balance: **${fmt(userCr.amount)} credits** • Resets in **${resets}**\nBuy with \`,buy <id>\``)
      .setFooter({ text: 'Your shop is unique • refreshes every Monday UTC • flux credits' })
      .setTimestamp();

    for (const item of items) {
      const icon    = typeIcon[item.type] || '📦';
      const badge   = RARITY_BADGE[item.rarity] || '⬜ Common';
      const stock   = item.stock === -1 ? '∞' : `${Math.max(0, item.stock - item.sold)} left`;
      const canBuy  = userCr.amount >= item.price ? '✅' : '❌';
      const owned   = (item.type === 'theme' && db.hasTheme(guildId, userId, item.theme_name))
                   || ((item.type === 'color_role' || item.type === 'role') && db.getUserPurchase(guildId, userId, item.id))
                   ? ' *(owned)*' : '';
      embed.addFields({
        name:  `${icon} #${item.id} — ${item.name}${owned}`,
        value: `${item.description ? `*${item.description}*\n` : ''}${badge} • **${fmt(item.price)} cr** • ${stock} ${canBuy}`,
        inline: false,
      });
    }

    await message.reply({ embeds: [embed] });
  },
};

module.exports = [
  credits, shop, buy, inventory, creditlead,
  additem, removeitem, givecr, takecr, setcr, reseteco, shopconfig,
  myrole, creditsetup, pointhelp, previewthemes,
  themes, buytheme, cardtheme, givetheme, setthemeprice,
  dailyshop, weeklyshop,
];
