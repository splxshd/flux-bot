'use strict';

const { PermissionFlagsBits } = require('discord.js');

async function ensureMuteRole(guild) {
  let muteRole = guild.roles.cache.find(r => r.name === 'Muted');
  if (!muteRole) {
    muteRole = await guild.roles.create({
      name: 'Muted',
      color: '#818386',
      reason: 'Auto-created Muted role for flux bot',
    });
  }

  const deny = [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.Speak,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.CreatePrivateThreads,
    PermissionFlagsBits.UseApplicationCommands,
  ];

  const applyOverwrite = async (channel) => {
    await channel.permissionOverwrites.edit(muteRole, {
      SendMessages: false,
      AddReactions: false,
      Speak: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      UseApplicationCommands: false,
    }).catch(() => {});
  };

  for (const [, channel] of guild.channels.cache) {
    await applyOverwrite(channel);
  }

  return muteRole;
}

async function applyMuteOverwriteToChannel(guild, channel) {
  const muteRole = guild.roles.cache.find(r => r.name === 'Muted');
  if (!muteRole) return;
  await channel.permissionOverwrites.edit(muteRole, {
    SendMessages: false,
    AddReactions: false,
    Speak: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    UseApplicationCommands: false,
  }).catch(() => {});
}

module.exports = { ensureMuteRole, applyMuteOverwriteToChannel };
