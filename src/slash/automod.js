'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../database');

const GREEN  = 0x57F287;
const RED    = 0xED4245;
const YELLOW = 0xFEE75C;
const BLUE   = 0x5865F2;
const PURPLE = 0x9B59B6;

const ACTION_CHOICES = [
  { name: '🗑️ Delete only',   value: 'delete'  },
  { name: '⚠️ Warn user',     value: 'warn'    },
  { name: '⏱️ Timeout',       value: 'timeout' },
  { name: '👢 Kick',           value: 'kick'    },
  { name: '🔨 Ban',            value: 'ban'     },
];

const ACTION_EMOJI = { delete: '🗑️', warn: '⚠️', timeout: '⏱️', kick: '👢', ban: '🔨' };

function ruleStatus(enabled, extra = '') {
  return enabled ? `✅  ${extra}` : '🔴  off';
}

function fmtDur(s) {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// ── Panel helpers ─────────────────────────────────────────────────────────────
const RULES = [
  { key: 'spam',      label: 'Spam',         field: 'spam_enabled'      },
  { key: 'caps',      label: 'Caps',         field: 'caps_enabled'      },
  { key: 'links',     label: 'Links',        field: 'links_enabled'     },
  { key: 'words',     label: 'Words',        field: 'words_enabled'     },
  { key: 'mentions',  label: 'Mentions',     field: 'mentions_enabled'  },
  { key: 'emojis',    label: 'Emojis',       field: 'emojis_enabled'    },
  { key: 'dupes',     label: 'Duplicates',   field: 'dupes_enabled'     },
  { key: 'newaccts',  label: 'New Accounts', field: 'newaccts_enabled'  },
  { key: 'zalgo',     label: 'Zalgo',        field: 'zalgo_enabled'     },
  { key: 'strikes',   label: 'Strikes',      field: 'strikes_enabled'   },
];

function buildPanelEmbed(s, guild) {
  const statusLine = s.enabled
    ? `✅ **Enabled**  ·  Log: ${s.log_channel ? `<#${s.log_channel}>` : '⚠️ not set'}`
    : `🔴 **Disabled**  ·  Use \`/automod setup enabled:true\` to turn on`;
  const ruleLines = RULES.map(r => `${s[r.field] ? '✅' : '🔴'}  **${r.label}**`);
  return new EmbedBuilder()
    .setColor(s.enabled ? PURPLE : 0x2B2D31)
    .setTitle('⚙️ AutoMod Control Panel')
    .setDescription(statusLine)
    .addFields(
      { name: '​', value: ruleLines.slice(0, 5).join('\n'), inline: true },
      { name: '​', value: ruleLines.slice(5).join('\n'),    inline: true },
    )
    .setFooter({ text: `${guild.name}  ·  Click to toggle  ·  /automod <rule> to configure` })
    .setTimestamp();
}

function buildPanelRows(s, uid) {
  const row1 = new ActionRowBuilder().addComponents(
    RULES.slice(0, 5).map(r => new ButtonBuilder()
      .setCustomId(`amp_${r.key}_${uid}`)
      .setLabel(r.label)
      .setStyle(s[r.field] ? ButtonStyle.Success : ButtonStyle.Danger))
  );
  const row2 = new ActionRowBuilder().addComponents(
    RULES.slice(5).map(r => new ButtonBuilder()
      .setCustomId(`amp_${r.key}_${uid}`)
      .setLabel(r.label)
      .setStyle(s[r.field] ? ButtonStyle.Success : ButtonStyle.Danger))
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`amp_enable_${uid}`)
      .setLabel('Enable AutoMod').setStyle(ButtonStyle.Success).setDisabled(!!s.enabled),
    new ButtonBuilder().setCustomId(`amp_disable_${uid}`)
      .setLabel('Disable AutoMod').setStyle(ButtonStyle.Danger).setDisabled(!s.enabled),
    new ButtonBuilder().setCustomId(`amp_close_${uid}`)
      .setLabel('Close').setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2, row3];
}

const automod = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure the automatic moderation system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    // ── setup ──────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('setup')
      .setDescription('Enable/disable automod and set the log channel')
      .addBooleanOption(o => o.setName('enabled').setDescription('Turn automod on or off').setRequired(true))
      .addChannelOption(o => o.setName('log_channel').setDescription('Channel to log automod actions (leave blank to keep current)')))

    // ── spam ───────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('spam')
      .setDescription('Detect message spam (X messages in Y seconds)')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable spam filter').setRequired(true))
      .addIntegerOption(o => o.setName('limit').setDescription('Max messages before trigger (default 5)').setMinValue(2).setMaxValue(20))
      .addIntegerOption(o => o.setName('interval').setDescription('Seconds to count messages in (default 5)').setMinValue(1).setMaxValue(60))
      .addStringOption(o => o.setName('action').setDescription('Action to take').addChoices(...ACTION_CHOICES))
      .addIntegerOption(o => o.setName('timeout_duration').setDescription('Timeout seconds if action=timeout (default 300)').setMinValue(60).setMaxValue(2419200)))

    // ── caps ───────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('caps')
      .setDescription('Filter messages with excessive caps')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable caps filter').setRequired(true))
      .addIntegerOption(o => o.setName('percent').setDescription('% of caps to trigger (default 70)').setMinValue(50).setMaxValue(100))
      .addIntegerOption(o => o.setName('min_length').setDescription('Min message length to check (default 8)').setMinValue(1).setMaxValue(100))
      .addStringOption(o => o.setName('action').setDescription('Action to take').addChoices(...ACTION_CHOICES)))

    // ── links ──────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('links')
      .setDescription('Block links and/or Discord invites')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable link filter').setRequired(true))
      .addBooleanOption(o => o.setName('block_invites').setDescription('Also block Discord invite links (default true)'))
      .addStringOption(o => o.setName('whitelist_add').setDescription('Add a domain to the whitelist (e.g. youtube.com)'))
      .addStringOption(o => o.setName('whitelist_remove').setDescription('Remove a domain from the whitelist'))
      .addStringOption(o => o.setName('action').setDescription('Action to take').addChoices(...ACTION_CHOICES)))

    // ── mentions ───────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('mentions')
      .setDescription('Block mass mention spam')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable mention filter').setRequired(true))
      .addIntegerOption(o => o.setName('limit').setDescription('Max mentions per message (default 5)').setMinValue(2).setMaxValue(20))
      .addStringOption(o => o.setName('action').setDescription('Action to take').addChoices(...ACTION_CHOICES)))

    // ── emojis ─────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('emojis')
      .setDescription('Block emoji spam')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable emoji filter').setRequired(true))
      .addIntegerOption(o => o.setName('limit').setDescription('Max emojis per message (default 10)').setMinValue(3).setMaxValue(50))
      .addStringOption(o => o.setName('action').setDescription('Action to take').addChoices(...ACTION_CHOICES)))

    // ── duplicates ─────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('duplicates')
      .setDescription('Block the same message being sent repeatedly')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable duplicate filter').setRequired(true))
      .addIntegerOption(o => o.setName('limit').setDescription('Same message X times (default 3)').setMinValue(2).setMaxValue(10))
      .addIntegerOption(o => o.setName('interval').setDescription('Within X seconds (default 30)').setMinValue(5).setMaxValue(300))
      .addStringOption(o => o.setName('action').setDescription('Action to take').addChoices(...ACTION_CHOICES)))

    // ── newaccounts ────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('newaccounts')
      .setDescription('Block accounts below a minimum age from joining')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable new account gate').setRequired(true))
      .addIntegerOption(o => o.setName('min_days').setDescription('Min account age in days (default 7)').setMinValue(1).setMaxValue(365))
      .addStringOption(o => o.setName('action').setDescription('Action to take').addChoices(
        { name: '👢 Kick', value: 'kick' },
        { name: '🔨 Ban',  value: 'ban'  },
      )))

    // ── zalgo ──────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('zalgo')
      .setDescription('Filter zalgo/corrupted unicode text')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable zalgo filter').setRequired(true))
      .addStringOption(o => o.setName('action').setDescription('Action to take').addChoices(...ACTION_CHOICES)))

    // ── strikes ────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('strikes')
      .setDescription('Configure the auto-escalation strike system')
      .addBooleanOption(o => o.setName('enabled').setDescription('Enable strike tracking').setRequired(true))
      .addIntegerOption(o => o.setName('timeout_at').setDescription('Timeout user at X strikes (default 3)').setMinValue(1).setMaxValue(10))
      .addIntegerOption(o => o.setName('timeout_duration').setDescription('Timeout duration in seconds (default 300)').setMinValue(60).setMaxValue(2419200))
      .addIntegerOption(o => o.setName('kick_at').setDescription('Kick user at X strikes (default 5)').setMinValue(2).setMaxValue(15))
      .addIntegerOption(o => o.setName('ban_at').setDescription('Ban user at X strikes (default 7)').setMinValue(3).setMaxValue(20))
      .addIntegerOption(o => o.setName('decay_hours').setDescription('Reset strikes after X hours of clean behaviour (default 24)').setMinValue(1).setMaxValue(720)))

    // ── words group ────────────────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('words')
      .setDescription('Manage the banned words/phrases list')
      .addSubcommand(s => s
        .setName('add')
        .setDescription('Add a word or phrase to the banned list')
        .addStringOption(o => o.setName('word').setDescription('Word or phrase (case-insensitive)').setRequired(true)))
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('Remove a word or phrase from the banned list')
        .addStringOption(o => o.setName('word').setDescription('Word or phrase to remove').setRequired(true)))
      .addSubcommand(s => s
        .setName('list')
        .setDescription('View all banned words'))
      .addSubcommand(s => s
        .setName('toggle')
        .setDescription('Enable or disable the words filter')
        .addBooleanOption(o => o.setName('enabled').setDescription('Enable').setRequired(true))
        .addStringOption(o => o.setName('action').setDescription('Action to take').addChoices(...ACTION_CHOICES))))

    // ── exempt group ───────────────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('exempt')
      .setDescription('Manage roles and channels that bypass automod')
      .addSubcommand(s => s
        .setName('addrole')
        .setDescription('Exempt a role from all automod rules')
        .addRoleOption(o => o.setName('role').setDescription('Role to exempt').setRequired(true)))
      .addSubcommand(s => s
        .setName('removerole')
        .setDescription('Remove a role exemption')
        .addRoleOption(o => o.setName('role').setDescription('Role to un-exempt').setRequired(true)))
      .addSubcommand(s => s
        .setName('addchannel')
        .setDescription('Exempt a channel from all automod rules')
        .addChannelOption(o => o.setName('channel').setDescription('Channel to exempt').setRequired(true)))
      .addSubcommand(s => s
        .setName('removechannel')
        .setDescription('Remove a channel exemption')
        .addChannelOption(o => o.setName('channel').setDescription('Channel to un-exempt').setRequired(true)))
      .addSubcommand(s => s
        .setName('list')
        .setDescription('View all exempted roles and channels')))

    // ── view ───────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('view')
      .setDescription('View all automod settings at a glance'))

    // ── reset ──────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('reset')
      .setDescription('Reset all automod settings to defaults'))

    // ── panel ──────────────────────────────────────────────────────────────────
    .addSubcommand(s => s
      .setName('panel')
      .setDescription('Open an interactive panel to toggle automod rules on/off')),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const sub     = interaction.options.getSubcommand(false);
    const group   = interaction.options.getSubcommandGroup(false);

    await interaction.deferReply({ ephemeral: true });

    // ── words group ────────────────────────────────────────────────────────────
    if (group === 'words') {
      if (sub === 'add') {
        const word = interaction.options.getString('word');
        const ok = db.addAutomodWord(guildId, word);
        return interaction.editReply(ok
          ? `✅ Added **${word}** to the banned words list.`
          : `⚠️ **${word}** is already on the list.`);
      }
      if (sub === 'remove') {
        const word = interaction.options.getString('word');
        const ok = db.removeAutomodWord(guildId, word);
        return interaction.editReply(ok
          ? `✅ Removed **${word}** from the banned words list.`
          : `⚠️ **${word}** wasn't on the list.`);
      }
      if (sub === 'list') {
        const words = db.getAutomodWords(guildId);
        if (!words.length) return interaction.editReply('📋 No banned words configured yet. Use `/automod words add`.');
        return interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(PURPLE)
          .setTitle('🚫 Banned Words List')
          .setDescription(words.map((w, i) => `\`${i + 1}.\` ${w}`).join('\n'))
          .setFooter({ text: `${words.length} word${words.length !== 1 ? 's' : ''}` })] });
      }
      if (sub === 'toggle') {
        const fields = { words_enabled: interaction.options.getBoolean('enabled') ? 1 : 0 };
        const action = interaction.options.getString('action');
        if (action) fields.words_action = action;
        db.setAutomodSettings(guildId, fields);
        return interaction.editReply(`✅ Words filter **${fields.words_enabled ? 'enabled' : 'disabled'}**.`);
      }
    }

    // ── exempt group ───────────────────────────────────────────────────────────
    if (group === 'exempt') {
      const s = db.getAutomodSettings(guildId);
      const roles    = JSON.parse(s.exempt_roles    || '[]');
      const channels = JSON.parse(s.exempt_channels || '[]');

      if (sub === 'addrole') {
        const role = interaction.options.getRole('role');
        if (roles.includes(role.id)) return interaction.editReply(`⚠️ ${role} is already exempt.`);
        roles.push(role.id);
        db.setAutomodSettings(guildId, { exempt_roles: JSON.stringify(roles) });
        return interaction.editReply(`✅ ${role} is now exempt from automod.`);
      }
      if (sub === 'removerole') {
        const role = interaction.options.getRole('role');
        const idx = roles.indexOf(role.id);
        if (idx === -1) return interaction.editReply(`⚠️ ${role} wasn't exempt.`);
        roles.splice(idx, 1);
        db.setAutomodSettings(guildId, { exempt_roles: JSON.stringify(roles) });
        return interaction.editReply(`✅ ${role} is no longer exempt.`);
      }
      if (sub === 'addchannel') {
        const ch = interaction.options.getChannel('channel');
        if (channels.includes(ch.id)) return interaction.editReply(`⚠️ <#${ch.id}> is already exempt.`);
        channels.push(ch.id);
        db.setAutomodSettings(guildId, { exempt_channels: JSON.stringify(channels) });
        return interaction.editReply(`✅ <#${ch.id}> is now exempt from automod.`);
      }
      if (sub === 'removechannel') {
        const ch = interaction.options.getChannel('channel');
        const idx = channels.indexOf(ch.id);
        if (idx === -1) return interaction.editReply(`⚠️ <#${ch.id}> wasn't exempt.`);
        channels.splice(idx, 1);
        db.setAutomodSettings(guildId, { exempt_channels: JSON.stringify(channels) });
        return interaction.editReply(`✅ <#${ch.id}> is no longer exempt.`);
      }
      if (sub === 'list') {
        const roleStr = roles.length    ? roles.map(id => `<@&${id}>`).join(', ')    : '*none*';
        const chStr   = channels.length ? channels.map(id => `<#${id}>`).join(', ') : '*none*';
        return interaction.editReply({ embeds: [new EmbedBuilder()
          .setColor(BLUE)
          .setTitle('🛡️ AutoMod Exemptions')
          .addFields(
            { name: '🎭 Exempt Roles',    value: roleStr },
            { name: '📌 Exempt Channels', value: chStr },
          )] });
      }
    }

    // ── top-level subcommands ──────────────────────────────────────────────────
    if (sub === 'setup') {
      const enabled = interaction.options.getBoolean('enabled');
      const logCh   = interaction.options.getChannel('log_channel');
      const fields  = { enabled: enabled ? 1 : 0 };
      if (logCh) fields.log_channel = logCh.id;
      db.setAutomodSettings(guildId, fields);
      const s = db.getAutomodSettings(guildId);
      return interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(enabled ? GREEN : RED)
        .setTitle(`${enabled ? '✅' : '🔴'} AutoMod ${enabled ? 'Enabled' : 'Disabled'}`)
        .setDescription(logCh
          ? `Log channel set to <#${logCh.id}>.`
          : s.log_channel
            ? `Log channel: <#${s.log_channel}>`
            : '⚠️ No log channel set — use `/automod setup log_channel:#channel` to set one.')
        .setFooter({ text: 'Use /automod view to see all rules' })] });
    }

    if (sub === 'spam') {
      const fields = { spam_enabled: interaction.options.getBoolean('enabled') ? 1 : 0 };
      const limit   = interaction.options.getInteger('limit');
      const interval = interaction.options.getInteger('interval');
      const action  = interaction.options.getString('action');
      const dur     = interaction.options.getInteger('timeout_duration');
      if (limit)    fields.spam_limit = limit;
      if (interval) fields.spam_interval = interval;
      if (action)   fields.spam_action = action;
      if (dur)      fields.spam_timeout_dur = dur;
      db.setAutomodSettings(guildId, fields);
      return interaction.editReply(`✅ Spam filter **${fields.spam_enabled ? 'enabled' : 'disabled'}**.`);
    }

    if (sub === 'caps') {
      const fields = { caps_enabled: interaction.options.getBoolean('enabled') ? 1 : 0 };
      const pct    = interaction.options.getInteger('percent');
      const minLen = interaction.options.getInteger('min_length');
      const action = interaction.options.getString('action');
      if (pct)    fields.caps_percent = pct;
      if (minLen) fields.caps_min_length = minLen;
      if (action) fields.caps_action = action;
      db.setAutomodSettings(guildId, fields);
      return interaction.editReply(`✅ Caps filter **${fields.caps_enabled ? 'enabled' : 'disabled'}**.`);
    }

    if (sub === 'links') {
      const fields = { links_enabled: interaction.options.getBoolean('enabled') ? 1 : 0 };
      const blockInvites = interaction.options.getBoolean('block_invites');
      const wlAdd    = interaction.options.getString('whitelist_add');
      const wlRemove = interaction.options.getString('whitelist_remove');
      const action   = interaction.options.getString('action');
      if (blockInvites !== null) fields.links_invites = blockInvites ? 1 : 0;
      if (action) fields.links_action = action;

      // Handle whitelist changes
      const s = db.getAutomodSettings(guildId);
      let whitelist = JSON.parse(s.links_whitelist || '[]');
      if (wlAdd)    { const d = wlAdd.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0]; if (!whitelist.includes(d)) whitelist.push(d); }
      if (wlRemove) { whitelist = whitelist.filter(d => d !== wlRemove.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0]); }
      fields.links_whitelist = JSON.stringify(whitelist);

      db.setAutomodSettings(guildId, fields);
      const wlStr = whitelist.length ? whitelist.join(', ') : '*none*';
      return interaction.editReply(`✅ Link filter **${fields.links_enabled ? 'enabled' : 'disabled'}**.\nWhitelist: ${wlStr}`);
    }

    if (sub === 'mentions') {
      const fields = { mentions_enabled: interaction.options.getBoolean('enabled') ? 1 : 0 };
      const limit  = interaction.options.getInteger('limit');
      const action = interaction.options.getString('action');
      if (limit)  fields.mentions_limit = limit;
      if (action) fields.mentions_action = action;
      db.setAutomodSettings(guildId, fields);
      return interaction.editReply(`✅ Mention filter **${fields.mentions_enabled ? 'enabled' : 'disabled'}**.`);
    }

    if (sub === 'emojis') {
      const fields = { emojis_enabled: interaction.options.getBoolean('enabled') ? 1 : 0 };
      const limit  = interaction.options.getInteger('limit');
      const action = interaction.options.getString('action');
      if (limit)  fields.emojis_limit = limit;
      if (action) fields.emojis_action = action;
      db.setAutomodSettings(guildId, fields);
      return interaction.editReply(`✅ Emoji filter **${fields.emojis_enabled ? 'enabled' : 'disabled'}**.`);
    }

    if (sub === 'duplicates') {
      const fields   = { dupes_enabled: interaction.options.getBoolean('enabled') ? 1 : 0 };
      const limit    = interaction.options.getInteger('limit');
      const interval = interaction.options.getInteger('interval');
      const action   = interaction.options.getString('action');
      if (limit)    fields.dupes_limit = limit;
      if (interval) fields.dupes_interval = interval;
      if (action)   fields.dupes_action = action;
      db.setAutomodSettings(guildId, fields);
      return interaction.editReply(`✅ Duplicate filter **${fields.dupes_enabled ? 'enabled' : 'disabled'}**.`);
    }

    if (sub === 'newaccounts') {
      const fields  = { newaccts_enabled: interaction.options.getBoolean('enabled') ? 1 : 0 };
      const minDays = interaction.options.getInteger('min_days');
      const action  = interaction.options.getString('action');
      if (minDays) fields.newaccts_min_days = minDays;
      if (action)  fields.newaccts_action = action;
      db.setAutomodSettings(guildId, fields);
      return interaction.editReply(`✅ New account gate **${fields.newaccts_enabled ? 'enabled' : 'disabled'}**.`);
    }

    if (sub === 'zalgo') {
      const fields = { zalgo_enabled: interaction.options.getBoolean('enabled') ? 1 : 0 };
      const action = interaction.options.getString('action');
      if (action) fields.zalgo_action = action;
      db.setAutomodSettings(guildId, fields);
      return interaction.editReply(`✅ Zalgo filter **${fields.zalgo_enabled ? 'enabled' : 'disabled'}**.`);
    }

    if (sub === 'strikes') {
      const fields   = { strikes_enabled: interaction.options.getBoolean('enabled') ? 1 : 0 };
      const toAt     = interaction.options.getInteger('timeout_at');
      const toDur    = interaction.options.getInteger('timeout_duration');
      const kickAt   = interaction.options.getInteger('kick_at');
      const banAt    = interaction.options.getInteger('ban_at');
      const decay    = interaction.options.getInteger('decay_hours');
      if (toAt)   fields.strikes_timeout_at  = toAt;
      if (toDur)  fields.strikes_timeout_dur = toDur;
      if (kickAt) fields.strikes_kick_at     = kickAt;
      if (banAt)  fields.strikes_ban_at      = banAt;
      if (decay)  fields.strikes_decay_hours = decay;
      db.setAutomodSettings(guildId, fields);
      return interaction.editReply(`✅ Strike system **${fields.strikes_enabled ? 'enabled' : 'disabled'}**.`);
    }

    if (sub === 'reset') {
      db.get('DELETE FROM automod_settings WHERE guild_id=?', [guildId]);
      db.get('DELETE FROM automod_strikes WHERE guild_id=?', [guildId]);
      return interaction.editReply('✅ All automod settings reset to defaults.');
    }

    if (sub === 'panel') {
      const uid = interaction.user.id;
      let s = db.getAutomodSettings(guildId);

      await interaction.editReply({
        embeds: [buildPanelEmbed(s, interaction.guild)],
        components: buildPanelRows(s, uid),
      });

      const msg = await interaction.fetchReply();
      const col = msg.createMessageComponentCollector({
        filter: i => i.user.id === uid,
        time: 300_000,
      });

      col.on('collect', async i => {
        const id = i.customId;

        if (id === `amp_close_${uid}`) {
          col.stop();
          return i.update({ components: [] });
        }

        if (id === `amp_enable_${uid}`)  db.setAutomodSettings(guildId, { enabled: 1 });
        else if (id === `amp_disable_${uid}`) db.setAutomodSettings(guildId, { enabled: 0 });
        else {
          // Toggle a rule: amp_<key>_<uid>
          const key = id.replace(`amp_`, '').replace(`_${uid}`, '');
          const rule = RULES.find(r => r.key === key);
          if (rule) {
            s = db.getAutomodSettings(guildId);
            db.setAutomodSettings(guildId, { [rule.field]: s[rule.field] ? 0 : 1 });
          }
        }

        s = db.getAutomodSettings(guildId);
        await i.update({
          embeds: [buildPanelEmbed(s, interaction.guild)],
          components: buildPanelRows(s, uid),
        });
      });

      col.on('end', (_, reason) => {
        if (reason !== 'user') interaction.editReply({ components: [] }).catch(() => {});
      });

      return;
    }

    if (sub === 'view') {
      const s = db.getAutomodSettings(guildId);
      const words    = db.getAutomodWords(guildId);
      const roles    = JSON.parse(s.exempt_roles    || '[]');
      const channels = JSON.parse(s.exempt_channels || '[]');
      const wl       = JSON.parse(s.links_whitelist || '[]');

      const statusLine = s.enabled
        ? `✅ **Enabled**  ·  Log: ${s.log_channel ? `<#${s.log_channel}>` : '⚠️ not set'}`
        : `🔴 **Disabled**  ·  Log: ${s.log_channel ? `<#${s.log_channel}>` : 'not set'}`;

      const rules = [
        `**Spam**       ${s.spam_enabled     ? `✅  ${s.spam_limit} msg / ${s.spam_interval}s → ${ACTION_EMOJI[s.spam_action]} ${s.spam_action}${s.spam_action === 'timeout' ? ` (${fmtDur(s.spam_timeout_dur)})` : ''}` : '🔴  off'}`,
        `**Caps**       ${s.caps_enabled     ? `✅  ≥${s.caps_percent}% · ≥${s.caps_min_length} chars → ${ACTION_EMOJI[s.caps_action]} ${s.caps_action}` : '🔴  off'}`,
        `**Links**      ${s.links_enabled    ? `✅  ${s.links_invites ? 'invites blocked' : 'invites allowed'} → ${ACTION_EMOJI[s.links_action]} ${s.links_action}${wl.length ? `\n${' '.repeat(15)}whitelist: ${wl.join(', ')}` : ''}` : '🔴  off'}`,
        `**Words**      ${s.words_enabled    ? `✅  ${words.length} word${words.length !== 1 ? 's' : ''} → ${ACTION_EMOJI[s.words_action]} ${s.words_action}` : '🔴  off'}`,
        `**Mentions**   ${s.mentions_enabled ? `✅  ≥${s.mentions_limit} pings → ${ACTION_EMOJI[s.mentions_action]} ${s.mentions_action}` : '🔴  off'}`,
        `**Emojis**     ${s.emojis_enabled   ? `✅  ≥${s.emojis_limit} emojis → ${ACTION_EMOJI[s.emojis_action]} ${s.emojis_action}` : '🔴  off'}`,
        `**Dupes**      ${s.dupes_enabled    ? `✅  ${s.dupes_limit}× / ${s.dupes_interval}s → ${ACTION_EMOJI[s.dupes_action]} ${s.dupes_action}` : '🔴  off'}`,
        `**New Accts**  ${s.newaccts_enabled ? `✅  < ${s.newaccts_min_days}d old → ${ACTION_EMOJI[s.newaccts_action]} ${s.newaccts_action}` : '🔴  off'}`,
        `**Zalgo**      ${s.zalgo_enabled    ? `✅  → ${ACTION_EMOJI[s.zalgo_action]} ${s.zalgo_action}` : '🔴  off'}`,
      ];

      const strikeLine = s.strikes_enabled
        ? `Timeout @ **${s.strikes_timeout_at}** (${fmtDur(s.strikes_timeout_dur)})  ·  Kick @ **${s.strikes_kick_at}**  ·  Ban @ **${s.strikes_ban_at}**  ·  Decay: **${s.strikes_decay_hours}h**`
        : '🔴  off';

      const roleStr = roles.length    ? roles.map(id => `<@&${id}>`).join(' ')    : '*none*';
      const chStr   = channels.length ? channels.map(id => `<#${id}>`).join(' ') : '*none*';

      return interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(s.enabled ? PURPLE : 0x2B2D31)
        .setTitle('⚙️ AutoMod Settings')
        .setDescription(statusLine)
        .addFields(
          { name: '📊 Rules',            value: rules.join('\n') },
          { name: '⚡ Strike Escalation', value: strikeLine },
          { name: '🛡️ Exemptions',       value: `Roles: ${roleStr}\nChannels: ${chStr}` },
        )
        .setFooter({ text: interaction.guild.name })
        .setTimestamp()] });
    }
  },
};

module.exports = [automod];
