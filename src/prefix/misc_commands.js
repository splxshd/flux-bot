'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const PINK   = '#EB459E';

// ,lvl
const lvl = {
  name: 'lvl',
  aliases: ['level'],
  async execute(message, args) {
    const target = message.mentions.members.first() || message.member;
    const data = db.getUserXP?.(message.guild.id, target.id) || { xp: 0, level: 0 };
    const xpNeeded = (data.level + 1) * 100;
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${target.user.username} — Level`, iconURL: target.user.displayAvatarURL() })
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'Level', value: `${data.level}`, inline: true },
        { name: 'XP',    value: `${data.xp} / ${xpNeeded}`, inline: true },
      )
      .setTimestamp()] });
  }
};

// ,botinfo
const botinfo = {
  name: 'botinfo',
  aliases: ['bot', 'about'],
  async execute(message, args, client) {
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${client.user.username} — Bot Info`, iconURL: client.user.displayAvatarURL() })
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: 'Ping',     value: `${client.ws.ping}ms`, inline: true },
        { name: 'Uptime',   value: `${h}h ${m}m ${s}s`,  inline: true },
        { name: 'Servers',  value: `${client.guilds.cache.size}`, inline: true },
        { name: 'Users',    value: `${client.users.cache.size}`,  inline: true },
        { name: 'Commands', value: `${client.commands ? client.commands.size : 0}`, inline: true },
        { name: 'Library',  value: 'Discord.js v14',              inline: true },
      )
      .setTimestamp()] });
  }
};

// ,whois
const whois = {
  name: 'whois',
  aliases: ['who'],
  async execute(message, args) {
    const target = message.mentions.members.first()
      || await message.guild.members.fetch(args[0]).catch(() => null)
      || message.member;
    const user = target.user;
    const roles = target.roles.cache.filter(r => r.id !== message.guild.id).sort((a, b) => b.position - a.position);
    const fmtDate = d => `<t:${Math.floor(d.getTime() / 1000)}:F>`;
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(target.displayHexColor || BLUE)
      .setAuthor({ name: `${user.username} — Who Is`, iconURL: user.displayAvatarURL() })
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'Username', value: `\`${user.username}\``,   inline: true },
        { name: 'User ID',  value: `\`${user.id}\``,         inline: true },
        { name: 'Bot',      value: user.bot ? 'Yes' : 'No',  inline: true },
        { name: 'Created',  value: fmtDate(user.createdAt),  inline: false },
        { name: 'Joined',   value: target.joinedAt ? fmtDate(target.joinedAt) : 'Unknown', inline: false },
        { name: 'Nickname', value: target.nickname || 'None', inline: true },
        { name: `Roles (${roles.size})`, value: roles.size ? roles.map(r => `${r}`).slice(0, 8).join(' ') : 'None', inline: false },
      )
      .setFooter({ text: `User ID: ${user.id}` })
      .setTimestamp()] });
  }
};

// ,nick
const nick = {
  name: 'nick',
  aliases: ['nickname', 'setnick'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('You need Manage Nicknames permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,nick <@user> [new nickname]`');
    const newNick = args.slice(1).join(' ') || null;
    await member.setNickname(newNick).catch(() => {});
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setDescription(newNick
        ? `Set **${member.user.username}**'s nickname to **${newNick}**.`
        : `Reset **${member.user.username}**'s nickname.`)] });
  }
};

// ,timeout
const timeout_cmd = {
  name: 'timeout',
  aliases: ['to'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('You need Moderate Members permission.')] });
    const member = message.mentions.members.first();
    if (!member) return message.reply('Usage: `,timeout <@user> <duration> [reason]`  e.g. 10m');
    const durationStr = args[1];
    if (!durationStr) return message.reply('Please provide a duration e.g. `10m`, `2h`, `1d`');
    const match = durationStr.match(/^(\d+)([smhd])$/i);
    if (!match) return message.reply('Invalid duration. Use `10s`, `5m`, `2h`, `1d`.');
    const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const ms = parseInt(match[1]) * mult[match[2].toLowerCase()];
    const reason = args.slice(2).join(' ') || 'No reason provided';
    const err = await member.timeout(ms, reason).catch(e => e);
    if (err instanceof Error) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`${err.message}`)] });
    return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
      .setTitle('Member Timed Out')
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: 'User',     value: `${member}`, inline: true },
        { name: 'Duration', value: durationStr,  inline: true },
        { name: 'Reason',   value: reason,        inline: false },
      )
      .setFooter({ text: `By ${message.author.tag}` })
      .setTimestamp()] });
  }
};

// ,channelinfo
const channelinfo = {
  name: 'channelinfo',
  aliases: ['chinfo'],
  async execute(message, args) {
    const ch = message.mentions.channels.first()
      || message.guild.channels.cache.get(args[0])
      || message.channel;
    const fmtDate = d => `<t:${Math.floor(d.getTime() / 1000)}:F>`;
    const typeMap = { 0: 'Text', 2: 'Voice', 4: 'Category', 5: 'Announcement', 13: 'Stage', 15: 'Forum' };
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `#${ch.name} — Channel Info` })
      .addFields(
        { name: 'ID',       value: `\`${ch.id}\``,               inline: true },
        { name: 'Type',     value: typeMap[ch.type] || 'Unknown', inline: true },
        { name: 'Category', value: ch.parent ? ch.parent.name : 'None', inline: true },
        { name: 'Created',  value: fmtDate(ch.createdAt),         inline: false },
        { name: 'NSFW',     value: ch.nsfw ? 'Yes' : 'No',        inline: true },
        { name: 'Members',  value: `${ch.members ? ch.members.size : 'N/A'}`, inline: true },
      )
      .setFooter({ text: `Channel ID: ${ch.id}` })
      .setTimestamp()] });
  }
};

// ,roleinfo
const roleinfo = {
  name: 'roleinfo',
  aliases: ['rinfo'],
  async execute(message, args) {
    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
    if (!role) return message.reply('Usage: `,roleinfo <@role>`');
    const fmtDate = d => `<t:${Math.floor(d.getTime() / 1000)}:F>`;
    const perms = role.permissions.toArray().slice(0, 5).join(', ') || 'None';
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(role.hexColor || BLUE)
      .setAuthor({ name: `${role.name} — Role Info` })
      .addFields(
        { name: 'ID',          value: `\`${role.id}\``,          inline: true },
        { name: 'Color',       value: role.hexColor,              inline: true },
        { name: 'Position',    value: `${role.position}`,         inline: true },
        { name: 'Hoisted',     value: role.hoist ? 'Yes' : 'No', inline: true },
        { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
        { name: 'Members',     value: `${role.members.size}`,     inline: true },
        { name: 'Created',     value: fmtDate(role.createdAt),   inline: false },
        { name: 'Permissions', value: perms,                      inline: false },
      )
      .setFooter({ text: `Role ID: ${role.id}` })
      .setTimestamp()] });
  }
};

// ,emoteinfo
const emoteinfo = {
  name: 'emoteinfo',
  aliases: ['emojiinfo', 'ei'],
  async execute(message, args) {
    const emojiMatch = args[0] ? args[0].match(/^<a?:(\w+):(\d+)>$/) : null;
    if (!emojiMatch) return message.reply('Usage: `,emoteinfo <emoji>`  (must be a custom emoji)');
    const name = emojiMatch[1];
    const id   = emojiMatch[2];
    const animated = args[0].startsWith('<a:');
    const url = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`;
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `:${name}: — Emoji Info` })
      .setThumbnail(url)
      .addFields(
        { name: 'ID',       value: `\`${id}\``,              inline: true },
        { name: 'Name',     value: `\`${name}\``,            inline: true },
        { name: 'Animated', value: animated ? 'Yes' : 'No', inline: true },
        { name: 'URL',      value: `[Open](${url})`,        inline: false },
      )
      .setTimestamp()] });
  }
};

// ,permissions
const permissions_cmd = {
  name: 'permissions',
  aliases: ['perms', 'checkperms'],
  async execute(message, args) {
    const target = message.mentions.members.first() || message.member;
    const ch = message.mentions.channels.first() || message.channel;
    const perms = target.permissionsIn(ch).toArray();
    const chunks = perms.length ? perms.map(p => `\`${p}\``).join(', ') : 'No permissions';
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${target.user.username} — Permissions in #${ch.name}`, iconURL: target.user.displayAvatarURL() })
      .setDescription(chunks.slice(0, 2048))
      .setTimestamp()] });
  }
};

// ,stats
const stats = {
  name: 'stats',
  aliases: ['botstats'],
  async execute(message, args, client) {
    const used = process.memoryUsage();
    const mb = v => (v / 1024 / 1024).toFixed(2) + ' MB';
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(BLUE)
      .setTitle('Bot Statistics')
      .addFields(
        { name: 'Guilds',    value: `${client.guilds.cache.size}`,   inline: true },
        { name: 'Users',     value: `${client.users.cache.size}`,    inline: true },
        { name: 'Channels',  value: `${client.channels.cache.size}`, inline: true },
        { name: 'Heap Used', value: mb(used.heapUsed),               inline: true },
        { name: 'RSS',       value: mb(used.rss),                    inline: true },
        { name: 'WS Ping',   value: `${client.ws.ping}ms`,          inline: true },
      )
      .setTimestamp()] });
  }
};

// ,support
const support = {
  name: 'support',
  aliases: ['helpserver'],
  async execute(message) {
    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(PINK)
      .setTitle('Support Server')
      .setDescription('Need help? Join our support server for assistance.')
      .setTimestamp()] });
  }
};

// ,ttt (Tic Tac Toe)
const TTT_EMPTY = 'empty';
const TTT_X = 'X';
const TTT_O = 'O';
const GRID  = ['1','2','3','4','5','6','7','8','9'];

const ttt = {
  name: 'ttt',
  aliases: ['tictactoe'],
  async execute(message, args) {
    const opponent = message.mentions.members.first();
    if (!opponent || opponent.id === message.author.id)
      return message.reply('Usage: `,ttt <@user>`');

    const board = [...GRID];
    let currentPlayer = message.author;
    const other       = opponent.user;
    const symbols     = {};
    symbols[currentPlayer.id] = 'X';
    symbols[other.id]          = 'O';

    const renderBoard = () => board.map(c => c === 'X' ? ':regional_indicator_x:' : c === 'O' ? ':o2:' : ':black_large_square:').join('').replace(/(.{3}(?:...)*)/g, '$1\n').trim();
    const checkWin = sym => {
      const w = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      return w.some(([a,b,c]) => board[a]===sym && board[b]===sym && board[c]===sym);
    };

    const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
      .setTitle('Tic Tac Toe')
      .setDescription(`X: ${message.author} vs O: ${other}\n\n${renderBoard()}\n\n**${currentPlayer.username}** — type 1-9`)] });

    const filter = m => [message.author.id, other.id].includes(m.author.id) && /^[1-9]$/.test(m.content.trim());
    const collector = message.channel.createMessageCollector({ filter, time: 60000 });

    collector.on('collect', async m => {
      if (m.author.id !== currentPlayer.id) return;
      const idx = parseInt(m.content.trim()) - 1;
      if (board[idx] === 'X' || board[idx] === 'O') return;
      board[idx] = symbols[currentPlayer.id];
      m.delete().catch(() => {});
      const sym = symbols[currentPlayer.id];
      if (checkWin(sym)) {
        collector.stop('done');
        return msg.edit({ embeds: [new EmbedBuilder().setColor(GREEN).setTitle('Tic Tac Toe').setDescription(`${renderBoard()}\n\n**${currentPlayer.username} wins!**`)] });
      }
      if (!board.some(c => c !== 'X' && c !== 'O')) {
        collector.stop('done');
        return msg.edit({ embeds: [new EmbedBuilder().setColor(YELLOW).setTitle('Tic Tac Toe').setDescription(`${renderBoard()}\n\nDraw!`)] });
      }
      currentPlayer = currentPlayer.id === message.author.id ? other : message.author;
      msg.edit({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('Tic Tac Toe').setDescription(`${renderBoard()}\n\n**${currentPlayer.username}** — type 1-9`)] });
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'done') msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setTitle('Tic Tac Toe').setDescription('Game timed out.')] }).catch(() => {});
    });
  }
};

// ,blacktea
const blacktea = {
  name: 'blacktea',
  aliases: ['bt'],
  async execute(message, args) {
    const opponent = message.mentions.users.first();
    if (!opponent) return message.reply('Usage: `,blacktea <@user>`');
    const words = ['BLACKTEA','TEAPOT','DISCORD','SERVER','CHANNEL','MEMBER','ONLINE','OFFLINE'];
    const word = words[Math.floor(Math.random() * words.length)];
    const prompt = await message.reply({ embeds: [new EmbedBuilder()
      .setColor('#4E342E')
      .setTitle('Black Tea Challenge')
      .setDescription(`${message.author} vs ${opponent}\n\nFirst to type **\`${word}\`** wins!`)] });

    const filter = m => [message.author.id, opponent.id].includes(m.author.id) && m.content === word;
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 }).catch(() => null);

    if (!collected || collected.size === 0)
      return prompt.edit({ embeds: [new EmbedBuilder().setColor(RED).setTitle('Black Tea — Timed Out').setDescription(`Nobody typed **${word}** in time!`)] });

    const winner = collected.first().author;
    return prompt.edit({ embeds: [new EmbedBuilder().setColor(GREEN)
      .setTitle('Black Tea — Winner!')
      .setDescription(`**${winner.username}** typed \`${word}\` first!`)] });
  }
};

// ,poker (high card)
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS = ['♠️','♥️','♦️','♣️'];
function drawCard() { return `${RANKS[Math.floor(Math.random()*RANKS.length)]}${SUITS[Math.floor(Math.random()*SUITS.length)]}`; }

const poker = {
  name: 'poker',
  aliases: [],
  async execute(message, args) {
    const opponent = message.mentions.users.first();
    if (!opponent) return message.reply('Usage: `,poker <@user>`');

    const myHand  = [drawCard(), drawCard(), drawCard()];
    const oppHand = [drawCard(), drawCard(), drawCard()];
    const val = hand => hand.reduce((a, c) => a + RANKS.indexOf(c.slice(0, -2)), 0);
    const myVal  = val(myHand);
    const oppVal = val(oppHand);
    const winner = myVal > oppVal ? message.author : oppVal > myVal ? opponent : null;

    return message.reply({ embeds: [new EmbedBuilder()
      .setColor(PINK)
      .setTitle('High Card Poker')
      .addFields(
        { name: message.author.username, value: myHand.join(' '),  inline: true },
        { name: opponent.username,        value: oppHand.join(' '), inline: true },
      )
      .setDescription(winner ? `**${winner.username}** wins!` : "It's a tie!")
      .setTimestamp()] });
  }
};

module.exports = [lvl, botinfo, whois, nick, timeout_cmd, channelinfo, roleinfo, emoteinfo, permissions_cmd, stats, support, ttt, blacktea, poker];
