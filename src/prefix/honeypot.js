'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');

const RED   = '#ED4245';
const GREEN = '#57F287';
const BLUE  = '#5865F2';

function buildHoneypotEmbed(actionWord, count) {
  return new EmbedBuilder()
    .setColor('#ED4245')
    .setTitle('⚠️ RESTRICTED SECURITY CHANNEL')
    .setDescription(
      '**DO NOT** `SEND` **ANY** `MESSAGES` **HERE**\n\n' +
      'This channel is a trap designed to catch `spam bots` and `compromised accounts`.\n' +
      `Any message sent here will automatically result in **a ${actionWord.toLowerCase().replace(/s$/, '')}**.`
    )
    .addFields({ name: `🍯 ${actionWord}`, value: `**${count}**`, inline: true })
    .setTimestamp();
}

const honeypot = {
  name: 'honeypot',
  aliases: ['hp', 'trap'],
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ You need **Manage Server** permission.')] });

    const sub = args[0]?.toLowerCase();

    // ── set ───────────────────────────────────────────────────────────────────
    if (sub === 'set') {
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('**Usage:** `,honeypot set #channel [kick|ban|softban]`');

      const action = (['kick', 'ban', 'softban'].includes(args[2]?.toLowerCase())) ? args[2].toLowerCase() : 'kick';
      const actionWord = action === 'ban' ? 'Bans' : action === 'softban' ? 'Softbans' : 'Kicks';

      const existing = db.getHoneypot(message.guild.id, channel.id);
      let msgId = existing?.message_id ?? null;

      // Send or refresh the warning embed
      const sentEmbed = await channel.send({ embeds: [buildHoneypotEmbed(actionWord, existing?.count ?? 0)] });
      msgId = sentEmbed.id;

      db.setHoneypot(message.guild.id, channel.id, action, msgId);

      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(GREEN)
        .setTitle('🍯 Honeypot Set')
        .setDescription(`${channel} is now a honeypot channel.\nAnyone who types there will be **${action === 'ban' ? 'banned' : action === 'softban' ? 'softbanned' : 'kicked'}** automatically.`)] });
    }

    // ── remove ────────────────────────────────────────────────────────────────
    if (sub === 'remove' || sub === 'delete') {
      const channel = message.mentions.channels.first() || message.channel;
      const existing = db.getHoneypot(message.guild.id, channel.id);
      if (!existing) return message.reply(`❌ **${channel.name}** is not a honeypot channel.`);
      db.removeHoneypot(message.guild.id, channel.id);
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Removed honeypot from **${channel.name}**.`)] });
    }

    // ── list ──────────────────────────────────────────────────────────────────
    if (sub === 'list' || sub === 'info' || sub === 'view') {
      const pots = db.getAllHoneypots(message.guild.id);
      if (!pots.length) return message.reply('No honeypot channels configured.');
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(BLUE)
        .setTitle('🍯 Honeypot Channels')
        .setDescription(pots.map(h => `<#${h.channel_id}> — **${h.action}** • ${h.count} caught`).join('\n'))] });
    }

    return message.reply('**Usage:**\n`,honeypot set #channel [kick|ban|softban]`\n`,honeypot remove #channel`\n`,honeypot list`');
  },
};

module.exports = [honeypot];
