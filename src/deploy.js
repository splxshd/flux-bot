'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
const slashDir = path.join(__dirname, 'slash');
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

rest.put(route, { body: commands })
  .then(() => console.log(`[Deploy] Registered ${commands.length} slash commands.`))
  .catch(console.error);
