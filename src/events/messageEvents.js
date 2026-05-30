'use strict';

const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const db = require('../database');

module.exports = (client) => {

  // ── Message deleted ──────────────────────────────────────────────────────────
  client.on('messageDelete', async (message) => {
    // Partial messages (not cached) can't be fetched after deletion — skip if author unknown
    if (message.partial) return;
    if (!message.guild || message.author?.bot) return;

    const content = message.content || '[no text content]';
    db.setSnipe(
      message.guild.id, message.channel.id, content,
      message.author?.id ?? null, message.author?.tag ?? null,
      message.author?.displayAvatarURL() ?? null, 'delete'
    );

    const settings = db.getGuildSettings(message.guild.id);
    if (!settings?.log_channel) return;
    const logCh = message.guild.channels.cache.get(settings.log_channel);
    if (!logCh) return;

    // Collect attachments
    const attachments = message.attachments ? [...message.attachments.values()] : [];
    const imageExts   = /\.(png|jpg|jpeg|webp|gif|bmp|svg)(\?|$)/i;
    const images      = attachments.filter(a => imageExts.test(a.url));
    const otherFiles  = attachments.filter(a => !imageExts.test(a.url));

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: `${message.author?.tag || 'Unknown'} — message deleted`, iconURL: message.author?.displayAvatarURL() })
      .addFields(
        { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
        { name: '🆔 Message ID', value: message.id, inline: true },
        { name: '📝 Content', value: (message.content || '*[no text]*').slice(0, 1024) },
      )
      .setThumbnail(message.author?.displayAvatarURL())
      .setFooter({ text: `User ID: ${message.author?.id}` })
      .setTimestamp();

    // Show first image inside the embed
    if (images.length > 0) {
      embed.setImage(images[0].url);
    }

    // List extra images / files as links
    const extraImages = images.slice(1);
    if (extraImages.length > 0) {
      embed.addFields({ name: `🖼️ More images (${extraImages.length})`, value: extraImages.map(a => a.url).join('\n').slice(0, 1024) });
    }
    if (otherFiles.length > 0) {
      embed.addFields({ name: `📎 Attachments (${otherFiles.length})`, value: otherFiles.map(a => `[${a.name}](${a.url})`).join('\n').slice(0, 1024) });
    }

    logCh.send({ embeds: [embed] }).catch(() => {});
  });

  // ── Message edited ───────────────────────────────────────────────────────────
  client.on('messageUpdate', async (oldMsg, newMsg) => {
    // Fetch partials so we always have full author + content data
    try {
      if (newMsg.partial) newMsg = await newMsg.fetch();
      if (oldMsg.partial) oldMsg = await oldMsg.fetch().catch(() => oldMsg);
    } catch { return; }

    // Use newMsg.author as fallback — same user either way
    const author = oldMsg.author ?? newMsg.author;
    if (!newMsg.guild || author?.bot) return;
    if (oldMsg.content === newMsg.content) return;

    db.setSnipe(
      oldMsg.guild.id, oldMsg.channel.id,
      oldMsg.content || '[no text]',
      author?.id ?? null, author?.tag ?? null,
      author?.displayAvatarURL() ?? null, 'edit'
    );

    const settings = db.getGuildSettings(newMsg.guild.id);
    if (!settings?.log_channel) return;
    const logCh = newMsg.guild.channels.cache.get(settings.log_channel);
    if (!logCh) return;

    const embed = new EmbedBuilder()
      .setColor('#FEE75C')
      .setAuthor({ name: `${author?.tag || author?.username || 'Unknown'} — message edited`, iconURL: author?.displayAvatarURL() })
      .addFields(
        { name: '📍 Channel', value: `<#${newMsg.channel.id}>`, inline: true },
        { name: '🔗 Jump', value: `[View message](${newMsg.url})`, inline: true },
        { name: '📝 Before', value: (oldMsg.content || '*[not cached]*').slice(0, 512) },
        { name: '✏️ After',  value: (newMsg.content || '*empty*').slice(0, 512) },
      )
      .setThumbnail(author?.displayAvatarURL())
      .setFooter({ text: `User ID: ${author?.id ?? 'unknown'}` })
      .setTimestamp();

    logCh.send({ embeds: [embed] }).catch(() => {});
  });

  // ── Member joined ────────────────────────────────────────────────────────────
  client.on('guildMemberAdd', async (member) => {
    const settings = db.getGuildSettings(member.guild.id);
    if (!settings?.log_channel) return;
    const logCh = member.guild.channels.cache.get(settings.log_channel);
    if (!logCh) return;

    const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setAuthor({ name: `${member.user.tag} joined the server`, iconURL: member.user.displayAvatarURL() })
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: '👤 User', value: `${member}`, inline: true },
        { name: '🆔 ID', value: member.id, inline: true },
        { name: '📅 Account Age', value: `${accountAge} day(s)`, inline: true },
        { name: '📥 Joined', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
        { name: '👥 Member Count', value: `${member.guild.memberCount}`, inline: true },
      )
      .setFooter({ text: `User ID: ${member.id}` })
      .setTimestamp();

    logCh.send({ embeds: [embed] }).catch(() => {});
  });

  // ── Member left ──────────────────────────────────────────────────────────────
  client.on('guildMemberRemove', async (member) => {
    const settings = db.getGuildSettings(member.guild.id);
    if (!settings?.log_channel) return;
    const logCh = member.guild.channels.cache.get(settings.log_channel);
    if (!logCh) return;

    const roles = member.roles.cache
      .filter(r => r.id !== member.guild.id)
      .map(r => `${r}`)
      .join(', ') || 'None';

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setAuthor({ name: `${member.user.tag} left the server`, iconURL: member.user.displayAvatarURL() })
      .setThumbnail(member.user.displayAvatarURL())
      .addFields(
        { name: '👤 User', value: `${member.user}`, inline: true },
        { name: '🆔 ID', value: member.id, inline: true },
        { name: '📅 Joined', value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
        { name: '🎭 Roles', value: roles.slice(0, 512) },
      )
      .setFooter({ text: `User ID: ${member.id}` })
      .setTimestamp();

    logCh.send({ embeds: [embed] }).catch(() => {});
  });

  // ── Role updates ─────────────────────────────────────────────────────────────
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const settings = db.getGuildSettings(newMember.guild.id);
    if (!settings?.log_channel) return;
    const logCh = newMember.guild.channels.cache.get(settings.log_channel);
    if (!logCh) return;

    const addedRoles   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
    const nickChanged  = oldMember.nickname !== newMember.nickname;

    if (addedRoles.size === 0 && removedRoles.size === 0 && !nickChanged) return;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({ name: `${newMember.user.tag} — member updated`, iconURL: newMember.user.displayAvatarURL() })
      .setThumbnail(newMember.user.displayAvatarURL())
      .setFooter({ text: `User ID: ${newMember.id}` })
      .setTimestamp();

    if (addedRoles.size)   embed.addFields({ name: '➕ Roles Added',   value: addedRoles.map(r => `${r}`).join(', ') });
    if (removedRoles.size) embed.addFields({ name: '➖ Roles Removed', value: removedRoles.map(r => `${r}`).join(', ') });
    if (nickChanged) embed.addFields({
      name: '✏️ Nickname',
      value: `${oldMember.nickname || '*none*'} → ${newMember.nickname || '*none*'}`,
    });

    logCh.send({ embeds: [embed] }).catch(() => {});
  });

};
