'use strict';

const { EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { generateRankCard } = require('../utils/rankCard');

const COLORS = {
  default: '#5865F2',
  green:   '#57F287',
  red:     '#ED4245',
  yellow:  '#FEE75C',
  gold:    '#F1C40F',
};

// Color based on level tier
function levelColor(level) {
  if (level >= 50) return '#FF6B6B'; // red/legendary
  if (level >= 30) return '#FFD700'; // gold
  if (level >= 20) return '#E040FB'; // purple
  if (level >= 10) return '#00E5FF'; // cyan
  if (level >= 5)  return '#69F0AE'; // green
  return '#5865F2';                  // blurple default
}

// Unicode progress bar (20 chars wide)
function progressBar(current, total, size = 18) {
  const pct = Math.min(current / total, 1);
  const filled = Math.round(pct * size);
  const bar = '█'.repeat(filled) + '░'.repeat(size - filled);
  return `\`${bar}\``;
}

function formatXp(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// ── ,rank / ,level / ,xp ─────────────────────────────────────────────────────
const rank = {
  name: 'rank',
  aliases: ['level', 'xp'],
  async execute(message, args) {
    let target = message.mentions.users.first();
    if (!target && args[0]) {
      // Try fetch by ID
      target = await message.client.users.fetch(args[0]).catch(() => null);
    }
    target = target || message.author;

    const guildId = message.guild.id;
    const row = db.getUserLevel(guildId, target.id);
    const xp    = row?.xp    ?? 0;
    const level = row?.level ?? 0;

    const { rank: userRank, total } = db.getLevelRank(guildId, target.id);
    const xpIntoLevel = xp - db.cumulativeXpForLevel(level);
    const xpNeeded    = db.xpForLevel(level);

    const typing = message.channel.sendTyping().catch(() => {});

    try {
      const buffer = await generateRankCard({
        username:    target.username,
        avatarUrl:   target.displayAvatarURL({ extension: 'png', size: 256 }),
        level,
        xp,
        xpIntoLevel,
        xpNeeded,
        rank:        userRank,
        totalUsers:  total,
      });
      const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });
      await message.reply({ files: [attachment] });
    } catch (e) {
      console.error('[rankCard]', e);
      // Fallback embed if canvas fails
      const embed = new EmbedBuilder()
        .setColor(levelColor(level))
        .setAuthor({ name: target.username, iconURL: target.displayAvatarURL({ size: 128 }) })
        .setDescription(`**Level ${level}** — ${formatXp(xpIntoLevel)} / ${formatXp(xpNeeded)} XP\n${progressBar(xpIntoLevel, xpNeeded)}`)
        .addFields(
          { name: '🏆 Rank', value: userRank ? `#${userRank}` : 'Unranked', inline: true },
          { name: '✨ Total XP', value: formatXp(xp), inline: true },
        );
      await message.reply({ embeds: [embed] });
    }
  },
};

// ── ,leaderboard ─────────────────────────────────────────────────────────────
const leaderboard = {
  name: 'leaderboard',
  aliases: ['lb', 'top'],
  async execute(message) {
    const guildId = message.guild.id;
    const rows = db.getLevelLeaderboard(guildId, 10);

    if (!rows.length) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor(COLORS.default)
          .setDescription('No XP data yet — start chatting to earn XP!')],
      });
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = await Promise.all(rows.map(async (r, i) => {
      let username;
      try {
        const u = await message.client.users.fetch(r.user_id);
        username = u.username;
      } catch {
        username = `Unknown (${r.user_id})`;
      }
      const prefix = medals[i] ?? `**${i + 1}.**`;
      return `${prefix} **${username}** — Level ${r.level} · ${formatXp(r.xp)} XP`;
    }));

    const embed = new EmbedBuilder()
      .setColor(COLORS.gold)
      .setAuthor({
        name: `${message.guild.name} — XP Leaderboard`,
        iconURL: message.guild.iconURL({ dynamic: true }) || undefined,
      })
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Earn XP by chatting — 15–25 XP per message (1 min cooldown)' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },
};

// ── ,xplb ─────────────────────────────────────────────────────────────────────
const xplb = {
  name: 'xplb',
  aliases: ['xpleaderboard'],
  async execute(message) {
    return leaderboard.execute(message, []);
  },
};

// ── ,levels (admin config) ────────────────────────────────────────────────────
const levels = {
  name: 'levels',
  aliases: ['leveling'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.red).setDescription('❌ You need **Manage Server** permission.')] });

    const sub = args[0]?.toLowerCase();
    const guildId = message.guild.id;

    if (sub === 'enable') {
      db.upsertLevelSettings(guildId, { enabled: 1 });
      return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.green).setDescription('✅ Leveling system **enabled**.') ]});
    }
    if (sub === 'disable') {
      db.upsertLevelSettings(guildId, { enabled: 0 });
      return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.yellow).setDescription('⚠️ Leveling system **disabled**.')] });
    }
    if (sub === 'setlevelup') {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('Usage: `,levels setlevelup <#channel>`');
      db.upsertLevelSettings(guildId, { levelup_channel: channel.id });
      return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.green).setDescription(`✅ Level-up messages will be sent to ${channel}.`)] });
    }
    if (sub === 'setmessage') {
      const msg = args.slice(1).join(' ');
      if (!msg) return message.reply('Usage: `,levels setmessage <message>` — use `{user}`, `{level}`, `{username}`');
      db.upsertLevelSettings(guildId, { levelup_message: msg });
      return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.green).setDescription(`✅ Level-up message set to:\n> ${msg}`)] });
    }
    if (sub === 'setreward') {
      const lvl  = parseInt(args[1]);
      const role = message.mentions.roles.first();
      if (!lvl || !role) return message.reply('Usage: `,levels setreward <level> <@role>`');
      db.setLevelReward(guildId, lvl, role.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.green).setDescription(`✅ Users reaching **Level ${lvl}** will receive **${role.name}**.`)] });
    }
    if (sub === 'removereward' || sub === 'delreward') {
      const lvl = parseInt(args[1]);
      if (!lvl) return message.reply('Usage: `,levels removereward <level>`');
      db.removeLevelReward(guildId, lvl);
      return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.green).setDescription(`✅ Removed reward for Level **${lvl}**.`)] });
    }
    if (sub === 'rewards') {
      const rewards = db.getLevelRewards(guildId);
      const desc = rewards.length
        ? rewards.map(r => `Level **${r.level}** → <@&${r.role_id}>`).join('\n')
        : 'No rewards configured yet.';
      return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.default).setTitle('Level Rewards').setDescription(desc)] });
    }
    if (sub === 'xp') {
      const action = args[1]?.toLowerCase();
      const target = message.mentions.users.first();
      const amount = parseInt(args[3]) || parseInt(args[2]);
      if (!target || !amount || !['add', 'remove'].includes(action))
        return message.reply('Usage: `,levels xp <add|remove> <@user> <amount>`');
      const cur = db.getUserLevel(guildId, target.id);
      const curXp = cur?.xp ?? 0;
      const newXp = Math.max(0, action === 'add' ? curXp + amount : curXp - amount);
      db.setUserXp(guildId, target.id, newXp);
      return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.green).setDescription(
        `✅ ${action === 'add' ? 'Added' : 'Removed'} **${amount} XP** ${action === 'add' ? 'to' : 'from'} **${target.username}**. (Now: ${formatXp(newXp)} XP)`
      )] });
    }
    if (sub === 'reset') {
      const target = message.mentions.users.first();
      if (!target) return message.reply('Usage: `,levels reset <@user>`');
      db.resetUserLevel(guildId, target.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(COLORS.yellow).setDescription(`✅ Reset XP for **${target.username}**.`)] });
    }

    // Help
    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(COLORS.default)
        .setTitle('Levels System')
        .setDescription([
          '**`,levels enable`** — enable leveling',
          '**`,levels disable`** — disable leveling',
          '**`,levels setlevelup <#channel>`** — set level-up channel',
          '**`,levels setmessage <text>`** — custom level-up message',
          '**`,levels setreward <level> <@role>`** — role reward at level',
          '**`,levels removereward <level>`** — remove reward',
          '**`,levels rewards`** — list rewards',
          '**`,levels xp <add|remove> <@user> <amount>`** — adjust XP',
          '**`,levels reset <@user>`** — reset user XP',
        ].join('\n'))
        .setFooter({ text: 'Variables: {user} {username} {level}' }),
    ] });
  },
};

module.exports = [rank, leaderboard, xplb, levels];
