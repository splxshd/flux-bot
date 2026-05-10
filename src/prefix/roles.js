'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';

function hasPerm(member, perm) {
  return member.permissions.has(perm);
}

// ── ,role ────────────────────────────────────────────────────────────────────
const role = {
  name: 'role',
  aliases: ['r'],
  async execute(message, args) {
    if (!hasPerm(message.member, PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });

    const sub = args[0]?.toLowerCase();

    // ,role create <name> [color]
    if (sub === 'create') {
      const name = args.slice(1).join(' ').replace(/#[0-9a-fA-F]{6}$/, '').trim();
      const colorMatch = args.join(' ').match(/#([0-9a-fA-F]{6})/);
      if (!name) return message.reply('Usage: `,role create <name> [#hex]`');
      const newRole = await message.guild.roles.create({
        name, color: colorMatch ? parseInt(colorMatch[1], 16) : 0,
        reason: `Created by ${message.author.tag}`
      }).catch(() => null);
      if (!newRole) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Failed to create role.')] });
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Created role **${newRole.name}** (<@&${newRole.id}>)`)] });
    }

    // ,role delete <role>
    if (sub === 'delete') {
      const target = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.slice(1).join(' ').toLowerCase());
      if (!target) return message.reply('Usage: `,role delete <@role or name>`');
      const name = target.name;
      await target.delete(`Deleted by ${message.author.tag}`).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Deleted role **${name}**.`)] });
    }

    // ,role rename <role> <name>
    if (sub === 'rename') {
      const target = message.mentions.roles.first();
      const newName = args.slice(2).join(' ');
      if (!target || !newName) return message.reply('Usage: `,role rename <@role> <new name>`');
      await target.setName(newName, `Renamed by ${message.author.tag}`).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Renamed role to **${newName}**.`)] });
    }

    // ,role hoist <role>
    if (sub === 'hoist') {
      const target = message.mentions.roles.first();
      if (!target) return message.reply('Usage: `,role hoist <@role>`');
      await target.setHoist(!target.hoist, `Hoisted by ${message.author.tag}`).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Role **${target.name}** is now ${target.hoist ? '**displayed separately**' : '**no longer displayed separately**'}.`)] });
    }

    // ,role <@user> <@role> — add/remove
    const member = message.mentions.members.first();
    const targetRole = message.mentions.roles.first();
    if (!member || !targetRole) return message.reply('Usage: `,role <@user> <@role>` — toggles the role');

    if (member.roles.cache.has(targetRole.id)) {
      await member.roles.remove(targetRole).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`🔴 Removed **${targetRole.name}** from **${member.user.username}**.`)] });
    } else {
      await member.roles.add(targetRole).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Added **${targetRole.name}** to **${member.user.username}**.`)] });
    }
  }
};

// ── ,roles ───────────────────────────────────────────────────────────────────
const roles = {
  name: 'roles',
  aliases: ['rolelist'],
  async execute(message) {
    const list = [...message.guild.roles.cache.values()]
      .filter(r => r.id !== message.guild.id)
      .sort((a, b) => b.position - a.position);
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `${message.guild.name} — Roles (${list.length})` })
      .setDescription(list.slice(0, 40).map(r => `<@&${r.id}>`).join(' ') + (list.length > 40 ? ` +${list.length - 40} more` : ''))
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,inrole ──────────────────────────────────────────────────────────────────
const inrole = {
  name: 'inrole',
  aliases: ['rolemembers', 'whohas'],
  async execute(message, args) {
    const target = message.mentions.roles.first()
      || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.join(' ').toLowerCase());
    if (!target) return message.reply('Usage: `,inrole <@role or name>`');
    await message.guild.members.fetch().catch(() => {});
    const members = target.members;
    const embed = new EmbedBuilder()
      .setColor(BLUE)
      .setAuthor({ name: `Members with ${target.name} (${members.size})` })
      .setDescription(members.size
        ? [...members.values()].slice(0, 30).map(m => `<@${m.id}>`).join(' ') + (members.size > 30 ? ` +${members.size - 30} more` : '')
        : 'No members have this role.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,roleall ─────────────────────────────────────────────────────────────────
const roleall = {
  name: 'roleall',
  aliases: ['massrole'],
  async execute(message, args) {
    if (!hasPerm(message.member, PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });

    const sub = args[0]?.toLowerCase();

    let targetRole = message.mentions.roles.first();

    if (sub === 'humans' && args[1]) {
      const action = args[1]?.toLowerCase();
      targetRole = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.slice(2).join(' ').toLowerCase());
      if (!targetRole) return message.reply('Usage: `,roleall humans <add/remove> <@role>`');
      await message.guild.members.fetch().catch(() => {});
      const humans = message.guild.members.cache.filter(m => !m.user.bot);
      const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`⏳ Processing ${humans.size} members...`)] });
      let done = 0;
      for (const [, m] of humans) {
        if (action === 'add') await m.roles.add(targetRole).catch(() => {});
        else await m.roles.remove(targetRole).catch(() => {});
        done++;
      }
      return msg.edit({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ ${action === 'add' ? 'Added' : 'Removed'} **${targetRole.name}** for **${done}** humans.`)] });
    }

    if (sub === 'bots' && args[1]) {
      const action = args[1]?.toLowerCase();
      targetRole = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name.toLowerCase() === args.slice(2).join(' ').toLowerCase());
      if (!targetRole) return message.reply('Usage: `,roleall bots <add/remove> <@role>`');
      await message.guild.members.fetch().catch(() => {});
      const bots = message.guild.members.cache.filter(m => m.user.bot);
      for (const [, m] of bots) {
        if (action === 'add') await m.roles.add(targetRole).catch(() => {});
        else await m.roles.remove(targetRole).catch(() => {});
      }
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ ${action === 'add' ? 'Added' : 'Removed'} **${targetRole.name}** for **${bots.size}** bots.`)] });
    }

    if (!targetRole) return message.reply('Usage: `,roleall <@role>` — gives role to all members');
    await message.guild.members.fetch().catch(() => {});
    const all = message.guild.members.cache;
    const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`⏳ Adding role to **${all.size}** members...`)] });
    for (const [, m] of all) await m.roles.add(targetRole).catch(() => {});
    return msg.edit({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Added **${targetRole.name}** to **${all.size}** members.`)] });
  }
};

// ── ,rrs ─────────────────────────────────────────────────────────────────────
const rrs = {
  name: 'rrs',
  aliases: ['restore', 'restoroles'],
  async execute(message, args) {
    if (!hasPerm(message.member, PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const embed = new EmbedBuilder().setColor(YELLOW)
      .setDescription('ℹ️ Role restore requires saved role data in the database. This feature is not yet fully configured.')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,reactionrole ────────────────────────────────────────────────────────────
const reactionrole = {
  name: 'reactionrole',
  aliases: ['rr'],
  async execute(message, args) {
    if (!hasPerm(message.member, PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });

    const sub = args[0]?.toLowerCase();
    const embed = new EmbedBuilder().setColor(BLUE)
      .setAuthor({ name: 'Reaction Roles' })
      .setDescription(
        sub === 'add'    ? '✅ Usage: `,rr add <message_id> <emoji> <@role>`\nReact to the message to link it.' :
        sub === 'remove' ? '🗑️ Usage: `,rr remove <message_id> <emoji>`' :
        sub === 'list'   ? 'ℹ️ Reaction role list requires database integration.' :
        sub === 'reset'  ? '⚠️ Usage: `,rr reset` — clears all reaction roles.' :
        '**Subcommands:** `add`, `remove`, `removeall`, `list`, `reset`'
      )
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

// ── ,buttonrole ──────────────────────────────────────────────────────────────
const buttonrole = {
  name: 'buttonrole',
  aliases: ['br_role'],
  async execute(message, args) {
    if (!hasPerm(message.member, PermissionFlagsBits.ManageRoles))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Roles** permission.')] });
    const embed = new EmbedBuilder().setColor(BLUE)
      .setAuthor({ name: 'Button Roles' })
      .setDescription('**Subcommands:** `add`, `remove`, `removeall`, `list`, `reset`\n\nUsage: `,buttonrole add <message> <@role> [emoji] [label]`')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

module.exports = [role, roles, inrole, roleall, rrs, reactionrole, buttonrole];
