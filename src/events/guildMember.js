'use strict';

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../database');
const { generateWelcomeCard } = require('../utils/welcomeCard');

// In-memory join tracker for anti-raid
const joinTracker = new Map(); // guildId -> [timestamps]

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    const guild = member.guild;

    // 1. Autoping
    const autopings = db.getAutopings(guild.id).filter(a => a.enabled);
    for (const ap of autopings) {
      const ch = guild.channels.cache.get(ap.channel_id);
      if (!ch) continue;
      ch.send(`<@${member.id}>`).then(msg => {
        if (ap.delete_after > 0) {
          setTimeout(() => msg.delete().catch(() => {}), ap.delete_after * 1000);
        }
      }).catch(() => {});
    }

    // 2. Welcome message (canvas card + optional text)
    const welcome = db.getWelcomeSettings(guild.id);
    if (welcome && welcome.enabled && welcome.channel_id) {
      const wCh = guild.channels.cache.get(welcome.channel_id);
      if (wCh) {
        const replace = (str) => {
          if (!str) return '';
          return str
            .replace(/{user}/g, member.user.tag)
            .replace(/{mention}/g, `<@${member.id}>`)
            .replace(/{server}/g, guild.name)
            .replace(/{count}/g, guild.memberCount.toString());
        };

        // Try canvas welcome card first
        try {
          const buffer = await generateWelcomeCard({
            username:    member.user.username,
            avatarUrl:   member.user.displayAvatarURL({ extension: 'png', size: 256 }),
            memberCount: guild.memberCount,
            guildName:   guild.name,
          });
          const attachment = new AttachmentBuilder(buffer, { name: 'welcome.png' });
          // Optional text above the card (description field used as welcome text)
          const text = welcome.description ? replace(welcome.description) : `Welcome <@${member.id}>! 🎉`;
          wCh.send({ content: text, files: [attachment] }).catch(() => {});
        } catch (e) {
          console.error('[welcomeCard]', e);
          // Fallback embed
          const embed = new EmbedBuilder()
            .setTitle(replace(welcome.title) || 'Welcome!')
            .setDescription(replace(welcome.description) || `Welcome <@${member.id}>!`)
            .setColor(welcome.color || '#5865F2');
          if (welcome.footer) embed.setFooter({ text: replace(welcome.footer) });
          if (welcome.image_url) embed.setImage(welcome.image_url);
          if (welcome.thumbnail) embed.setThumbnail(member.user.displayAvatarURL());
          wCh.send({ embeds: [embed] }).catch(() => {});
        }
      }
    }

    // 2b. Auto-role — give configured roles to every new member
    const autoroles = db.getAutoroles(guild.id);
    for (const { role_id } of autoroles) {
      await member.roles.add(role_id).catch(() => {});
    }

    // 3. Role persist restore
    const saved = db.getSavedRoles(guild.id, member.id);
    if (saved) {
      const roles = JSON.parse(saved.roles || '[]');
      for (const roleId of roles) {
        await member.roles.add(roleId).catch(() => {});
      }
    }

    // 4. Forced nickname
    const fn = db.getForcedNickname(guild.id, member.id);
    if (fn) await member.setNickname(fn.nickname).catch(() => {});

    // 5. Anti-raid join detection
    const antiraid = db.getAntiraid(guild.id);
    if (antiraid && antiraid.enabled) {
      const now = Date.now();
      if (!joinTracker.has(guild.id)) joinTracker.set(guild.id, []);
      const arr = joinTracker.get(guild.id);
      arr.push(now);
      const windowMs = antiraid.join_window * 1000;
      const recent = arr.filter(t => now - t <= windowMs);
      joinTracker.set(guild.id, recent);

      if (recent.length >= antiraid.join_threshold) {
        joinTracker.set(guild.id, []);
        const recentMembers = await guild.members.fetch({ limit: antiraid.join_threshold }).catch(() => null);
        if (recentMembers) {
          for (const [, m] of recentMembers) {
            const joinedAt = m.joinedTimestamp;
            if (joinedAt && now - joinedAt <= windowMs) {
              if (antiraid.action === 'ban') await m.ban({ reason: 'Anti-raid' }).catch(() => {});
              else if (antiraid.action === 'kick') await m.kick('Anti-raid').catch(() => {});
              else if (antiraid.action === 'timeout') await m.timeout(10 * 60 * 1000, 'Anti-raid').catch(() => {});
            }
          }
        }
        if (antiraid.log_channel) {
          const logCh = guild.channels.cache.get(antiraid.log_channel);
          if (logCh) logCh.send(`⚠️ **Anti-Raid triggered!** ${recent.length} joins in ${antiraid.join_window}s. Action: **${antiraid.action}**`).catch(() => {});
        }
      }
    }
  });

  client.on('guildMemberRemove', async (member) => {
    // Save roles for role persist
    const roleIds = member.roles.cache
      .filter(r => r.id !== member.guild.id)
      .map(r => r.id);
    if (roleIds.length > 0) db.saveRoles(member.guild.id, member.id, roleIds);

    // Log leave
    const settings = db.getGuildSettings(member.guild.id);
    if (!settings || !settings.log_channel) return;
    const logCh = member.guild.channels.cache.get(settings.log_channel);
    if (!logCh) return;

    const embed = new EmbedBuilder()
      .setTitle('Member Left')
      .setColor(settings.log_color || '#ED4245')
      .setDescription(`**${member.user.tag}** (${member.id}) has left the server.`)
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    logCh.send({ embeds: [embed] }).catch(() => {});
  });

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Enforce forced nicknames
    const fn = db.getForcedNickname(newMember.guild.id, newMember.id);
    if (fn && newMember.nickname !== fn.nickname) {
      await newMember.setNickname(fn.nickname).catch(() => {});
    }

    // Log role changes
    const settings = db.getGuildSettings(newMember.guild.id);
    if (!settings || !settings.log_channel) return;
    const logCh = newMember.guild.channels.cache.get(settings.log_channel);
    if (!logCh) return;

    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

    if (addedRoles.size === 0 && removedRoles.size === 0) return;

    const embed = new EmbedBuilder()
      .setTitle('Roles Updated')
      .setColor(settings.log_color || '#5865F2')
      .setDescription(`**${newMember.user.tag}** (${newMember.id})`)
      .setTimestamp();

    if (addedRoles.size > 0) embed.addFields({ name: 'Roles Added', value: addedRoles.map(r => r.toString()).join(', ') });
    if (removedRoles.size > 0) embed.addFields({ name: 'Roles Removed', value: removedRoles.map(r => r.toString()).join(', ') });

    logCh.send({ embeds: [embed] }).catch(() => {});
  });
};
