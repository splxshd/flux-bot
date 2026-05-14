'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require('discord.js');
const cron = require('node-cron');

process.on('unhandledRejection', err => console.error('[UnhandledRejection]', err));
process.on('uncaughtException', err => { console.error('[UncaughtException]', err); process.exit(1); });

// ensure data dir exists before requiring DB
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = require('./database');

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

// ─── Load prefix command modules ─────────────────────────────────────────────
const prefixDir = path.join(__dirname, 'prefix');
if (fs.existsSync(prefixDir)) {
  for (const file of fs.readdirSync(prefixDir).filter(f => f.endsWith('.js'))) {
    const cmds = require(path.join(prefixDir, file));
    for (const cmd of cmds) {
      client.prefixCommands.set(cmd.name, cmd);
      for (const alias of (cmd.aliases || [])) {
        client.prefixCommands.set(alias, cmd);
      }
    }
  }
}

// ─── Load slash command modules ───────────────────────────────────────────────
const slashDir = path.join(__dirname, 'slash');
for (const file of fs.readdirSync(slashDir).filter(f => f.endsWith('.js'))) {
  const mod = require(path.join(slashDir, file));
  const cmds = Array.isArray(mod) ? mod : Object.values(mod).flat();
  for (const cmd of cmds) {
    if (cmd && cmd.data && cmd.execute) {
      client.commands.set(cmd.data.name, cmd);
    }
  }
}

// ─── Load events ─────────────────────────────────────────────────────────────
const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'))) {
  require(path.join(eventsDir, file))(client);
}

// ─── Auto-deploy slash commands ───────────────────────────────────────────────
async function deploySlashCommands() {
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
}

// ─── Login ────────────────────────────────────────────────────────────────────
const { startApi } = require('./api');

client.login(process.env.BOT_TOKEN).then(async () => {
  console.log('[flux] Logged in. Deploying commands...');
  await deploySlashCommands().catch(e => console.error('[Deploy Error]', e));
  startCrons();
  startApi(client);
  console.log('[flux] Ready.');
});
