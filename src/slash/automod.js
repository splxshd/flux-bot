'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
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
  { key: 'spam',     label: 'Spam',         field: 'spam_enabled',     emoji: '💬' },
  { key: 'caps',     label: 'Caps',         field: 'caps_enabled',     emoji: '🔠' },
  { key: 'links',    label: 'Links',        field: 'links_enabled',    emoji: '🔗' },
  { key: 'words',    label: 'Words',        field: 'words_enabled',    emoji: '🚫' },
  { key: 'mentions', label: 'Mentions',     field: 'mentions_enabled', emoji: '📢' },
  { key: 'emojis',   label: 'Emojis',       field: 'emojis_enabled',   emoji: '😄' },
  { key: 'dupes',    label: 'Duplicates',   field: 'dupes_enabled',    emoji: '📋' },
  { key: 'newaccts', label: 'New Accounts', field: 'newaccts_enabled', emoji: '🆕' },
  { key: 'zalgo',    label: 'Zalgo',        field: 'zalgo_enabled',    emoji: '🌀' },
  { key: 'strikes',  label: 'Strikes',      field: 'strikes_enabled',  emoji: '⚡' },
];

// Brief inline config detail shown next to an enabled rule in the panel
function ruleDetail(s, key) {
  switch (key) {
    case 'spam':     return `${s.spam_limit}msg/${s.spam_interval}s ${ACTION_EMOJI[s.spam_action]}`;
    case 'caps':     return `≥${s.caps_percent}% ${ACTION_EMOJI[s.caps_action]}`;
    case 'links':    return `${ACTION_EMOJI[s.links_action]}${s.links_invites ? ' +inv' : ''}`;
    case 'words':    return `${ACTION_EMOJI[s.words_action]}`;
    case 'mentions': return `≥${s.mentions_limit} pings ${ACTION_EMOJI[s.mentions_action]}`;
    case 'emojis':   return `≥${s.emojis_limit} ${ACTION_EMOJI[s.emojis_action]}`;
    case 'dupes':    return `${s.dupes_limit}×/${s.dupes_interval}s ${ACTION_EMOJI[s.dupes_action]}`;
    case 'newaccts': return `<${s.newaccts_min_days}d ${ACTION_EMOJI[s.newaccts_action]}`;
    case 'zalgo':    return `${ACTION_EMOJI[s.zalgo_action]}`;
    case 'strikes':  return `to@${s.strikes_timeout_at} kick@${s.strikes_kick_at} ban@${s.strikes_ban_at}`;
    default: return '';
  }
}

function buildPanelEmbed(s, guild) {
  const activeCount = RULES.filter(r => s[r.field]).length;

  const statusBadge = s.enabled ? '🟢  **Enabled**' : '🔴  **Disabled**';
  const logBadge    = s.log_channel ? `<#${s.log_channel}>` : '⚠️ *not configured*';
  const desc = [
    `${statusBadge}   •   **${activeCount} / ${RULES.length}** rules active`,
    `> **Log Channel:** ${logBadge}`,
    s.enabled ? '' : `> Use \`/automod setup enabled:true\` to activate`,
  ].filter(Boolean).join('\n');

  // Message-based rules (left column)
  const MSG_KEYS   = ['spam', 'caps', 'links', 'words', 'mentions', 'emojis', 'dupes'];
  // Member / text / system rules (right column)
  const OTHER_KEYS = ['newaccts', 'zalgo', 'strikes'];

  function buildBlock(keys) {
    return keys.map(key => {
      const r   = RULES.find(r => r.key === key);
      const on  = !!s[r.field];
      const det = on ? `  \`${ruleDetail(s, key)}\`` : '';
      return `${on ? '\u{1F7E2}' : '⚫'} ${r.emoji} **${r.label}**${det}`;
    }).join('\n');
  }

  const embed = new EmbedBuilder()
    .setColor(s.enabled ? 0x57F287 : 0x2B2D31)
    .setAuthor({
      name: `${guild.name}  ·  AutoMod Control Panel`,
      iconURL: guild.iconURL({ dynamic: true }) ?? undefined,
    })
    .setDescription(desc)
    .addFields(
      { name: ' \n📨  Message Rules', value: buildBlock(MSG_KEYS),   inline: true },
      { name: ' \n🛡️  Member & System', value: buildBlock(OTHER_KEYS), inline: true },
    )
    .setFooter({ text: '🟢 = on  ⚫ = off  ·  Click a rule to toggle  ·  /automod <rule> to configure' })
    .setTimestamp();

  const icon = guild.iconURL({ dynamic: true });
  if (icon) embed.setThumbnail(icon);

  return embed;
}

function buildPanelRows(s, uid) {
  const row1 = new ActionRowBuilder().addComponents(
    RULES.slice(0, 5).map(r => new ButtonBuilder()
      .setCustomId(`amp_${r.key}_${uid}`)
      .setEmoji(r.emoji)
      .setLabel(r.label)
      .setStyle(s[r.field] ? ButtonStyle.Success : ButtonStyle.Danger))
  );
  const row2 = new ActionRowBuilder().addComponents(
    RULES.slice(5).map(r => new ButtonBuilder()
      .setCustomId(`amp_${r.key}_${uid}`)
      .setEmoji(r.emoji)
      .setLabel(r.label)
      .setStyle(s[r.field] ? ButtonStyle.Success : ButtonStyle.Danger))
  );
  const row3 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`amp_cfg_${uid}`)
      .setPlaceholder('⚙️  Configure a rule…')
      .addOptions([
        { label: 'Global Setup', value: 'setup', description: 'Set log channel & master toggle', emoji: '⚙️' },
        ...RULES.map(r => ({ label: r.label, value: r.key, description: `Configure ${r.label} thresholds & action`, emoji: r.emoji })),
      ])
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`amp_enable_${uid}`)
      .setEmoji('✅').setLabel('Enable').setStyle(ButtonStyle.Success).setDisabled(!!s.enabled),
    new ButtonBuilder().setCustomId(`amp_disable_${uid}`)
      .setEmoji('🔴').setLabel('Disable').setStyle(ButtonStyle.Danger).setDisabled(!s.enabled),
    new ButtonBuilder().setCustomId(`amp_close_${uid}`)
      .setEmoji('✖️').setLabel('Close').setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2, row3, row4];
}

// ── Per-rule configuration metadata ──────────────────────────────────────────
// desc(s) → description string for the rule config embed
// modalFields → array of { id, label, value(s), long? } for the modal
// saveModal(fields, submit) → writes parsed values into `fields` object
const RULE_CFG = {
  setup: {
    label: 'Global Setup', emoji: '⚙️',
    actionField: null,
    desc: s => `**Status:** ${s.enabled ? '🟢 Enabled' : '🔴 Disabled'}\n**Log Channel:** ${s.log_channel ? `<#${s.log_channel}>` : '⚠️ *not configured*'}`,
    modalTitle: '⚙️ Global Setup',
    modalFields: [
      { id: 'log_channel', label: 'Log Channel ID  (right-click → Copy ID)', value: s => s.log_channel || '' },
    ],
    saveModal: (fields, submit) => {
      const raw = submit.fields.getTextInputValue('log_channel').trim().replace(/\D/g, '');
      if (raw) fields.log_channel = raw;
    },
  },
  spam: {
    actionField: 'spam_action', actionChoices: ACTION_CHOICES,
    desc: s => `Fires when **${s.spam_limit}+ messages** sent in **${s.spam_interval}s**.\nTimeout duration: **${fmtDur(s.spam_timeout_dur)}**`,
    modalTitle: '💬 Spam Filter — Values',
    modalFields: [
      { id: 'limit',    label: 'Message Limit  (2–20)',        value: s => String(s.spam_limit)       },
      { id: 'interval', label: 'Interval in seconds  (1–60)',  value: s => String(s.spam_interval)    },
      { id: 'timeout',  label: 'Timeout Duration secs  (60+)', value: s => String(s.spam_timeout_dur) },
    ],
    saveModal: (fields, submit) => {
      const l = parseInt(submit.fields.getTextInputValue('limit'));
      const i = parseInt(submit.fields.getTextInputValue('interval'));
      const t = parseInt(submit.fields.getTextInputValue('timeout'));
      if (!isNaN(l) && l >= 2  && l <= 20) fields.spam_limit       = l;
      if (!isNaN(i) && i >= 1  && i <= 60) fields.spam_interval    = i;
      if (!isNaN(t) && t >= 60)            fields.spam_timeout_dur = t;
    },
  },
  caps: {
    actionField: 'caps_action', actionChoices: ACTION_CHOICES,
    desc: s => `Fires when ≥ **${s.caps_percent}%** of a message is uppercase.\nMin message length: **${s.caps_min_length}** chars.`,
    modalTitle: '🔠 Caps Filter — Values',
    modalFields: [
      { id: 'percent', label: 'Caps Percentage  (50–100)',    value: s => String(s.caps_percent)    },
      { id: 'minlen',  label: 'Min Message Length  (1–100)', value: s => String(s.caps_min_length) },
    ],
    saveModal: (fields, submit) => {
      const p = parseInt(submit.fields.getTextInputValue('percent'));
      const m = parseInt(submit.fields.getTextInputValue('minlen'));
      if (!isNaN(p) && p >= 50 && p <= 100) fields.caps_percent    = p;
      if (!isNaN(m) && m >= 1  && m <= 100) fields.caps_min_length = m;
    },
  },
  links: {
    actionField: 'links_action', actionChoices: ACTION_CHOICES,
    desc: s => {
      const wl = JSON.parse(s.links_whitelist || '[]');
      return `Discord invites: **${s.links_invites ? 'blocked' : 'allowed'}**\nWhitelist: ${wl.length ? wl.join(', ') : '*none*'}`;
    },
    modalTitle: '🔗 Link Filter — Values',
    modalFields: [
      { id: 'invites',   label: 'Block Discord Invites?  (yes / no)',      value: s => s.links_invites ? 'yes' : 'no'                        },
      { id: 'whitelist', label: 'Allowed Domains  (comma-separated)',       value: s => JSON.parse(s.links_whitelist || '[]').join(', '), long: true },
    ],
    saveModal: (fields, submit) => {
      const inv = submit.fields.getTextInputValue('invites').toLowerCase().trim();
      if (inv === 'yes' || inv === '1') fields.links_invites = 1;
      else if (inv === 'no' || inv === '0') fields.links_invites = 0;
      const raw = submit.fields.getTextInputValue('whitelist').trim();
      const wl  = raw ? raw.split(',').map(d => d.trim().toLowerCase()
        .replace(/^https?:\/\/(www\.)?/, '').split('/')[0]).filter(Boolean) : [];
      fields.links_whitelist = JSON.stringify(wl);
    },
  },
  words: {
    actionField: 'words_action', actionChoices: ACTION_CHOICES,
    desc: () => 'Banned word list is managed separately:\n`/automod words add` · `remove` · `list`',
    modalTitle: null, modalFields: [],
    saveModal: () => {},
  },
  mentions: {
    actionField: 'mentions_action', actionChoices: ACTION_CHOICES,
    desc: s => `Fires when a message contains ≥ **${s.mentions_limit} mentions**.`,
    modalTitle: '📢 Mentions — Values',
    modalFields: [
      { id: 'limit', label: 'Mention Limit  (2–20)', value: s => String(s.mentions_limit) },
    ],
    saveModal: (fields, submit) => {
      const l = parseInt(submit.fields.getTextInputValue('limit'));
      if (!isNaN(l) && l >= 2 && l <= 20) fields.mentions_limit = l;
    },
  },
  emojis: {
    actionField: 'emojis_action', actionChoices: ACTION_CHOICES,
    desc: s => `Fires when a message contains ≥ **${s.emojis_limit} emojis**.`,
    modalTitle: '😄 Emojis — Values',
    modalFields: [
      { id: 'limit', label: 'Emoji Limit  (3–50)', value: s => String(s.emojis_limit) },
    ],
    saveModal: (fields, submit) => {
      const l = parseInt(submit.fields.getTextInputValue('limit'));
      if (!isNaN(l) && l >= 3 && l <= 50) fields.emojis_limit = l;
    },
  },
  dupes: {
    actionField: 'dupes_action', actionChoices: ACTION_CHOICES,
    desc: s => `Fires when the same message is sent ≥ **${s.dupes_limit}×** within **${s.dupes_interval}s**.`,
    modalTitle: '📋 Duplicates — Values',
    modalFields: [
      { id: 'limit',    label: 'Duplicate Count  (2–10)',      value: s => String(s.dupes_limit)    },
      { id: 'interval', label: 'Interval in seconds  (5–300)', value: s => String(s.dupes_interval) },
    ],
    saveModal: (fields, submit) => {
      const l = parseInt(submit.fields.getTextInputValue('limit'));
      const i = parseInt(submit.fields.getTextInputValue('interval'));
      if (!isNaN(l) && l >= 2 && l <= 10)  fields.dupes_limit    = l;
      if (!isNaN(i) && i >= 5 && i <= 300) fields.dupes_interval = i;
    },
  },
  newaccts: {
    actionField: 'newaccts_action',
    actionChoices: [{ name: '👢 Kick', value: 'kick' }, { name: '🔨 Ban', value: 'ban' }],
    desc: s => `Kicks/bans accounts younger than **${s.newaccts_min_days} days**.`,
    modalTitle: '🆕 New Accounts — Values',
    modalFields: [
      { id: 'min_days', label: 'Minimum Account Age in days  (1–365)', value: s => String(s.newaccts_min_days) },
    ],
    saveModal: (fields, submit) => {
      const d = parseInt(submit.fields.getTextInputValue('min_days'));
      if (!isNaN(d) && d >= 1 && d <= 365) fields.newaccts_min_days = d;
    },
  },
  zalgo: {
    actionField: 'zalgo_action', actionChoices: ACTION_CHOICES,
    desc: () => 'Detects and removes corrupted/zalgo unicode text.\nNo numeric thresholds — just set an action.',
    modalTitle: null, modalFields: [],
    saveModal: () => {},
  },
  strikes: {
    actionField: null,
    desc: s => [
      `Timeout at **${s.strikes_timeout_at}** strikes  (${fmtDur(s.strikes_timeout_dur)})`,
      `Kick at **${s.strikes_kick_at}** strikes`,
      `Ban at **${s.strikes_ban_at}** strikes`,
      `Strikes decay after **${s.strikes_decay_hours}h** of clean behaviour`,
    ].join('\n'),
    modalTitle: '⚡ Strikes — Values',
    modalFields: [
      { id: 'timeout_at',  label: 'Timeout at Strike #  (1–10)',   value: s => String(s.strikes_timeout_at)  },
      { id: 'timeout_dur', label: 'Timeout Duration secs  (60+)',  value: s => String(s.strikes_timeout_dur) },
      { id: 'kick_at',     label: 'Kick at Strike #  (2–15)',      value: s => String(s.strikes_kick_at)     },
      { id: 'ban_at',      label: 'Ban at Strike #  (3–20)',       value: s => String(s.strikes_ban_at)      },
      { id: 'decay_hours', label: 'Decay After Hours  (1–720)',    value: s => String(s.strikes_decay_hours) },
    ],
    saveModal: (fields, submit) => {
      const ta = parseInt(submit.fields.getTextInputValue('timeout_at'));
      const td = parseInt(submit.fields.getTextInputValue('timeout_dur'));
      const ka = parseInt(submit.fields.getTextInputValue('kick_at'));
      const ba = parseInt(submit.fields.getTextInputValue('ban_at'));
      const dh = parseInt(submit.fields.getTextInputValue('decay_hours'));
      if (!isNaN(ta) && ta >= 1  && ta <= 10)      fields.strikes_timeout_at  = ta;
      if (!isNaN(td) && td >= 60)                  fields.strikes_timeout_dur = td;
      if (!isNaN(ka) && ka >= 2  && ka <= 15)      fields.strikes_kick_at     = ka;
      if (!isNaN(ba) && ba >= 3  && ba <= 20)      fields.strikes_ban_at      = ba;
      if (!isNaN(dh) && dh >= 1  && dh <= 720)     fields.strikes_decay_hours = dh;
    },
  },
};

// ── Rule config page embed ────────────────────────────────────────────────────
function buildRuleConfigEmbed(s, ruleKey, guild) {
  const cfg  = RULE_CFG[ruleKey];
  const rule = ruleKey === 'setup'
    ? { label: cfg.label, emoji: cfg.emoji, field: 'enabled' }
    : RULES.find(r => r.key === ruleKey);

  const enabled = ruleKey === 'setup' ? !!s.enabled : !!s[rule.field];

  const embed = new EmbedBuilder()
    .setColor(enabled ? 0x57F287 : 0xED4245)
    .setAuthor({ name: `${guild.name}  ·  AutoMod Panel`, iconURL: guild.iconURL({ dynamic: true }) ?? undefined })
    .setTitle(`${rule.emoji}  Configure: ${rule.label}`)
    .setDescription(
      (ruleKey !== 'setup' ? `**Status:** ${enabled ? '🟢 Enabled' : '🔴 Disabled'}\n\n` : '') +
      cfg.desc(s)
    )
    .setFooter({ text: '◀ Back to return to the overview  ·  /automod view for all settings' })
    .setTimestamp();

  if (cfg.actionField) {
    const action = s[cfg.actionField];
    embed.addFields({ name: '⚡ Current Action', value: `${ACTION_EMOJI[action] ?? ''} **${action}**`, inline: true });
  }

  const icon = guild.iconURL({ dynamic: true });
  if (icon) embed.setThumbnail(icon);
  return embed;
}

// ── Rule config page buttons ──────────────────────────────────────────────────
function buildRuleConfigRows(s, ruleKey, uid) {
  const cfg  = RULE_CFG[ruleKey];
  const rule = ruleKey === 'setup'
    ? { label: cfg.label, emoji: cfg.emoji, field: 'enabled' }
    : RULES.find(r => r.key === ruleKey);
  const enabled = !!s[rule.field];
  const rows = [];

  // Row: Action select (if applicable)
  if (cfg.actionField && cfg.actionChoices) {
    const cur = s[cfg.actionField];
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`amp_action_${ruleKey}_${uid}`)
        .setPlaceholder(`⚡ Action: ${cur}`)
        .addOptions(cfg.actionChoices.map(c => ({ label: c.name, value: c.value, default: c.value === cur })))
    ));
  }

  // Row: Values · Toggle/Enable/Disable · Back
  const btns = [];

  if (cfg.modalTitle) {
    btns.push(new ButtonBuilder()
      .setCustomId(`amp_values_${ruleKey}_${uid}`)
      .setEmoji('📝').setLabel('Set Values').setStyle(ButtonStyle.Primary));
  }

  if (ruleKey === 'setup') {
    btns.push(
      new ButtonBuilder().setCustomId(`amp_enable_${uid}`)
        .setEmoji('✅').setLabel('Enable AutoMod').setStyle(ButtonStyle.Success).setDisabled(!!s.enabled),
      new ButtonBuilder().setCustomId(`amp_disable_${uid}`)
        .setEmoji('🔴').setLabel('Disable AutoMod').setStyle(ButtonStyle.Danger).setDisabled(!s.enabled),
    );
  } else {
    btns.push(new ButtonBuilder()
      .setCustomId(`amp_toggle_${ruleKey}_${uid}`)
      .setEmoji(enabled ? '🔴' : '✅')
      .setLabel(enabled ? 'Disable' : 'Enable')
      .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success));
  }

  btns.push(new ButtonBuilder()
    .setCustomId(`amp_back_${uid}`)
    .setEmoji('◀️').setLabel('Back').setStyle(ButtonStyle.Secondary));

  rows.push(new ActionRowBuilder().addComponents(btns));
  return rows;
}

// ── Rule config modal ─────────────────────────────────────────────────────────
function buildRuleModal(ruleKey, s, uid) {
  const cfg   = RULE_CFG[ruleKey];
  const modal = new ModalBuilder()
    .setCustomId(`amp_modal_${ruleKey}_${uid}`)
    .setTitle(cfg.modalTitle);
  for (const f of cfg.modalFields) {
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(f.id)
        .setLabel(f.label)
        .setStyle(f.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setValue(f.value(s))
        .setRequired(f.required !== false)
    ));
  }
  return modal;
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
      let panelView = 'main'; // 'main' or a rule key from RULE_CFG

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

        // ── Close ───────────────────────────────────────────────────────────
        if (id === `amp_close_${uid}`) {
          col.stop('user');
          return i.update({ components: [] });
        }

        // ── Navigate to rule config page ─────────────────────────────────────
        if (id === `amp_cfg_${uid}`) {
          panelView = i.values[0];
          s = db.getAutomodSettings(guildId);
          return i.update({
            embeds: [buildRuleConfigEmbed(s, panelView, interaction.guild)],
            components: buildRuleConfigRows(s, panelView, uid),
          });
        }

        // ── Back to main panel ───────────────────────────────────────────────
        if (id === `amp_back_${uid}`) {
          panelView = 'main';
          s = db.getAutomodSettings(guildId);
          return i.update({
            embeds: [buildPanelEmbed(s, interaction.guild)],
            components: buildPanelRows(s, uid),
          });
        }

        // ── Set Values → show modal, await submit ────────────────────────────
        if (id.startsWith(`amp_values_`)) {
          const ruleKey = id.slice('amp_values_'.length, -(uid.length + 1));
          await i.showModal(buildRuleModal(ruleKey, db.getAutomodSettings(guildId), uid));

          const submit = await i.awaitModalSubmit({
            filter: m => m.customId === `amp_modal_${ruleKey}_${uid}` && m.user.id === uid,
            time: 120_000,
          }).catch(() => null);

          if (submit) {
            const fields = {};
            RULE_CFG[ruleKey].saveModal(fields, submit);
            if (Object.keys(fields).length) db.setAutomodSettings(guildId, fields);
            await submit.deferUpdate().catch(() => {});
            s = db.getAutomodSettings(guildId);
            await msg.edit({
              embeds: [buildRuleConfigEmbed(s, ruleKey, interaction.guild)],
              components: buildRuleConfigRows(s, ruleKey, uid),
            }).catch(() => {});
          }
          return;
        }

        // ── Action select (config page) ──────────────────────────────────────
        if (id.startsWith(`amp_action_`)) {
          const ruleKey = id.slice('amp_action_'.length, -(uid.length + 1));
          const cfg = RULE_CFG[ruleKey];
          if (cfg?.actionField) db.setAutomodSettings(guildId, { [cfg.actionField]: i.values[0] });
        }

        // ── Toggle rule (config page) ────────────────────────────────────────
        else if (id.startsWith(`amp_toggle_`)) {
          const ruleKey = id.slice('amp_toggle_'.length, -(uid.length + 1));
          const rule = RULES.find(r => r.key === ruleKey);
          if (rule) {
            s = db.getAutomodSettings(guildId);
            db.setAutomodSettings(guildId, { [rule.field]: s[rule.field] ? 0 : 1 });
          }
        }

        // ── Enable / Disable master switch ───────────────────────────────────
        else if (id === `amp_enable_${uid}`)  db.setAutomodSettings(guildId, { enabled: 1 });
        else if (id === `amp_disable_${uid}`) db.setAutomodSettings(guildId, { enabled: 0 });

        // ── Main panel toggle buttons (amp_<ruleKey>_<uid>) ──────────────────
        else {
          const key = id.slice('amp_'.length, -(uid.length + 1));
          const rule = RULES.find(r => r.key === key);
          if (rule) {
            s = db.getAutomodSettings(guildId);
            db.setAutomodSettings(guildId, { [rule.field]: s[rule.field] ? 0 : 1 });
          }
        }

        // ── Refresh whichever view we're on ──────────────────────────────────
        s = db.getAutomodSettings(guildId);
        await i.update(panelView === 'main'
          ? { embeds: [buildPanelEmbed(s, interaction.guild)],               components: buildPanelRows(s, uid)                    }
          : { embeds: [buildRuleConfigEmbed(s, panelView, interaction.guild)], components: buildRuleConfigRows(s, panelView, uid) }
        );
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
