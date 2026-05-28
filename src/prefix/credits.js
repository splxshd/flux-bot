'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const BLUE   = '#5865F2';
const GOLD   = '#F1C40F';
const OWNER_ID = '1467527738091896986';

const ITEMS_PER_PAGE = 5;

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

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${target.username}'s Credits`, iconURL: target.displayAvatarURL({ size: 64 }) })
      .addFields(
        { name: '💳 Balance',     value: `**${fmt(data.amount)}** credits`,       inline: true },
        { name: '📈 Total Earned', value: `**${fmt(data.total_earned)}** credits`, inline: true },
        { name: '💬 Earn Rate',   value: `${s.credits_per_msg} per message`,       inline: true },
      )
      .setFooter({ text: 'flux credits • earn by chatting' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
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

    // Prevent duplicate role purchases
    if (item.type === 'color_role' || item.type === 'role') {
      if (db.getUserPurchase(guildId, userId, item.id)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
          .setDescription(`⚠️ You already own **${item.name}**!`)] });
      }
    }

    // Deduct + record
    db.spendCredits(guildId, userId, item.price);
    db.incrementItemSold(item.id);
    db.addUserPurchase(guildId, userId, item.id);

    try {
      if (item.type === 'color_role') {
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

    const typePart = parts[2].toLowerCase();
    const dataPart = parts[3] || '';
    const desc     = parts[4] || '';
    const guildId  = message.guild.id;
    let itemData   = { guild_id: guildId, name, price, description: desc, active: 1, stock: -1, sold: 0 };

    if (typePart.startsWith('color')) {
      const combined  = parts[2] + ' ' + dataPart;
      const hexMatch  = combined.match(/#([0-9A-Fa-f]{6})/);
      if (!hexMatch) return message.reply('❌ Provide a hex color like `#FF5733`.');
      const color     = '#' + hexMatch[1].toUpperCase();
      const afterHex  = combined.replace(/#[0-9A-Fa-f]{6}/i, '').replace(/^color\s*/i, '').trim();
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

    } else {
      return message.reply('❌ Type must be `color`, `role`, or `channel`.');
    }

    const newId    = db.addShopItem(itemData);
    const typeIcon = itemData.type === 'color_role' ? '🎨' : itemData.type === 'role' ? '🏷️' : '🔓';

    const fields = [
      { name: 'ID',    value: `#${newId}`,           inline: true },
      { name: 'Name',  value: name,                  inline: true },
      { name: 'Price', value: `${fmt(price)} credits`, inline: true },
      { name: 'Type',  value: itemData.type,         inline: true },
    ];
    if (itemData.color)    fields.push({ name: 'Color', value: itemData.color, inline: true });
    if (desc)              fields.push({ name: 'Description', value: desc, inline: false });

    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(GREEN)
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

module.exports = [
  credits, shop, buy, inventory, creditlead,
  additem, removeitem, givecr, takecr, setcr, shopconfig,
];
