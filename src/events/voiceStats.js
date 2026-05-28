'use strict';

const db = require('../database');

// Track when each user joined VC so we can calculate minutes on leave
// key: `${guildId}-${userId}` -> joinTimestamp (ms)
const voiceJoinTimes = new Map();

module.exports = (client) => {
  client.on('voiceStateUpdate', (oldState, newState) => {
    const userId  = newState.member?.id || oldState.member?.id;
    const guildId = newState.guild?.id  || oldState.guild?.id;
    if (!userId || !guildId) return;

    // Skip bots
    const member = newState.member || oldState.member;
    if (member?.user?.bot) return;

    const joined = !oldState.channelId && newState.channelId;
    const left   = oldState.channelId  && !newState.channelId;
    const moved  = oldState.channelId  && newState.channelId && oldState.channelId !== newState.channelId;

    const key = `${guildId}-${userId}`;

    if (joined) {
      db.trackVoiceJoin(guildId, userId);
      voiceJoinTimes.set(key, Date.now());
    } else if (left) {
      db.trackVoiceLeave(guildId, userId);
      // Award voice credits
      const joinedAt = voiceJoinTimes.get(key);
      voiceJoinTimes.delete(key);
      if (joinedAt) {
        try {
          const cs = db.getCreditSettings(guildId);
          if (cs.voice_credits > 0) {
            const minutes = Math.floor((Date.now() - joinedAt) / 60000);
            if (minutes >= 1) {
              db.addCredits(guildId, userId, cs.voice_credits * minutes);
            }
          }
        } catch (_) {}
      }
    } else if (moved) {
      db.trackVoiceLeave(guildId, userId);
      db.trackVoiceJoin(guildId, userId);
      // Award credits for time in old channel, reset timer for new channel
      const joinedAt = voiceJoinTimes.get(key);
      voiceJoinTimes.set(key, Date.now());
      if (joinedAt) {
        try {
          const cs = db.getCreditSettings(guildId);
          if (cs.voice_credits > 0) {
            const minutes = Math.floor((Date.now() - joinedAt) / 60000);
            if (minutes >= 1) {
              db.addCredits(guildId, userId, cs.voice_credits * minutes);
            }
          }
        } catch (_) {}
      }
    }
  });
};
