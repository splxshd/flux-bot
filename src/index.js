'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes,
        EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const cron = require('node-cron');

process.on('unhandledRejection', err => console.error('[UnhandledRejection]', err));
process.on('uncaughtException', err => { console.error('[UncaughtException]', err); process.exit(1); });

// ─── Graceful shutdown on SIGTERM (Railway zero-downtime deploys) ─────────────
// Railway sends SIGTERM to the old instance when a new deployment starts.
// Without this handler the process dies instantly without closing SQLite,
// leaving a journal/lock file that blocks the new instance from opening the DB.
process.on('SIGTERM', () => {
  console.log('[flux] SIGTERM received — closing database and exiting...');
  try { require('./database').closeDb(); } catch (_) {}
  process.exit(0);
});

// ─── Critical env var check ───────────────────────────────────────────────────
if (!process.env.BOT_TOKEN) {
  console.error('[FATAL] BOT_TOKEN env var is not set. Cannot start bot.');
  process.exit(1);
}
if (!process.env.CLIENT_ID) {
  console.warn('[WARN] CLIENT_ID env var is not set. Slash command deploy will be skipped.');
}

// ensure data dir exists before requiring DB
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ─── Start Express IMMEDIATELY so Railway health check passes ─────────────────
// This binds the port right now — before the DB opens — so /health responds
// during the non-blocking DB retry period and Railway doesn't kill us.
const { startServer, startApi } = require('./api');
startServer();

// ─── Discord client ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.Channel],
});

client.commands = new Collection();
client.prefixCommands = new Collection();

// ─── Slash command dirs (needed by deploy fn too) ─────────────────────────────
const slashDir = path.join(__dirname, 'slash');
const prefixDir = path.join(__dirname, 'prefix');

// ─── Auto-deploy slash commands ───────────────────────────────────────────────
async function deploySlashCommands() {
  if (!process.env.CLIENT_ID) {
    console.warn('[Deploy] Skipping slash command deploy — CLIENT_ID not set.');
    return;
  }
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  const commands = [];

  for (const file of fs.readdirSync(slashDir).filter(f => f.endsWith('.js'))) {
    const mod = require(path.join(slashDir, file));
    const cmds = Array.isArray(mod) ? mod : Object.values(mod).flat();
    for (const cmd of cmds) {
      if (cmd && cmd.data) commands.push(cmd.data.toJSON());
    }
  }

  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);

  await rest.put(route, { body: commands });
  console.log(`[Deploy] Registered ${commands.length} slash commands.`);
}

// ─── Cron jobs ────────────────────────────────────────────────────────────────
function startCrons() {
  const db = require('./database');

  // Every 1 minute: expire mutes, bans, temproles, giveaways
  cron.schedule('* * * * *', async () => {
    // Expired mutes
    const expiredMutes = db.getExpiredMutes();
    for (const row of expiredMutes) {
      try {
        const guild = client.guilds.cache.get(row.guild_id);
        if (!guild) continue;
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (member) {
          const muteRole = guild.roles.cache.find(r => r.name === 'Muted');
          if (muteRole) await member.roles.remove(muteRole).catch(() => {});
        }
        db.removeMute(row.guild_id, row.user_id);
      } catch (e) { console.error('[Cron:mute]', e); }
    }

    // Expired bans
    const expiredBans = db.getExpiredBans();
    for (const row of expiredBans) {
      try {
        const guild = client.guilds.cache.get(row.guild_id);
        if (!guild) continue;
        await guild.bans.remove(row.user_id).catch(() => {});
        db.removeBan(row.guild_id, row.user_id);
      } catch (e) { console.error('[Cron:ban]', e); }
    }

    // Expired temp roles
    const expiredTempRoles = db.getExpiredTempRoles();
    for (const row of expiredTempRoles) {
      try {
        const guild = client.guilds.cache.get(row.guild_id);
        if (!guild) continue;
        const member = await guild.members.fetch(row.user_id).catch(() => null);
        if (member) await member.roles.remove(row.role_id).catch(() => {});
        db.removeTempRole(row.id);
      } catch (e) { console.error('[Cron:temprole]', e); }
    }

    // Expired giveaways
    const expiredGiveaways = db.getExpiredGiveaways();
    for (const giveaway of expiredGiveaways) {
      try {
        const guild = client.guilds.cache.get(giveaway.guild_id);
        if (!guild) continue;
        const channel = guild.channels.cache.get(giveaway.channel_id);
        if (!channel) { db.endGiveaway(giveaway.id); continue; }
        const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
        let winners = [];
        if (message) {
          const reaction = message.reactions.cache.get('🎉');
          if (reaction) {
            const users = await reaction.users.fetch();
            const eligible = users.filter(u => !u.bot).map(u => u);
            for (let i = 0; i < Math.min(giveaway.winners, eligible.length); i++) {
              const idx = Math.floor(Math.random() * eligible.length);
              winners.push(eligible.splice(idx, 1)[0]);
            }
          }
        }
        db.endGiveaway(giveaway.id);
        if (winners.length > 0) {
          await channel.send(`🎉 Congratulations ${winners.map(w => `<@${w.id}>`).join(', ')}! You won **${giveaway.prize}**!`);
        } else {
          await channel.send(`😢 No valid entrants for **${giveaway.prize}**. The giveaway has ended.`);
        }
      } catch (e) { console.error('[Cron:giveaway]', e); }
    }
  });

  // Every 1 minute: staff daily check-in
  cron.schedule('* * * * *', async () => {
    const settings = db.getAllEnabledStaffCheckin();
    if (!settings.length) return;

    // Returns {hour, minute, today} in a given IANA timezone
    function tzTime(tz) {
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz || 'UTC',
          hour: 'numeric', minute: 'numeric',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour12: false,
        }).formatToParts(new Date());
        const get  = t => parts.find(p => p.type === t)?.value ?? '0';
        let hour   = parseInt(get('hour'));
        if (hour === 24) hour = 0; // Intl can return 24 for midnight
        const minute = parseInt(get('minute'));
        const today  = `${get('year')}-${get('month')}-${get('day')}`;
        return { hour, minute, today };
      } catch {
        const n = new Date();
        return { hour: n.getUTCHours(), minute: n.getUTCMinutes(), today: n.toISOString().slice(0, 10) };
      }
    }

    for (const s of settings) {
      const { hour: HH, minute: MM, today } = tzTime(s.timezone || 'UTC');
      const pad = n => String(n).padStart(2, '0');
      try {
        // ── Send daily check-in message ──────────────────────────────────
        const cH = s.checkin_hour ?? 9;
        const cM = s.checkin_minute ?? 0;
        if (HH === cH && MM === cM && s.last_checkin_date !== today) {
          const ch = client.channels.cache.get(s.staff_channel_id);
          if (!ch) continue;

          const dl    = s.deadline_hours ?? 4;
          const greet = HH < 12 ? 'morning' : HH < 18 ? 'afternoon' : 'evening';
          const row   = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`staff_checkin:${s.guild_id}:${today}`)
              .setLabel('Check In')
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅'),
          );
          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📋 Daily Staff Check-in')
            .setDescription(`Good ${greet}! Please confirm your attendance for today.\nClick the button below to check in.`)
            .setTimestamp()
            .setFooter({ text: `You have ${dl} hour${dl !== 1 ? 's' : ''} to check in` });

          await ch.send({
            content: `<@&${s.staff_role_id}>`,
            embeds: [embed],
            components: [row],
            allowedMentions: { roles: [s.staff_role_id] },
          });
          db.upsertStaffCheckinSettings(s.guild_id, { last_checkin_date: today });
        }

        // ── Send missed-checkin alert ────────────────────────────────────
        const alertTotal = (s.checkin_hour ?? 9) * 60 + (s.checkin_minute ?? 0) + (s.deadline_hours ?? 4) * 60;
        const alertH = Math.floor(alertTotal / 60) % 24;
        const alertM = alertTotal % 60;

        if (HH === alertH && MM === alertM && s.last_checkin_date === today && s.last_alert_date !== today) {
          // Mark alert sent first to prevent double-send on any error
          db.upsertStaffCheckinSettings(s.guild_id, { last_alert_date: today });

          const guild = client.guilds.cache.get(s.guild_id);
          if (!guild) continue;
          const staffRole = guild.roles.cache.get(s.staff_role_id);
          if (!staffRole) continue;

          await guild.members.fetch().catch(() => {});
          const checkins     = db.getStaffCheckins(s.guild_id, today);
          const checkedInIds = new Set(checkins.map(c => c.user_id));
          const missing      = staffRole.members.filter(m => !m.user.bot && !checkedInIds.has(m.id));
          if (!missing.size) continue;

          const alertCh = client.channels.cache.get(s.alert_channel_id);
          if (!alertCh) continue;

          const mentionList = missing.map(m => `<@${m.id}>`).join('\n');
          const checkedIn   = checkins.length;
          const total       = staffRole.members.filter(m => !m.user.bot).size;

          const embed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('⚠️ Staff Check-in Alert')
            .setDescription(
              `**${missing.size}** staff member${missing.size !== 1 ? 's have' : ' has'} not checked in today.\n` +
              `*(${checkedIn}/${total} checked in)*`,
            )
            .addFields({ name: 'Missing', value: mentionList.slice(0, 1024), inline: false })
            .setTimestamp()
            .setFooter({ text: `Check-in was at ${pad(s.checkin_hour ?? 9)}:${pad(s.checkin_minute ?? 0)}` });

          await alertCh.send({
            content: s.alert_role_id ? `<@&${s.alert_role_id}>` : undefined,
            embeds: [embed],
            allowedMentions: s.alert_role_id ? { roles: [s.alert_role_id] } : { parse: [] },
          });
        }
      } catch (e) { console.error('[Cron:staffcheckin]', e); }
    }
  });

  // Every 2 minutes: deposit monitors
  cron.schedule('*/2 * * * *', async () => {
    const axios = require('axios');
    const monitors = db.getActiveDepositMonitors();
    for (const monitor of monitors) {
      try {
        let currentBalance = 0;
        if (monitor.coin === 'LTC') {
          const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${monitor.address}/balance${process.env.BLOCKCYPHER_TOKEN ? `?token=${process.env.BLOCKCYPHER_TOKEN}` : ''}`;
          const res = await axios.get(url, { timeout: 8000 }).catch(() => null);
          if (res) currentBalance = (res.data.balance || 0) / 1e8;
        }
        if (currentBalance > monitor.last_balance) {
          const user = await client.users.fetch(monitor.user_id).catch(() => null);
          if (user) {
            await user.send(`💰 Deposit detected! **+${(currentBalance - monitor.last_balance).toFixed(8)} ${monitor.coin}** received at \`${monitor.address}\``).catch(() => {});
          }
          if (monitor.channel_id) {
            const ch = client.channels.cache.get(monitor.channel_id);
            if (ch) await ch.send(`💰 <@${monitor.user_id}> deposit confirmed: **+${(currentBalance - monitor.last_balance).toFixed(8)} ${monitor.coin}**`).catch(() => {});
          }
          db.markDepositNotified(monitor.id);
        }
        db.updateDepositMonitor(monitor.id, currentBalance);
      } catch (e) { console.error('[Cron:deposit]', e); }
    }
  });

  // Every 30 seconds: finalise expired auctions
  cron.schedule('* * * * * *', async () => {
    // Only run every 30 seconds (cron min resolution is 1 min, use seconds cron)
    if (new Date().getSeconds() !== 0 && new Date().getSeconds() !== 30) return;
    try {
      const { finaliseAuction } = require('./prefix/auction');
      const expired = db.getExpiredAuctions();
      for (const a of expired) {
        try { await finaliseAuction(a, client); } catch (e) { console.error('[Cron:auction]', e); }
      }
    } catch (e) { console.error('[Cron:auction:load]', e); }
  });
}

// ─── Async startup ────────────────────────────────────────────────────────────
(async () => {
  // 1. Wait for DB — uses non-blocking setTimeout retries so the event loop
  //    stays free to serve the /health endpoint during this period.
  console.log('[flux] Opening database...');
  await require('./database')._dbReady;
  console.log('[flux] Database ready.');

  // 2. Finish API setup (registers 2 extra tables + member-count route)
  startApi(client);

  // 3. Load prefix command modules
  console.log('[flux] Loading prefix commands...');
  if (fs.existsSync(prefixDir)) {
    for (const file of fs.readdirSync(prefixDir).filter(f => f.endsWith('.js'))) {
      const mod  = require(path.join(prefixDir, file));
      // Support both plain arrays and { commands: [...] } exports (e.g. auction.js)
      const cmds = Array.isArray(mod) ? mod : (Array.isArray(mod.commands) ? mod.commands : []);
      for (const cmd of cmds) {
        client.prefixCommands.set(cmd.name, cmd);
        for (const alias of (cmd.aliases || [])) {
          client.prefixCommands.set(alias, cmd);
        }
      }
    }
  }

  // 4. Load slash command modules
  console.log('[flux] Loading slash commands...');
  for (const file of fs.readdirSync(slashDir).filter(f => f.endsWith('.js'))) {
    const mod = require(path.join(slashDir, file));
    const cmds = Array.isArray(mod) ? mod : Object.values(mod).flat();
    for (const cmd of cmds) {
      if (cmd && cmd.data && cmd.execute) {
        client.commands.set(cmd.data.name, cmd);
      }
    }
  }

  // 5. Load events
  console.log('[flux] Loading events...');
  const eventsDir = path.join(__dirname, 'events');
  for (const file of fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'))) {
    require(path.join(eventsDir, file))(client);
  }
  console.log('[flux] All modules loaded.');

  // 6. Ready handler
  client.once('ready', () => {
    startCrons();
    console.log(`[flux] Bot ready. In ${client.guilds.cache.size} guilds.`);
  });

  // 7. Login
  console.log('[flux] Attempting Discord login...');
  client.login(process.env.BOT_TOKEN)
    .then(async () => {
      console.log('[flux] Logged in successfully. Deploying commands...');
      await deploySlashCommands().catch(e => console.error('[Deploy Error]', e));
    })
    .catch(err => {
      console.error('[FATAL] Discord login failed:', err.message);
      process.exit(1);
    });

})().catch(err => {
  console.error('[FATAL] Startup error:', err);
  process.exit(1);
});
