'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
} = require('discord.js');
const db = require('../database');

const OWNER_ID = '1467527738091896986';
const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';

function isAdmin(message) {
  return message.author.id === OWNER_ID ||
    message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}

function pad(n) { return String(n).padStart(2, '0'); }

function buildCheckinMessage(guildId, staffRoleId, deadlineHours, today) {
  const now   = new Date();
  const HH    = now.getHours();
  const greet = HH < 12 ? 'morning' : HH < 18 ? 'afternoon' : 'evening';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`staff_checkin:${guildId}:${today}`)
      .setLabel('Check In')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
  );

  const embed = new EmbedBuilder()
    .setColor(BLUE)
    .setTitle('📋 Daily Staff Check-in')
    .setDescription(
      `Good ${greet}! Please confirm your attendance for today.\n` +
      `Click the button below to check in.`,
    )
    .setTimestamp()
    .setFooter({ text: `You have ${deadlineHours} hour${deadlineHours !== 1 ? 's' : ''} to check in` });

  return { content: `<@&${staffRoleId}>`, embeds: [embed], components: [row],
           allowedMentions: { roles: [staffRoleId] } };
}

// ── ,staffsetup ───────────────────────────────────────────────────────────────
const staffsetup = {
  name: 'staffsetup',
  aliases: ['staffcheckin', 'checkinsetup'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
    }

    const guildId = message.guild.id;
    const sub     = args[0]?.toLowerCase();

    // ── Show config ──────────────────────────────────────────────────────────
    if (!sub) {
      const s = db.getStaffCheckinSettings(guildId) || {};
      const h = s.checkin_hour ?? 9;
      const m = s.checkin_minute ?? 0;
      const dl = s.deadline_hours ?? 4;

      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('⏰ Staff Check-in Setup')
        .setDescription('Pings staff daily. If anyone misses the deadline, an alert fires in the higher-ups channel.')
        .addFields(
          { name: '🔘 Status',           value: s.enabled ? '✅ Enabled' : '❌ Disabled',                   inline: true },
          { name: '⏰ Check-in Time',    value: `${pad(h)}:${pad(m)} (24h)`,                                inline: true },
          { name: '⌛ Alert After',      value: `${dl} hour${dl !== 1 ? 's' : ''}`,                         inline: true },
          { name: '🌍 Timezone',         value: s.timezone || 'UTC',                                        inline: true },
          { name: '👥 Staff Role',       value: s.staff_role_id ? `<@&${s.staff_role_id}>` : 'Not set',     inline: true },
          { name: '🔔 Alert Ping Role',  value: s.alert_role_id ? `<@&${s.alert_role_id}>` : 'Not set',     inline: true },
          { name: '​',              value: '​',                                                    inline: true },
          { name: '📢 Check-in Channel', value: s.staff_channel_id ? `<#${s.staff_channel_id}>` : 'Not set', inline: true },
          { name: '⚠️ Alert Channel',    value: s.alert_channel_id ? `<#${s.alert_channel_id}>` : 'Not set', inline: true },
          { name: '​',              value: '​',                                                    inline: true },
          {
            name: '📖 Subcommands',
            value: [
              '`,staffsetup staffrole @role` — role that must check in',
              '`,staffsetup alertrole @role` — role pinged in alert (optional)',
              '`,staffsetup channel #ch` — where check-in message posts',
              '`,staffsetup alertchannel #ch` — where missed-checkin alert goes',
              '`,staffsetup time HH:MM` — daily time (24h, e.g. `09:00`)',
              '`,staffsetup deadline <hours>` — hours before alert fires (1–23)',
              '`,staffsetup timezone <tz>` — e.g. `America/New_York`, `UTC`',
              '`,staffsetup enable` / `disable`',
              '`,staffsetup test` — send check-in message now',
            ].join('\n'),
            inline: false,
          },
        )
        .setFooter({ text: 'Staff Check-in System' })
        .setTimestamp()] });
    }

    // ── staffrole ────────────────────────────────────────────────────────────
    if (sub === 'staffrole') {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) return message.reply('❌ Usage: `,staffsetup staffrole @role`');
      db.upsertStaffCheckinSettings(guildId, { staff_role_id: role.id });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Staff role set to ${role}.`)] });
    }

    // ── alertrole ────────────────────────────────────────────────────────────
    if (sub === 'alertrole') {
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
      if (!role) return message.reply('❌ Usage: `,staffsetup alertrole @role`');
      db.upsertStaffCheckinSettings(guildId, { alert_role_id: role.id });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Alert ping role set to ${role}. They will be mentioned if staff miss check-in.`)] });
    }

    // ── channel ──────────────────────────────────────────────────────────────
    if (sub === 'channel') {
      const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!ch) return message.reply('❌ Usage: `,staffsetup channel #channel`');
      db.upsertStaffCheckinSettings(guildId, { staff_channel_id: ch.id });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Check-in channel set to ${ch}.`)] });
    }

    // ── alertchannel ─────────────────────────────────────────────────────────
    if (sub === 'alertchannel') {
      const ch = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]);
      if (!ch) return message.reply('❌ Usage: `,staffsetup alertchannel #channel`');
      db.upsertStaffCheckinSettings(guildId, { alert_channel_id: ch.id });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Alert channel set to ${ch}.`)] });
    }

    // ── time ─────────────────────────────────────────────────────────────────
    if (sub === 'time') {
      const timeStr = args[1];
      if (!timeStr || !/^\d{1,2}:\d{2}$/.test(timeStr))
        return message.reply('❌ Usage: `,staffsetup time HH:MM` — e.g. `,staffsetup time 09:00`');
      const [hStr, mStr] = timeStr.split(':');
      const h = parseInt(hStr), m = parseInt(mStr);
      if (h < 0 || h > 23 || m < 0 || m > 59) return message.reply('❌ Invalid time. Hours 0–23, minutes 0–59.');
      db.upsertStaffCheckinSettings(guildId, { checkin_hour: h, checkin_minute: m });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Daily check-in will post at **${pad(h)}:${pad(m)}** every day.`)] });
    }

    // ── timezone ─────────────────────────────────────────────────────────────
    if (sub === 'timezone' || sub === 'tz') {
      const tz = args[1];
      if (!tz) {
        return message.reply([
          '❌ Usage: `,staffsetup timezone <timezone>`',
          'Examples: `UTC`, `America/New_York`, `America/Los_Angeles`, `Europe/London`, `Asia/Tokyo`',
          'Full list: <https://en.wikipedia.org/wiki/List_of_tz_database_time_zones>',
        ].join('\n'));
      }
      try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch {
        return message.reply(`❌ **${tz}** is not a valid timezone. Use an IANA name like \`America/New_York\` or \`Europe/London\`.`);
      }
      db.upsertStaffCheckinSettings(guildId, { timezone: tz });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Timezone set to **${tz}**. Check-in times will now use that timezone.`)] });
    }

    // ── deadline ─────────────────────────────────────────────────────────────
    if (sub === 'deadline') {
      const n = parseInt(args[1]);
      if (isNaN(n) || n < 1 || n > 23) return message.reply('❌ Deadline must be between 1 and 23 hours.');
      db.upsertStaffCheckinSettings(guildId, { deadline_hours: n });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Alert will fire **${n} hour${n !== 1 ? 's' : ''}** after the check-in message.`)] });
    }

    // ── enable ───────────────────────────────────────────────────────────────
    if (sub === 'enable' || sub === 'on') {
      const s = db.getStaffCheckinSettings(guildId);
      const missing = [];
      if (!s?.staff_role_id)   missing.push('`staffrole`');
      if (!s?.staff_channel_id) missing.push('`channel`');
      if (!s?.alert_channel_id) missing.push('`alertchannel`');
      if (missing.length) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
          .setDescription(`❌ Please configure ${missing.join(', ')} before enabling.`)] });
      }
      db.upsertStaffCheckinSettings(guildId, { enabled: 1 });
      const h = s.checkin_hour ?? 9, m = s.checkin_minute ?? 0, dl = s.deadline_hours ?? 4;
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(
          `✅ Staff check-in **enabled**!\n\n` +
          `📋 Check-in posts daily at **${pad(h)}:${pad(m)}** in <#${s.staff_channel_id}>\n` +
          `⚠️ Alert fires **${dl}h** later in <#${s.alert_channel_id}> for anyone who missed it.`,
        )] });
    }

    // ── disable ──────────────────────────────────────────────────────────────
    if (sub === 'disable' || sub === 'off') {
      db.upsertStaffCheckinSettings(guildId, { enabled: 0 });
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW)
        .setDescription('⚠️ Staff check-in **disabled**.')] });
    }

    // ── test ─────────────────────────────────────────────────────────────────
    if (sub === 'test') {
      const s = db.getStaffCheckinSettings(guildId);
      if (!s?.staff_channel_id || !s?.staff_role_id)
        return message.reply('❌ Set `staffrole` and `channel` first.');

      const ch = message.guild.channels.cache.get(s.staff_channel_id);
      if (!ch) return message.reply('❌ Check-in channel not found — re-set it with `,staffsetup channel #ch`.');

      const today = new Date().toISOString().slice(0, 10);
      const dl    = s.deadline_hours ?? 4;
      const sent  = await ch.send(buildCheckinMessage(guildId, s.staff_role_id, dl, today));
      db.upsertStaffCheckinSettings(guildId, { last_checkin_date: today, last_message_id: sent.id });

      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN)
        .setDescription(`✅ Test check-in message sent to ${ch}!`)] });
    }

    return message.reply('❌ Unknown subcommand. Run `,staffsetup` to see all options.');
  },
};

// ── ,checkins [date] ──────────────────────────────────────────────────────────
const checkins = {
  name: 'checkins',
  aliases: ['staffcheckins', 'attendance', 'whoCheckedIn'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
    }

    const guildId = message.guild.id;
    const s       = db.getStaffCheckinSettings(guildId);

    if (!s?.staff_role_id) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription('❌ Staff check-in is not set up. Run `,staffsetup` first.')] });
    }

    // Resolve date — default to today in guild's timezone
    let date;
    if (args[0]) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(args[0])) {
        date = args[0];
      } else {
        return message.reply('❌ Date must be `YYYY-MM-DD`, e.g. `,checkins 2026-05-29`');
      }
    } else {
      // Get "today" in the guild's configured timezone
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: s.timezone || 'UTC',
          year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(new Date());
        const get = t => parts.find(p => p.type === t)?.value ?? '00';
        date = `${get('year')}-${get('month')}-${get('day')}`;
      } catch {
        date = new Date().toISOString().slice(0, 10);
      }
    }

    // Fetch staff role members
    const staffRole = message.guild.roles.cache.get(s.staff_role_id);
    if (!staffRole) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED)
        .setDescription('❌ Configured staff role no longer exists.')] });
    }

    await message.guild.members.fetch().catch(() => {});
    const staffMembers = staffRole.members.filter(m => !m.user.bot);

    // Get check-in records for the date
    const records      = db.getStaffCheckins(guildId, date);
    const checkedInMap = new Map(records.map(r => [r.user_id, r.checked_in_at]));

    const inList  = [];
    const outList = [];

    for (const [, member] of staffMembers) {
      if (checkedInMap.has(member.id)) {
        // Format time in guild's timezone
        let timeStr = '—';
        try {
          const raw = checkedInMap.get(member.id);
          timeStr = new Intl.DateTimeFormat('en-US', {
            timeZone: s.timezone || 'UTC',
            hour: '2-digit', minute: '2-digit', hour12: false,
          }).format(new Date(raw));
        } catch {}
        inList.push(`<@${member.id}> — \`${timeStr}\``);
      } else {
        outList.push(`<@${member.id}>`);
      }
    }

    // Sort checked-in by time (already stored in order), missing alphabetically
    inList.sort();
    outList.sort();

    const total   = staffMembers.size;
    const inCount = inList.length;
    const outCount = outList.length;
    const pct     = total > 0 ? Math.round((inCount / total) * 100) : 0;
    const bar     = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));

    const embed = new EmbedBuilder()
      .setColor(outCount === 0 ? GREEN : outCount === total ? RED : YELLOW)
      .setTitle(`📋 Staff Attendance — ${date}`)
      .setDescription(`**${inCount}/${total}** checked in  \`${bar}\` ${pct}%`)
      .setFooter({ text: `Timezone: ${s.timezone || 'UTC'}` })
      .setTimestamp();

    if (inList.length) {
      embed.addFields({
        name: `✅ Checked In (${inCount})`,
        value: inList.join('\n').slice(0, 1024),
        inline: false,
      });
    }

    if (outList.length) {
      embed.addFields({
        name: `❌ Not Checked In (${outCount})`,
        value: outList.join('\n').slice(0, 1024),
        inline: false,
      });
    }

    if (!inList.length && !outList.length) {
      embed.setDescription('No staff members found with that role.');
    }

    await message.reply({ embeds: [embed] });
  },
};

// ── ,sendcheckin — manual on-demand check-in message ─────────────────────────
const sendcheckin = {
  name: 'sendcheckin',
  aliases: ['postcheckin', 'checkinpost'],
  async execute(message, args) {
    if (!isAdmin(message)) {
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Admin only.')] });
    }

    const guildId = message.guild.id;
    const s       = db.getStaffCheckinSettings(guildId);

    if (!s?.staff_channel_id || !s?.staff_role_id) {
      return message.reply('❌ Set up staff check-in first with `,staffsetup`.');
    }

    const ch = message.guild.channels.cache.get(s.staff_channel_id);
    if (!ch) return message.reply('❌ Check-in channel not found — re-set it with `,staffsetup channel #ch`.');

    // Delete the previous check-in message if it exists
    if (s.last_message_id) {
      const old = await ch.messages.fetch(s.last_message_id).catch(() => null);
      if (old) await old.delete().catch(() => {});
    }

    // Get today's date in the guild's timezone
    let today;
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: s.timezone || 'UTC',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const get = t => parts.find(p => p.type === t)?.value ?? '00';
      today = `${get('year')}-${get('month')}-${get('day')}`;
    } catch {
      today = new Date().toISOString().slice(0, 10);
    }

    const dl   = s.deadline_hours ?? 4;
    const sent = await ch.send(buildCheckinMessage(guildId, s.staff_role_id, dl, today));
    db.upsertStaffCheckinSettings(guildId, { last_checkin_date: today, last_message_id: sent.id });

    // Delete the invoking command message for a clean channel
    await message.delete().catch(() => {});
  },
};

module.exports = [staffsetup, checkins, sendcheckin];
