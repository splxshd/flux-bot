'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const GOLD   = '#F1C40F';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const BLUE   = '#5865F2';
const GREY   = '#2B2D31';
const OWNER_ID = '1467527738091896986';

function isAdmin(message) {
  return message.author.id === OWNER_ID ||
    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.floor(n));
}

// Parse "1h30m", "2h", "30m", "3d", etc → seconds
function parseDuration(str) {
  if (!str) return null;
  let total = 0;
  const matches = str.toLowerCase().matchAll(/(\d+)\s*(d|h|m|s)/g);
  for (const [, n, unit] of matches) {
    const v = parseInt(n);
    if (unit === 'd') total += v * 86400;
    else if (unit === 'h') total += v * 3600;
    else if (unit === 'm') total += v * 60;
    else if (unit === 's') total += v;
  }
  return total > 0 ? total : null;
}

// Time remaining string
function timeLeft(endsAt) {
  const secs = endsAt - Math.floor(Date.now() / 1000);
  if (secs <= 0) return 'Ended';
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Build the live auction embed
function buildAuctionEmbed(auction, bids = []) {
  const endsAtUnix = Math.floor(auction.ends_at);
  const isEnding   = (auction.ends_at - Math.floor(Date.now() / 1000)) <= 120;
  const color      = auction.ended || auction.cancelled ? GREY
                   : isEnding                           ? RED
                   :                                      GOLD;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🔨 Auction #${auction.id} — ${auction.item}`)
    .setTimestamp();

  if (auction.image_url) embed.setThumbnail(auction.image_url);

  if (auction.description) {
    embed.setDescription(auction.description);
  }

  const minNext = auction.current_bidder
    ? auction.current_bid + auction.min_increment
    : auction.starting_bid;

  embed.addFields(
    {
      name: '💰 Current Bid',
      value: auction.current_bidder
        ? `**${fmt(auction.current_bid)} cr** by <@${auction.current_bidder}>`
        : `No bids yet — starting at **${fmt(auction.starting_bid)} cr**`,
      inline: false,
    },
    {
      name: '📋 Details',
      value: [
        `**Starting Bid:** ${fmt(auction.starting_bid)} cr`,
        `**Min Increment:** ${fmt(auction.min_increment)} cr`,
        `**Min Next Bid:** ${fmt(minNext)} cr`,
      ].join('\n'),
      inline: true,
    },
    {
      name: auction.ended || auction.cancelled ? '🏁 Status' : '⏳ Time Left',
      value: auction.cancelled
        ? '❌ Cancelled'
        : auction.ended
          ? '✅ Ended'
          : `**${timeLeft(auction.ends_at)}**\n<t:${endsAtUnix}:R>`,
      inline: true,
    },
  );

  if (bids.length > 0) {
    const history = bids.slice(0, 5).map((b, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▫️';
      return `${medal} <@${b.user_id}> — **${fmt(b.amount)} cr**`;
    }).join('\n');
    embed.addFields({ name: '📜 Recent Bids', value: history, inline: false });
  }

  embed.setFooter({ text: `Auction ID: ${auction.id} • Use ,bid <amount> in this channel` });
  return embed;
}

// ── ,auction ──────────────────────────────────────────────────────────────────
const auction = {
  name: 'auction',
  aliases: ['auc'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const sub     = args[0]?.toLowerCase();

    // ── list ────────────────────────────────────────────────────────────────
    if (!sub || sub === 'list') {
      const active = db.getActiveAuctions(guildId);
      if (!active.length) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
          .setDescription('📭 No active auctions right now.')] });
      }
      const embed = new EmbedBuilder()
        .setColor(GOLD)
        .setTitle('🔨 Active Auctions')
        .setDescription(active.map(a => {
          const bid = a.current_bidder
            ? `**${fmt(a.current_bid)} cr** by <@${a.current_bidder}>`
            : `No bids — starts at **${fmt(a.starting_bid)} cr**`;
          return `**#${a.id} — ${a.item}**\n${bid} • ⏳ ${timeLeft(a.ends_at)} left\n<#${a.channel_id}>`;
        }).join('\n\n'))
        .setFooter({ text: `${active.length} active auction${active.length !== 1 ? 's' : ''}` })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ── info ────────────────────────────────────────────────────────────────
    if (sub === 'info') {
      const id = parseInt(args[1]);
      if (isNaN(id)) return message.reply('❌ Usage: `,auction info <id>`');
      const a = db.getAuction(id);
      if (!a || a.guild_id !== guildId) return message.reply('❌ Auction not found.');
      const bids = db.getAuctionBids(id, 5);
      return message.reply({ embeds: [buildAuctionEmbed(a, bids)] });
    }

    // ── create ───────────────────────────────────────────────────────────────
    if (sub === 'create') {
      if (!isAdmin(message)) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });

      // ,auction create item | startbid | duration | [desc] | [image_url] | [min_increment]
      const raw = args.slice(1).join(' ');
      const parts = raw.split('|').map(p => p.trim());
      if (parts.length < 3) {
        return message.reply([
          '❌ Usage: `,auction create <item> | <starting bid> | <duration> | [description] | [image url] | [min increment]`',
          'Examples:',
          '• `,auction create Rare Sword | 500 | 24h`',
          '• `,auction create VIP Role | 1000 | 6h | Permanent VIP role | | 50`',
          'Duration: `30m`, `1h`, `6h`, `12h`, `24h`, `3d` etc.',
        ].join('\n'));
      }

      const item        = parts[0];
      const startingBid = parseInt(parts[1].replace(/,/g, ''));
      const duration    = parseDuration(parts[2]);
      const description = parts[3] || '';
      const imageUrl    = parts[4] || '';
      const minInc      = parseInt(parts[5]) || 1;

      if (!item)            return message.reply('❌ Item name cannot be empty.');
      if (isNaN(startingBid) || startingBid < 1) return message.reply('❌ Starting bid must be a positive number.');
      if (!duration)        return message.reply('❌ Invalid duration. Use e.g. `1h`, `30m`, `2h30m`, `3d`.');
      if (duration > 7 * 86400) return message.reply('❌ Auction cannot last longer than 7 days.');
      if (duration < 60)    return message.reply('❌ Auction must last at least 1 minute.');

      const endsAt = Math.floor(Date.now() / 1000) + duration;
      const a = db.createAuction(guildId, message.channel.id, item, description, imageUrl, startingBid, minInc, endsAt, message.author.id);

      const embed = buildAuctionEmbed(a, []);
      const sent  = await message.channel.send({ embeds: [embed] });
      db.setAuctionMessageId(a.id, sent.id);

      if (message.channel.id !== message.channel.id || message.id !== sent.id) {
        await message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
          .setDescription(`✅ Auction **#${a.id}** created! Ends <t:${endsAt}:R>.`)] }).catch(() => {});
      }
      return;
    }

    // ── end (admin force-end) ────────────────────────────────────────────────
    if (sub === 'end') {
      if (!isAdmin(message)) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
      const id = parseInt(args[1]);
      if (isNaN(id)) return message.reply('❌ Usage: `,auction end <id>`');
      const a = db.getAuction(id);
      if (!a || a.guild_id !== guildId) return message.reply('❌ Auction not found.');
      if (a.ended || a.cancelled) return message.reply('❌ Auction is already over.');

      // Force it to "end now" by setting ends_at to the past — cron will pick it up
      db.extendAuction(id, Math.floor(Date.now() / 1000) - 1);
      await finaliseAuction(a, message.client);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Auction **#${id}** ended.`)] });
    }

    // ── cancel ───────────────────────────────────────────────────────────────
    if (sub === 'cancel') {
      if (!isAdmin(message)) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
      const id = parseInt(args[1]);
      if (isNaN(id)) return message.reply('❌ Usage: `,auction cancel <id>`');
      const a = db.getAuction(id);
      if (!a || a.guild_id !== guildId) return message.reply('❌ Auction not found.');
      if (a.ended || a.cancelled) return message.reply('❌ Auction is already over.');

      // Refund current highest bidder
      if (a.current_bidder) {
        db.refundCredits(guildId, a.current_bidder, a.current_bid);
      }
      db.cancelAuction(id);

      // Update embed
      const ch = message.client.channels.cache.get(a.channel_id);
      if (ch && a.message_id) {
        const msg = await ch.messages.fetch(a.message_id).catch(() => null);
        if (msg) {
          const updated = db.getAuction(id);
          await msg.edit({ embeds: [buildAuctionEmbed(updated, [])] }).catch(() => {});
        }
      }

      return message.reply({ embeds: [new EmbedBuilder().setColor(GOLD)
        .setDescription(`⚠️ Auction **#${id}** cancelled.${a.current_bidder ? ` Refunded **${fmt(a.current_bid)} cr** to <@${a.current_bidder}>.` : ''}`)] });
    }

    return message.reply('❌ Unknown subcommand. Use `create`, `list`, `info`, `end`, or `cancel`.');
  },
};

// ── ,bid <amount> ─────────────────────────────────────────────────────────────
const bid = {
  name: 'bid',
  aliases: [],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;

    const amount = parseInt(args[0]?.replace(/,/g, ''));
    if (isNaN(amount) || amount < 1) {
      return message.reply('❌ Usage: `,bid <amount>` — e.g. `,bid 500`');
    }

    // Find active auction in this channel
    const active = db.getActiveAuctions(guildId).filter(a => a.channel_id === message.channel.id);
    if (!active.length) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription('❌ No active auction in this channel.')] });
    }

    const auction = active[0]; // most imminent
    const now     = Math.floor(Date.now() / 1000);

    // Must beat current bid by min_increment
    const minBid = auction.current_bidder
      ? auction.current_bid + auction.min_increment
      : auction.starting_bid;

    if (amount < minBid) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ Bid too low! Minimum bid is **${fmt(minBid)} cr**.`)] });
    }

    // Can't outbid yourself
    if (auction.current_bidder === userId) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription('❌ You are already the highest bidder!')] });
    }

    // Check balance
    const credits = db.getCredits(guildId, userId);
    if (credits.amount < amount) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription(`❌ Insufficient credits. You have **${fmt(credits.amount)} cr** but need **${fmt(amount)} cr**.`)] });
    }

    // Deduct credits from bidder
    db.spendCredits(guildId, userId, amount);

    // Refund previous highest bidder
    const prev = db.placeBid(auction.id, guildId, userId, amount);
    if (prev && prev.userId && prev.userId !== userId) {
      db.refundCredits(guildId, prev.userId, prev.amount);
      // DM outbid notification
      message.client.users.fetch(prev.userId).then(u =>
        u.send(`🔔 You were outbid on **${auction.item}** (Auction #${auction.id}) in **${message.guild.name}**!\nNew highest bid: **${fmt(amount)} cr** — use \`,bid\` to re-enter.`).catch(() => {}),
      ).catch(() => {});
    }

    // Snipe protection: if bid placed in last 2 minutes, extend by 2 minutes
    const refreshed = db.getAuction(auction.id);
    const secsLeft  = refreshed.ends_at - now;
    if (secsLeft <= 120) {
      db.extendAuction(auction.id, refreshed.ends_at + 120);
      await message.channel.send({ embeds: [new EmbedBuilder().setColor(GOLD)
        .setDescription(`⚡ **Snipe protection!** Auction extended by **2 minutes**.`)] });
    }

    // Update the live embed
    const latest = db.getAuction(auction.id);
    const bids   = db.getAuctionBids(auction.id, 5);
    const ch     = message.client.channels.cache.get(auction.channel_id);
    if (ch && auction.message_id) {
      const aMsg = await ch.messages.fetch(auction.message_id).catch(() => null);
      if (aMsg) await aMsg.edit({ embeds: [buildAuctionEmbed(latest, bids)] }).catch(() => {});
    }

    const newBalance = db.getCredits(guildId, userId).amount;
    await message.reply({ embeds: [new EmbedBuilder()
      .setColor(GREEN)
      .setTitle('✅ Bid Placed!')
      .addFields(
        { name: '🔨 Item',        value: auction.item,               inline: true },
        { name: '💰 Your Bid',    value: `**${fmt(amount)} cr**`,    inline: true },
        { name: '👛 Balance',     value: `${fmt(newBalance)} cr`,    inline: true },
        { name: '⏳ Time Left',   value: timeLeft(latest.ends_at),   inline: true },
        { name: '📋 Min Next Bid',value: `${fmt(amount + latest.min_increment)} cr`, inline: true },
      )
      .setFooter({ text: `Auction #${auction.id} • You'll be refunded if outbid` })
      .setTimestamp()] });
  },
};

// ── ,mybids ───────────────────────────────────────────────────────────────────
const mybids = {
  name: 'mybids',
  aliases: ['mybid'],
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId  = message.author.id;

    const bids = db.getUserActiveBids(guildId, userId);
    if (!bids.length) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setDescription('📭 You have no active bids right now.')] });
    }

    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle(`🔨 Your Active Bids`)
      .setDescription(bids.map(b => {
        const isWinning = b.current_bidder === userId;
        const icon = isWinning ? '🥇' : '❌';
        const status = isWinning ? '**Winning**' : `Outbid — current: **${fmt(b.current_bid)} cr**`;
        return `${icon} **#${b.id} — ${b.item}**\nYour bid: **${fmt(b.my_bid)} cr** • ${status}\n⏳ ${timeLeft(b.ends_at)} left • <#${b.channel_id}>`;
      }).join('\n\n'))
      .setFooter({ text: `${bids.length} active bid${bids.length !== 1 ? 's' : ''}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

// ── Finalise (called by cron + ,auction end) ──────────────────────────────────
async function finaliseAuction(auction, client) {
  db.endAuction(auction.id);

  const ch = client.channels.cache.get(auction.channel_id);
  const latest = db.getAuction(auction.id);
  const bids   = db.getAuctionBids(auction.id, 5);

  // Update the live embed to show ended state
  if (ch && auction.message_id) {
    const aMsg = await ch.messages.fetch(auction.message_id).catch(() => null);
    if (aMsg) await aMsg.edit({ embeds: [buildAuctionEmbed(latest, bids)] }).catch(() => {});
  }

  if (!ch) return;

  if (latest.current_bidder) {
    // Winner announcement
    const embed = new EmbedBuilder()
      .setColor(GOLD)
      .setTitle('🎉 Auction Ended!')
      .setDescription(`**${auction.item}** has been won!`)
      .addFields(
        { name: '🏆 Winner',   value: `<@${latest.current_bidder}>`, inline: true },
        { name: '💰 Final Bid', value: `**${fmt(latest.current_bid)} cr**`, inline: true },
        { name: '🔨 Auction',   value: `#${auction.id}`,             inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Credits already deducted from winner's balance` });

    if (auction.image_url) embed.setThumbnail(auction.image_url);
    await ch.send({ content: `<@${latest.current_bidder}>`, embeds: [embed] });

    // DM winner
    client.users.fetch(latest.current_bidder).then(u =>
      u.send(`🎉 You won **${auction.item}** in **${ch.guild?.name}**! Final price: **${fmt(latest.current_bid)} cr**. Contact a staff member to claim your item.`).catch(() => {}),
    ).catch(() => {});
  } else {
    // No bids
    await ch.send({ embeds: [new EmbedBuilder()
      .setColor(GREY)
      .setTitle('🔨 Auction Ended — No Winner')
      .setDescription(`**${auction.item}** received no bids and has expired.`)
      .setTimestamp()
      .setFooter({ text: `Auction #${auction.id}` })] });
  }
}

module.exports = { commands: [auction, bid, mybids], finaliseAuction };
