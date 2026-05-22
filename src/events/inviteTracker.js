'use strict';

module.exports = (client) => {
  // New invite created — add to cache
  client.on('inviteCreate', invite => {
    if (!invite.guild) return;
    if (!client.inviteCache) client.inviteCache = new Map();
    const cache = client.inviteCache.get(invite.guild.id) || new Map();
    cache.set(invite.code, invite.uses ?? 0);
    client.inviteCache.set(invite.guild.id, cache);
  });

  // Invite deleted — remove from cache
  client.on('inviteDelete', invite => {
    if (!invite.guild) return;
    const cache = client.inviteCache?.get(invite.guild.id);
    if (cache) cache.delete(invite.code);
  });

  // Bot joins a new guild — seed that guild's cache
  client.on('guildCreate', async guild => {
    try {
      const invites = await guild.invites.fetch();
      if (!client.inviteCache) client.inviteCache = new Map();
      client.inviteCache.set(guild.id, new Map(invites.map(i => [i.code, i.uses])));
    } catch (_) {}
  });
};
