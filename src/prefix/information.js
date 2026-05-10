'use strict';

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChannelType } = require('discord.js');

const BLUE   = '#5865F2';
const PINK   = '#ff6b9d';
const GREEN  = '#57F287';
const YELLOW = '#FEE75C';
const RED    = '#ED4245';
const PURPLE = '#9B59B6';
const CYAN   = '#00FFFF';

function fmtDate(d) {
  return `<t:${Math.floor(d.getTime() / 1000)}:F>`;
}
function fmtRel(d) {
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}

// ── ,userinfo ────────────────────────────────────────────────────────────────
const userinfo = {
  name: 'userinfo',
  aliases: ['user', 'ui', 'whois'],
  async execute(message, args) {
    const target = message.mentions.users.first()
      || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null)
      || message.author;
    const member = message.guild.members.cache.get(target.id)
      || await message.guild.members.fetch(target.id).catch(() => null);

    const roles = member
      ? [...member.roles.cache.values()].filter(r => r.id !== message.guild.id).sort((a, b) => b.position - a.position)
      : [];

    const embed = new EmbedBuilder()
      .setColor(member?.displayHexColor || BLUE)
      .setAuthor({ name: `${target.username} — User Info`, iconURL: target.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: '👤 Username',    value: `\`${target.username}\``, inline: true },
        { name: '🆔 User ID',     value: `\`${target.id}\``,       inline: true },
        { name: '🤖 Bot',         value: target.bot ? 'Yes' : 'No', inline: true },
        { name: '📅 Created',     value: `${fmtDate(target.createdAt)}\n${fmtRel(target.createdAt)}`, inline: false },
      );

    if (member) {
      embed.addFields(
        { name: '📥 Joined Server', value: `${fmtDate(member.joinedAt)}\n${fmtRel(member.joinedAt)}`, inline: false },
        { name: `🎭 Roles (${roles.length})`, value: roles.length ? roles.slice(0, 10).map(r => `<@&${r.id}>`).join(' ') + (roles.length > 10 ? ` +${roles.length - 10} more` : '') : 'None', inline: false },
        { name: '💬 Nickname', value: member.nickname || 'None', inline: true },
        { name: '⚡ Boost', value: member.premiumSince ? fmtDate(member.premiumSince) : 'Not boosting', inline: true },
      );
    }
    embed.setFooter({ text: `flux bot • Requested by ${message.author.username}` }).setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,serverinfo ──────────────────────────────────────────────────────────────
const serverinfo = {
  name: 'serverinfo',
  aliases: ['si', 'guildinfo', 'gi'],
  async execute(message) {
    const g = message.guild;
    await g.members.fetch().catch(() => {});
    const total   = g.memberCount;
    const bots    = g.members.cache.filter(m => m.user.bot).size;
    const humans  = total - bots;
    const online  = g.members.cache.filter(m => m.presence?.status === 'online').size;

    const textCh  = g.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voiceCh = g.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const cats    = g.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;

    const verif = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Very High' };

    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${g.name} — Server Info`, iconURL: g.iconURL({ dynamic: true }) || undefined })
      .setThumbnail(g.iconURL({ dynamic: true, size: 256 }) || null)
      .addFields(
        { name: '🆔 Server ID',     value: `\`${g.id}\``,                         inline: true },
        { name: '👑 Owner',         value: `<@${g.ownerId}>`,                      inline: true },
        { name: '📅 Created',       value: fmtRel(g.createdAt),                    inline: true },
        { name: '👥 Members',       value: `Total: **${total}** | Humans: **${humans}** | Bots: **${bots}** | Online: **${online}**`, inline: false },
        { name: '💬 Channels',      value: `Text: **${textCh}** | Voice: **${voiceCh}** | Categories: **${cats}**`, inline: false },
        { name: '🎭 Roles',         value: `${g.roles.cache.size}`,                inline: true },
        { name: '😄 Emojis',        value: `${g.emojis.cache.size}`,               inline: true },
        { name: '🔒 Verification',  value: verif[g.verificationLevel] || 'Unknown', inline: true },
        { name: '🚀 Boost Level',   value: `Level **${g.premiumTier}** (${g.premiumSubscriptionCount || 0} boosts)`, inline: false },
      );
    if (g.description) embed.setDescription(`*${g.description}*`);
    embed.setFooter({ text: `flux bot • Requested by ${message.author.username}` }).setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,avatar ──────────────────────────────────────────────────────────────────
const avatar = {
  name: 'avatar',
  aliases: ['av', 'pfp'],
  async execute(message, args) {
    const target = message.mentions.users.first()
      || (args[0] ? await message.client.users.fetch(args[0]).catch(() => null) : null)
      || message.author;
    const member = message.guild.members.cache.get(target.id);

    const globalUrl = target.displayAvatarURL({ dynamic: true, size: 1024 });
    const serverUrl = member?.avatarURL({ dynamic: true, size: 1024 });

    const embed = new EmbedBuilder()
      .setColor(PINK)
      .setAuthor({ name: `${target.username}'s Avatar`, iconURL: globalUrl })
      .setImage(serverUrl || globalUrl)
      .setFooter({ text: `flux bot • Requested by ${message.author.username}` })
      .setTimestamp();

    const row = new ActionRowBuilder();
    row.addComponents(new ButtonBuilder().setLabel('Global Avatar').setStyle(ButtonStyle.Link).setURL(globalUrl));
    if (serverUrl && serverUrl !== globalUrl) {
      row.addComponents(new ButtonBuilder().setLabel('Server Avatar').setStyle(ButtonStyle.Link).setURL(serverUrl));
    }
    await message.reply({ embeds: [embed], components: [row] });
  }
};

// ── ,banner ──────────────────────────────────────────────────────────────────
const banner = {
  name: 'banner',
  aliases: ['bn', 'userbanner'],
  async execute(message, args) {
    const target = message.mentions.users.first()
      || (args[0] ? await message.client.users.fetch(args[0], { force: true }).catch(() => null) : null)
      || await message.client.users.fetch(message.author.id, { force: true });

    const bannerUrl = target.bannerURL?.({ dynamic: true, size: 1024 });
    if (!bannerUrl) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ **${target.username}** has no banner set.`)] });
    }

    const embed = new EmbedBuilder()
      .setColor(PINK)
      .setAuthor({ name: `${target.username}'s Banner`, iconURL: target.displayAvatarURL({ dynamic: true }) })
      .setImage(bannerUrl)
      .setFooter({ text: `flux bot • Requested by ${message.author.username}` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Open Banner').setStyle(ButtonStyle.Link).setURL(bannerUrl)
    );
    await message.reply({ embeds: [embed], components: [row] });
  }
};

// ── ,serveravatar ────────────────────────────────────────────────────────────
const serveravatar = {
  name: 'serveravatar',
  aliases: ['sav', 'memberavatar'],
  async execute(message, args) {
    const member = message.mentions.members.first()
      || (args[0] ? message.guild.members.cache.get(args[0]) : null)
      || message.member;

    const url = member?.avatarURL({ dynamic: true, size: 1024 }) || member?.user.displayAvatarURL({ dynamic: true, size: 1024 });
    const embed = new EmbedBuilder()
      .setColor(PINK)
      .setAuthor({ name: `${member.user.username}'s Server Avatar` })
      .setImage(url)
      .setFooter({ text: `flux bot` }).setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,serverbanner ────────────────────────────────────────────────────────────
const serverbanner = {
  name: 'serverbanner',
  aliases: ['sbanner', 'guildbanner', 'gbanner'],
  async execute(message) {
    const g = await message.guild.fetch();
    const url = g.bannerURL?.({ dynamic: true, size: 1024 });
    if (!url) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ This server has no banner.')] });
    const embed = new EmbedBuilder().setColor(BLUE).setAuthor({ name: `${g.name} — Server Banner` }).setImage(url).setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,sicon ───────────────────────────────────────────────────────────────────
const sicon = {
  name: 'sicon',
  aliases: ['servericon', 'guildicon', 'gicon'],
  async execute(message) {
    const g = message.guild;
    const url = g.iconURL({ dynamic: true, size: 1024 });
    if (!url) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ This server has no icon.')] });
    const embed = new EmbedBuilder().setColor(BLUE).setAuthor({ name: `${g.name} — Server Icon` }).setImage(url).setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,splash ──────────────────────────────────────────────────────────────────
const splash = {
  name: 'splash',
  aliases: ['serversplash', 'gsplash'],
  async execute(message) {
    const g = await message.guild.fetch();
    const url = g.splashURL?.({ size: 1024 });
    if (!url) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ This server has no invite splash.')] });
    const embed = new EmbedBuilder().setColor(BLUE).setAuthor({ name: `${g.name} — Server Splash` }).setImage(url).setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,membercount ─────────────────────────────────────────────────────────────
const membercount = {
  name: 'membercount',
  aliases: ['mc', 'members'],
  async execute(message) {
    const g = message.guild;
    await g.members.fetch().catch(() => {});
    const total  = g.memberCount;
    const bots   = g.members.cache.filter(m => m.user.bot).size;
    const humans = total - bots;
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${g.name} — Member Count`, iconURL: g.iconURL({ dynamic: true }) || undefined })
      .addFields(
        { name: '👥 Total',  value: `**${total}**`,  inline: true },
        { name: '🧑 Humans', value: `**${humans}**`, inline: true },
        { name: '🤖 Bots',   value: `**${bots}**`,   inline: true },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,boosters ────────────────────────────────────────────────────────────────
const boosters = {
  name: 'boosters',
  aliases: ['serverboosts'],
  async execute(message) {
    const g = message.guild;
    await g.members.fetch().catch(() => {});
    const boosterList = g.members.cache.filter(m => m.premiumSince).sort((a, b) => a.premiumSince - b.premiumSince);
    const embed = new EmbedBuilder()
      .setColor(PINK)
      .setAuthor({ name: `${g.name} — Server Boosters (${boosterList.size})`, iconURL: g.iconURL({ dynamic: true }) || undefined })
      .setDescription(boosterList.size ? [...boosterList.values()].slice(0, 30).map((m, i) => `**${i + 1}.** <@${m.id}> — since ${fmtRel(m.premiumSince)}`).join('\n') : 'No boosters yet.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,invites ─────────────────────────────────────────────────────────────────
const invites = {
  name: 'invites',
  aliases: ['userinvites'],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const all = await message.guild.invites.fetch().catch(() => null);
    if (!all) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Could not fetch invites.')] });
    const userInvites = all.filter(i => i.inviter?.id === target.id);
    const total = userInvites.reduce((sum, i) => sum + (i.uses || 0), 0);
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${target.username}'s Invites`, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: '🔗 Total Uses',    value: `**${total}**`,          inline: true },
        { name: '📬 Active Links',  value: `**${userInvites.size}**`, inline: true },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,inviteinfo ──────────────────────────────────────────────────────────────
const inviteinfo = {
  name: 'inviteinfo',
  aliases: ['iinfo'],
  async execute(message, args) {
    if (!args[0]) return message.reply('Usage: `,inviteinfo <code>`');
    const code = args[0].replace('https://discord.gg/', '').replace('https://discord.com/invite/', '');
    const inv = await message.client.fetchInvite(code).catch(() => null);
    if (!inv) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Invalid or expired invite.')] });
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle(`Invite: ${code}`)
      .addFields(
        { name: '🏠 Server',    value: inv.guild?.name || 'Unknown', inline: true },
        { name: '📬 Channel',   value: inv.channel?.name || 'Unknown', inline: true },
        { name: '👑 Inviter',   value: inv.inviter?.username || 'Unknown', inline: true },
        { name: '👥 Members',   value: `${inv.memberCount || '?'} / ${inv.presenceCount || '?'} online`, inline: true },
        { name: '🔢 Uses',      value: `${inv.uses ?? '?'}`, inline: true },
        { name: '⏰ Expires',   value: inv.expiresAt ? fmtRel(inv.expiresAt) : 'Never', inline: true },
      )
      .setTimestamp();
    if (inv.guild?.iconURL()) embed.setThumbnail(inv.guild.iconURL({ dynamic: true }));
    await message.reply({ embeds: [embed] });
  }
};

// ── ,firstmsg ────────────────────────────────────────────────────────────────
const firstmsg = {
  name: 'firstmsg',
  aliases: ['firstmessage'],
  async execute(message, args) {
    const channel = message.mentions.channels.first() || message.channel;
    const msgs = await channel.messages.fetch({ limit: 1, after: '0' }).catch(() => null);
    if (!msgs || msgs.size === 0) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Could not fetch first message.')] });
    const first = msgs.first();
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `First message in #${channel.name}` })
      .setDescription(`[Jump to Message](${first.url})\n\n${first.content || '*No text content.*'}`)
      .addFields(
        { name: '✍️ Author', value: `<@${first.author.id}>`, inline: true },
        { name: '📅 Date',   value: fmtDate(first.createdAt),  inline: true },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,pins ────────────────────────────────────────────────────────────────────
const pins = {
  name: 'pins',
  aliases: ['pinnedmessages'],
  async execute(message, args) {
    const channel = message.mentions.channels.first() || message.channel;
    const pinned = await channel.messages.fetchPinned().catch(() => null);
    if (!pinned) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Could not fetch pins.')] });
    const embed = new EmbedBuilder()
      .setColor(YELLOW)
      .setAuthor({ name: `Pinned Messages in #${channel.name} (${pinned.size})` })
      .setDescription(pinned.size
        ? [...pinned.values()].map((m, i) => `**${i + 1}.** [Jump](${m.url}) — ${m.content?.slice(0, 60) || '*embed/file*'} — <@${m.author.id}>`).join('\n')
        : 'No pinned messages.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,color ───────────────────────────────────────────────────────────────────
const color = {
  name: 'color',
  aliases: ['colour', 'colorinfo'],
  async execute(message, args) {
    if (!args[0]) return message.reply('Usage: `,color <hex or name>`');
    const input = args[0].replace('#', '');
    const hex = /^[0-9A-Fa-f]{6}$/.test(input) ? input : null;
    if (!hex) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Please provide a valid hex color (e.g. `#ff6b9d`).')] });
    const num = parseInt(hex, 16);
    const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    const embed = new EmbedBuilder()
      .setColor(parseInt(hex, 16))
      .setTitle(`#${hex.toUpperCase()}`)
      .addFields(
        { name: 'Hex',  value: `\`#${hex.toUpperCase()}\``,         inline: true },
        { name: 'RGB',  value: `\`rgb(${r}, ${g}, ${b})\``,          inline: true },
        { name: 'Int',  value: `\`${num}\``,                          inline: true },
        { name: 'Dec',  value: `R: ${r} | G: ${g} | B: ${b}`,        inline: false },
      )
      .setThumbnail(`https://singlecolorimage.com/get/${hex}/100x100`)
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,vanity ──────────────────────────────────────────────────────────────────
const vanity = {
  name: 'vanity',
  aliases: ['vanityurl'],
  async execute(message) {
    const g = await message.guild.fetch();
    const code = g.vanityURLCode;
    if (!code) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ This server has no vanity URL.')] });
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setTitle(`${g.name} — Vanity URL`)
      .setDescription(`**discord.gg/${code}**\nUses: **${g.vanityURLUses || 0}**`)
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,seen ────────────────────────────────────────────────────────────────────
const seen = {
  name: 'seen',
  aliases: ['lastseen'],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setDescription(`ℹ️ Last seen tracking is not configured for this bot.\nUse the **presence system** or check **${target.username}**'s activity manually.`)
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,bans ────────────────────────────────────────────────────────────────────
const bans = {
  name: 'bans',
  aliases: ['banlist'],
  async execute(message) {
    if (!message.member.permissions.has('BanMembers')) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Ban Members** permission.')] });
    }
    const banList = await message.guild.bans.fetch().catch(() => null);
    if (!banList) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Could not fetch ban list.')] });
    const embed = new EmbedBuilder()
      .setColor(RED)
      .setAuthor({ name: `${message.guild.name} — Banned Users (${banList.size})` })
      .setDescription(banList.size
        ? [...banList.values()].slice(0, 20).map((b, i) => `**${i + 1}.** ${b.user.username} (\`${b.user.id}\`) — ${b.reason || 'No reason'}`).join('\n')
        : 'No banned users.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,rep ─────────────────────────────────────────────────────────────────────
const rep = {
  name: 'rep',
  aliases: ['reputation'],
  async execute(message, args) {
    const target = message.mentions.users.first();
    if (!target || target.id === message.author.id) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Mention a user to give them reputation.')] });
    }
    const embed = new EmbedBuilder()
      .setColor(GREEN)
      .setAuthor({ name: 'Reputation', iconURL: target.displayAvatarURL() })
      .setDescription(`✅ You gave **+1 rep** to **${target.username}**!`)
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,hex ─────────────────────────────────────────────────────────────────────
const hex = {
  name: 'hex',
  aliases: ['hextodec'],
  async execute(message, args) {
    if (!args[0]) return message.reply('Usage: `,hex <hex_code>`');
    const h = args[0].replace('#', '');
    const num = parseInt(h, 16);
    if (isNaN(num)) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Invalid hex code.')] });
    const embed = new EmbedBuilder()
      .setColor(num)
      .setTitle(`Hex: #${h.toUpperCase()}`)
      .setDescription(`**Decimal:** ${num}\n**RGB:** ${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`)
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,pronouns ────────────────────────────────────────────────────────────────
const pronouns = {
  name: 'pronouns',
  aliases: ['pronoun'],
  async execute(message, args) {
    const embed = new EmbedBuilder()
      .setColor(PURPLE)
      .setDescription('ℹ️ Pronoun profiles are not yet configured for this server. Use `,bio` to set personal info.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,bio ─────────────────────────────────────────────────────────────────────
const bio = {
  name: 'bio',
  aliases: ['profile'],
  async execute(message, args) {
    const target = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setColor(PURPLE)
      .setAuthor({ name: `${target.username}'s Bio`, iconURL: target.displayAvatarURL() })
      .setDescription('ℹ️ Bio profiles are not yet configured.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,socials ─────────────────────────────────────────────────────────────────
const socials = {
  name: 'socials',
  aliases: ['social'],
  async execute(message, args) {
    const embed = new EmbedBuilder()
      .setColor(CYAN)
      .setDescription('ℹ️ Social profiles are not yet configured.\nUse `,social add <platform> <handle>` to link your accounts.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,names ───────────────────────────────────────────────────────────────────
const names = {
  name: 'names',
  aliases: ['namehistory', 'namehistory'],
  async execute(message, args) {
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setDescription('ℹ️ Username history tracking is not enabled for this bot.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,boosts ──────────────────────────────────────────────────────────────────
const boosts = {
  name: 'boosts',
  aliases: ['boost'],
  async execute(message, args) {
    const g = message.guild;
    await g.members.fetch().catch(() => {});
    const boosterList = g.members.cache.filter(m => m.premiumSince);
    const embed = new EmbedBuilder()
      .setColor(PINK)
      .setTitle(`${g.name} — Boost Info`)
      .addFields(
        { name: '🚀 Boost Level', value: `Level **${g.premiumTier}**`, inline: true },
        { name: '💎 Total Boosts', value: `**${g.premiumSubscriptionCount || 0}**`, inline: true },
        { name: '👥 Boosters', value: `**${boosterList.size}**`, inline: true },
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

module.exports = [
  userinfo, serverinfo, avatar, banner, serveravatar, serverbanner,
  sicon, splash, membercount, boosters, invites, inviteinfo,
  firstmsg, pins, color, vanity, seen, bans, rep, hex,
  pronouns, bio, socials, names, boosts,
];
