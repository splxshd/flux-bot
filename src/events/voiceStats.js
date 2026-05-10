'use strict';

const db = require('../database');

module.exports = (client) => {
  client.on('voiceStateUpdate', (oldState, newState) => {
    const userId  = newState.member?.id || oldState.member?.id;
    const guildId = newState.guild?.id  || oldState.guild?.id;
    if (!userId || !guildId) return;

    const joined = !oldState.channelId && newState.channelId;
    const left   = oldState.channelId  && !newState.channelId;
    const moved  = oldState.channelId  && newState.channelId && oldState.channelId !== newState.channelId;

    if (joined) db.trackVoiceJoin(guildId, userId);
    else if (left) db.trackVoiceLeave(guildId, userId);
    else if (moved) {
      db.trackVoiceLeave(guildId, userId);
      db.trackVoiceJoin(guildId, userId);
    }
  });
};
