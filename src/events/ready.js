'use strict';

module.exports = (client) => {
  client.once('ready', () => {
    console.log(`[flux] Logged in as ${client.user.tag}`);
    client.user.setPresence({ activities: [{ name: '/help' }], status: 'online' });
  });
};
