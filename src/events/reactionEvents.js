'use strict';

const db = require('../database');

module.exports = (client) => {
  client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (!reaction.message.guild) return;

    const guild = reaction.message.guild;
    const emoji = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    const row = db.getReactionMessage(guild.id, reaction.message.id, emoji);
    if (!row) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    await member.roles.add(row.role_id).catch(() => {});
  });

  client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (!reaction.message.guild) return;

    const guild = reaction.message.guild;
    const emoji = reaction.emoji.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji.name;
    const row = db.getReactionMessage(guild.id, reaction.message.id, emoji);
    if (!row) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    await member.roles.remove(row.role_id).catch(() => {});
  });
};
