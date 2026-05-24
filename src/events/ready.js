'use strict';

const db = require('../database');
const { processGiveawayEnd } = require('../utils/giveawayHelpers');

module.exports = (client) => {
  client.once('ready', async () => {
    console.log(`[flux] Logged in as ${client.user.tag}`);
    client.user.setPresence({ activities: [{ name: '/help' }], status: 'online' });

    // Economy rig map  { userId -> { game, outcome } }
    client.ecoRigs = new Map();

    // Seed invite cache for all guilds
    client.inviteCache = new Map();
    for (const [, guild] of client.guilds.cache) {
      try {
        const invites = await guild.invites.fetch();
        client.inviteCache.set(guild.id, new Map(invites.map(i => [i.code, i.uses])));
      } catch (_) {}
    }

    // Check for expired giveaways every 30 seconds
    setInterval(async () => {
      try {
        const expired = db.getExpiredGiveaways();
        for (const giveaway of expired) {
          db.endGiveaway(giveaway.id); // mark ended immediately to prevent double-processing
          await processGiveawayEnd(client, giveaway);
        }
      } catch (e) {
        console.error('[GiveawayExpiry]', e);
      }
    }, 30_000);
  });
};
