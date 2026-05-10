'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder,
} = require('discord.js');
const axios = require('axios');
const QRCode = require('qrcode');
const db = require('../database');
const ltc = require('../utils/ltcWallet');

const COLORS = {
  wallet: '#A8D8A8',
  send: '#FEE75C',
  error: '#ED4245',
  info: '#5865F2',
  success: '#57F287',
  payment: '#2D2D2D',
  crypto: '#F7931A',
};

const COINS = {
  LTC:  { name: 'Litecoin',  emoji: '🪙', geckoId: 'litecoin',   color: '#BFBBBB' },
  BTC:  { name: 'Bitcoin',   emoji: '₿',  geckoId: 'bitcoin',    color: '#F7931A' },
  ETH:  { name: 'Ethereum',  emoji: 'Ξ',  geckoId: 'ethereum',   color: '#627EEA' },
  SOL:  { name: 'Solana',    emoji: '◎',  geckoId: 'solana',     color: '#9945FF' },
  USDT: { name: 'Tether',    emoji: '💵', geckoId: 'tether',     color: '#26A17B' },
  USDC: { name: 'USD Coin',  emoji: '💵', geckoId: 'usd-coin',   color: '#2775CA' },
};

async function getCoinPrice(geckoId) {
  try {
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd,eur&include_24hr_change=true`,
      { timeout: 8000 }
    );
    return res.data[geckoId] || {};
  } catch { return {}; }
}

async function qrBuffer(text) {
  return QRCode.toBuffer(text, { type: 'png', width: 300, margin: 2 });
}

function fmtLtc(sats) { return (sats / 1e8).toFixed(8); }
function fmtUsd(n) { return n.toFixed(2); }

// ─── /wallet ─────────────────────────────────────────────────────────────────
const wallet = {
  data: new SlashCommandBuilder()
    .setName('wallet')
    .setDescription('LTC on-chain wallet')
    .addSubcommand(s => s.setName('tos').setDescription('View and accept Terms of Service'))
    .addSubcommand(s => s.setName('setup').setDescription('Create your wallet'))
    .addSubcommand(s => s.setName('balance').setDescription('Check your balance'))
    .addSubcommand(s => s.setName('deposit').setDescription('Get your deposit address + QR code'))
    .addSubcommand(s => s.setName('send').setDescription('Send LTC on-chain')
      .addStringOption(o => o.setName('address').setDescription('Recipient LTC address').setRequired(true))
      .addNumberOption(o => o.setName('amount').setDescription('Amount in LTC').setRequired(true)))
    .addSubcommand(s => s.setName('tx').setDescription('View recent transactions'))
    .addSubcommand(s => s.setName('key').setDescription('Rotate your restoration key'))
    .addSubcommand(s => s.setName('restore').setDescription('Restore wallet access with your key')
      .addStringOption(o => o.setName('key').setDescription('Your restoration key').setRequired(true))),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    // ── TOS ──────────────────────────────────────────────────────────────────
    if (sub === 'tos') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('🔐 Wallet Terms of Service')
        .setDescription([
          '> By continuing, you confirm that you have read and agree to all terms below.',
          '',
          '**1.** You are solely responsible for the security of your restoration key.',
          '**2.** The bot operators are **not liable** for any lost funds.',
          '**3.** Private keys are AES-256-GCM encrypted — we do not have plain-text access.',
          '**4.** Transactions are irreversible. Always verify addresses before sending.',
          '**5.** This is a **Litecoin (LTC) mainnet wallet**. Real funds are involved.',
          '**6.** You must be of legal age in your jurisdiction to use this service.',
        ].join('\n'))
        .setFooter({ text: 'flux wallet • Powered by BlockCypher' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tos_accept').setLabel('Accept').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId('tos_decline').setLabel('Decline').setStyle(ButtonStyle.Danger).setEmoji('❌'),
      );

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // ── SETUP ─────────────────────────────────────────────────────────────────
    if (sub === 'setup') {
      if (!db.hasTos(interaction.user.id))
        return interaction.reply({ content: '❌ Accept the TOS first — use `/wallet tos`.', ephemeral: true });
      if (db.getWallet(interaction.user.id))
        return interaction.reply({ content: '❌ You already have a wallet. Use `/wallet balance` to check it.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      try {
        const addrData = await ltc.createLtcAddress();
        const restorationKey = ltc.generateRestorationKey();
        const keyHash = await ltc.hashKey(restorationKey);
        const wifEncrypted = ltc.encryptWif(addrData.private || addrData.wif);

        db.createWallet(interaction.user.id, addrData.address, keyHash, wifEncrypted, addrData.public);

        try {
          await interaction.user.send({
            embeds: [new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle('🔑 Your Restoration Key')
              .setDescription(`\`\`\`\n${restorationKey}\n\`\`\``)
              .addFields({ name: '⚠️ Warning', value: 'Save this key somewhere safe and **never share it**. If lost, your wallet cannot be recovered.' })
              .setFooter({ text: 'flux wallet — Keep this private' })],
          });
        } catch {
          db.run('DELETE FROM wallets WHERE user_id = ?', [interaction.user.id]);
          return interaction.editReply('❌ Could not DM your restoration key. Please **enable DMs** from server members and try again.');
        }

        const embed = new EmbedBuilder()
          .setColor(COLORS.wallet)
          .setTitle('✅ Wallet Created')
          .setDescription('Your LTC wallet is ready. Your restoration key has been sent to your DMs.')
          .addFields(
            { name: '📍 Address', value: `\`${addrData.address}\`` },
            { name: '🔒 Security', value: 'Key encrypted with AES-256-GCM • Restoration key bcrypt-hashed' },
          )
          .setFooter({ text: 'flux wallet • Powered by BlockCypher' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        return interaction.editReply({ content: `❌ Failed to create wallet: ${e.message}` });
      }
    }

    // ── BALANCE ───────────────────────────────────────────────────────────────
    if (sub === 'balance') {
      const w = db.getWallet(interaction.user.id);
      if (!w) return interaction.reply({ content: '❌ No wallet found. Use `/wallet setup`.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      try {
        const [balData, price] = await Promise.all([
          ltc.getLtcBalance(w.address),
          getCoinPrice('litecoin'),
        ]);

        const confirmed = balData.balance / 1e8;
        const unconfirmed = balData.unconfirmed_balance / 1e8;
        const usd = price.usd ? fmtUsd(confirmed * price.usd) : 'N/A';
        const eur = price.eur ? fmtUsd(confirmed * price.eur) : 'N/A';
        const change = price.usd_24h_change || 0;
        const changeStr = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;

        const embed = new EmbedBuilder()
          .setColor(COLORS.wallet)
          .setAuthor({ name: `${interaction.user.tag}'s LTC Wallet`, iconURL: interaction.user.displayAvatarURL() })
          .setDescription(`\`${w.address}\``)
          .addFields(
            { name: '💰 Confirmed Balance', value: `**${confirmed.toFixed(8)} LTC**\n≈ $${usd} • €${eur}`, inline: true },
            { name: '⏳ Unconfirmed', value: `${unconfirmed.toFixed(8)} LTC`, inline: true },
            { name: '​', value: '​', inline: true },
            { name: '📈 LTC Price', value: `$${price.usd ?? 'N/A'}`, inline: true },
            { name: '📊 24h Change', value: changeStr, inline: true },
          )
          .setFooter({ text: 'flux wallet • Prices via CoinGecko' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        return interaction.editReply(`❌ Failed to fetch balance: ${e.message}`);
      }
    }

    // ── DEPOSIT ───────────────────────────────────────────────────────────────
    if (sub === 'deposit') {
      const w = db.getWallet(interaction.user.id);
      if (!w) return interaction.reply({ content: '❌ No wallet found. Use `/wallet setup`.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      try {
        const [price, buf] = await Promise.all([
          getCoinPrice('litecoin'),
          qrBuffer(w.address),
        ]);

        const expiresAt = Math.floor((Date.now() + 20 * 60 * 1000) / 1000);
        db.addDepositMonitor(interaction.user.id, w.address, 'LTC', interaction.channel.id, expiresAt);

        const file = new AttachmentBuilder(buf, { name: 'qr.png' });

        const embed = new EmbedBuilder()
          .setColor(COLORS.wallet)
          .setAuthor({ name: 'Deposit LTC', iconURL: interaction.user.displayAvatarURL() })
          .setDescription('Send LTC to the address below. You\'ll be notified when a deposit is detected.')
          .addFields(
            { name: '📍 Your Address', value: `\`${w.address}\`` },
            { name: '⏱️ Monitor Active', value: `<t:${expiresAt}:R>`, inline: true },
            { name: '💲 LTC Price', value: price.usd ? `$${price.usd}` : 'Unavailable', inline: true },
          )
          .setImage('attachment://qr.png')
          .setFooter({ text: 'flux wallet • Scan QR or copy address' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`copy_addr_${w.address}`).setLabel('Copy Address').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
          new ButtonBuilder().setLabel('View on Explorer').setURL(`https://live.blockcypher.com/ltc/address/${w.address}/`).setStyle(ButtonStyle.Link).setEmoji('🔍'),
        );

        return interaction.editReply({ embeds: [embed], files: [file], components: [row] });
      } catch (e) {
        return interaction.editReply(`❌ Error: ${e.message}`);
      }
    }

    // ── SEND ──────────────────────────────────────────────────────────────────
    if (sub === 'send') {
      const toAddress = interaction.options.getString('address');
      const amount = interaction.options.getNumber('amount');

      const LTC_ADDR_REGEX = /^[LM3][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
      if (!LTC_ADDR_REGEX.test(toAddress))
        return interaction.reply({ content: '❌ Invalid LTC address format.', ephemeral: true });

      const rl = db.getWalletRateLimit(interaction.user.id);
      if (rl && (Math.floor(Date.now() / 1000) - rl.last_send) < 30)
        return interaction.reply({ content: '❌ Rate limited — please wait 30 seconds between sends.', ephemeral: true });

      const w = db.getWallet(interaction.user.id);
      if (!w) return interaction.reply({ content: '❌ No wallet found. Use `/wallet setup`.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      try {
        const [balData, price] = await Promise.all([
          ltc.getLtcBalance(w.address),
          getCoinPrice('litecoin'),
        ]);

        const confirmed = balData.balance / 1e8;
        const fee = 0.0001;
        const total = amount + fee;

        if (confirmed < total) {
          const embed = new EmbedBuilder()
            .setColor(COLORS.error)
            .setTitle('❌ Insufficient Balance')
            .addFields(
              { name: '💰 Your Balance', value: `${confirmed.toFixed(8)} LTC`, inline: true },
              { name: '💸 Required', value: `${total.toFixed(8)} LTC`, inline: true },
            )
            .setTimestamp();
          return interaction.editReply({ embeds: [embed] });
        }

        const usdValue = price.usd ? `≈ $${fmtUsd(amount * price.usd)}` : '';

        const embed = new EmbedBuilder()
          .setColor(COLORS.send)
          .setTitle('⚠️ Confirm Transaction')
          .setDescription('Please review the details below before confirming. **This action cannot be undone.**')
          .addFields(
            { name: '📤 To Address', value: `\`${toAddress}\``, inline: false },
            { name: '💸 Amount', value: `${amount.toFixed(8)} LTC ${usdValue}`, inline: true },
            { name: '⛽ Network Fee', value: `${fee.toFixed(8)} LTC`, inline: true },
            { name: '📊 Total', value: `**${total.toFixed(8)} LTC**`, inline: true },
          )
          .setFooter({ text: 'Expires in 60 seconds' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`send_yes_${toAddress}_${amount}`).setLabel('Confirm Send').setStyle(ButtonStyle.Success).setEmoji('✅'),
          new ButtonBuilder().setCustomId('send_no').setLabel('Cancel').setStyle(ButtonStyle.Danger).setEmoji('❌'),
        );

        return interaction.editReply({ embeds: [embed], components: [row] });
      } catch (e) {
        return interaction.editReply(`❌ Error: ${e.message}`);
      }
    }

    // ── TX ────────────────────────────────────────────────────────────────────
    if (sub === 'tx') {
      const w = db.getWallet(interaction.user.id);
      if (!w) return interaction.reply({ content: '❌ No wallet found.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      try {
        const data = await ltc.getLtcTxs(w.address, 10);
        const txs = data.txrefs || data.unconfirmed_txrefs || [];

        const embed = new EmbedBuilder()
          .setColor(COLORS.info)
          .setAuthor({ name: `Recent Transactions — ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
          .setDescription(`\`${w.address}\``)
          .setFooter({ text: `Last ${Math.min(txs.length, 10)} transaction(s)` })
          .setTimestamp();

        if (txs.length === 0) {
          embed.addFields({ name: 'No transactions', value: 'No on-chain activity found for this address.' });
        } else {
          embed.addFields({
            name: 'History',
            value: txs.slice(0, 10).map(tx => {
              const dir = tx.tx_input_n >= 0 ? '🔴 Sent' : '🟢 Received';
              const amount = (Math.abs(tx.value) / 1e8).toFixed(8);
              const conf = tx.confirmations > 0 ? `${tx.confirmations} conf.` : '⏳ Pending';
              return `${dir} **${amount} LTC** • ${conf}\n[\`${tx.tx_hash.slice(0, 16)}...\`](https://live.blockcypher.com/ltc/tx/${tx.tx_hash}/)`;
            }).join('\n\n'),
          });
        }

        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        return interaction.editReply(`❌ Failed: ${e.message}`);
      }
    }

    // ── KEY ───────────────────────────────────────────────────────────────────
    if (sub === 'key') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.send)
        .setTitle('🔑 Rotate Restoration Key')
        .setDescription('Generating a new key will **immediately invalidate** your current one.\n\nMake sure you store the new key safely before confirming.')
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('key_yes').setLabel('Rotate Key').setStyle(ButtonStyle.Danger).setEmoji('🔑'),
        new ButtonBuilder().setCustomId('key_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }

    // ── RESTORE ───────────────────────────────────────────────────────────────
    if (sub === 'restore') {
      const key = interaction.options.getString('key');
      const w = db.getWallet(interaction.user.id);
      if (!w) return interaction.reply({ content: '❌ No wallet found for your account.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });

      const valid = await ltc.verifyKey(key, w.key_hash);
      if (!valid) {
        const embed = new EmbedBuilder().setColor(COLORS.error).setDescription('❌ Invalid restoration key.').setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.wallet)
        .setTitle('✅ Wallet Access Verified')
        .addFields({ name: '📍 Address', value: `\`${w.address}\`` })
        .setFooter({ text: 'flux wallet' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },

  async handleSendConfirm(interaction) {
    const parts = interaction.customId.replace('send_yes_', '').split('_');
    const toAddress = parts[0];
    const amount = parseFloat(parts[1]);

    if (!toAddress || isNaN(amount))
      return interaction.update({ content: '❌ Invalid transaction data.', embeds: [], components: [] });

    const w = db.getWallet(interaction.user.id);
    if (!w) return interaction.update({ content: '❌ Wallet not found.', embeds: [], components: [] });

    await interaction.update({
      embeds: [new EmbedBuilder().setColor(COLORS.send).setDescription('⏳ Signing and broadcasting transaction...')],
      components: [],
    });

    try {
      const wif = ltc.decryptWif(w.wif_encrypted);
      const result = await ltc.sendLtc(wif, w.address, toAddress, amount);
      const txHash = result.tx?.hash || result.hash;

      db.setWalletRateLimit(interaction.user.id);
      db.addWalletTx(interaction.user.id, 'send', amount, toAddress, txHash, 'confirmed');

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('✅ Transaction Sent')
        .addFields(
          { name: '📤 To', value: `\`${toAddress}\``, inline: false },
          { name: '💸 Amount', value: `${amount.toFixed(8)} LTC`, inline: true },
          { name: '🔗 TX Hash', value: `\`${txHash}\``, inline: false },
        )
        .setFooter({ text: 'flux wallet • Transaction broadcasted' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`copy_txhash_${txHash}`).setLabel('Copy TX Hash').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
        new ButtonBuilder().setLabel('View on Explorer').setURL(`https://live.blockcypher.com/ltc/tx/${txHash}/`).setStyle(ButtonStyle.Link).setEmoji('🔍'),
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (e) {
      const embed = new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Transaction Failed').setDescription(e.message).setTimestamp();
      await interaction.editReply({ embeds: [embed], components: [] });
    }
  },

  async handleKeyRotate(interaction) {
    const w = db.getWallet(interaction.user.id);
    if (!w) return interaction.update({ content: '❌ Wallet not found.', embeds: [], components: [] });

    await interaction.update({
      embeds: [new EmbedBuilder().setColor(COLORS.send).setDescription('⏳ Rotating key...')],
      components: [],
    });

    const newKey = ltc.generateRestorationKey();
    const newHash = await ltc.hashKey(newKey);
    db.updateWalletKey(interaction.user.id, newHash);

    try {
      await interaction.user.send({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('🔑 New Restoration Key')
          .setDescription(`\`\`\`\n${newKey}\n\`\`\``)
          .addFields({ name: '⚠️ Action Required', value: 'Your old key is now **invalid**. Save this immediately.' })
          .setFooter({ text: 'flux wallet — Keep this private' })],
      });
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription('✅ Key rotated successfully. New key sent to your DMs.').setTimestamp()] });
    } catch {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.send).setDescription('✅ Key rotated, but could not DM you. Enable DMs to receive your new key.').setTimestamp()] });
    }
  },
};

// ─── /payment ────────────────────────────────────────────────────────────────
const payment = {
  data: new SlashCommandBuilder()
    .setName('payment')
    .setDescription('Payment addresses, crypto tools and PayPal')
    .addSubcommand(s => s.setName('set').setDescription('Save a crypto wallet address')
      .addStringOption(o => o.setName('coin').setDescription('Coin ticker (LTC, BTC, ETH, SOL, USDT, USDC)').setRequired(true))
      .addStringOption(o => o.setName('address').setDescription('Your address').setRequired(true)))
    .addSubcommand(s => s.setName('address').setDescription('Retrieve your saved address for a coin')
      .addStringOption(o => o.setName('coin').setDescription('Coin ticker').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('List all saved payment addresses'))
    .addSubcommand(s => s.setName('bal').setDescription('Show full balance info for a coin address')
      .addStringOption(o => o.setName('coin').setDescription('Coin (LTC, BTC, ETH, SOL, USDT, USDC)').setRequired(true))
      .addStringOption(o => o.setName('address').setDescription('Address (defaults to your saved one)')))
    .addSubcommand(s => s.setName('tx').setDescription('Show last 10 transactions for a coin address')
      .addStringOption(o => o.setName('coin').setDescription('Coin ticker').setRequired(true))
      .addStringOption(o => o.setName('address').setDescription('Address (defaults to saved)')))
    .addSubcommand(s => s.setName('txid').setDescription('Look up a specific transaction by hash')
      .addStringOption(o => o.setName('coin').setDescription('Coin ticker').setRequired(true))
      .addStringOption(o => o.setName('hash').setDescription('Transaction hash').setRequired(true)))
    .addSubcommand(s => s.setName('convert').setDescription('Convert crypto amounts using live prices')
      .addNumberOption(o => o.setName('amount').setDescription('Amount to convert').setRequired(true))
      .addStringOption(o => o.setName('from').setDescription('From (e.g. LTC, BTC, USD)').setRequired(true))
      .addStringOption(o => o.setName('to').setDescription('To currency (default USD)')))
    .addSubcommand(s => s.setName('setpaypal').setDescription('Save your PayPal settings')
      .addStringOption(o => o.setName('email').setDescription('PayPal email or username').setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Custom embed title'))
      .addStringOption(o => o.setName('description').setDescription('Custom embed description'))
      .addStringOption(o => o.setName('color').setDescription('Embed color (hex)')))
    .addSubcommand(s => s.setName('paypal').setDescription('Generate a PayPal payment embed')
      .addNumberOption(o => o.setName('amount').setDescription('Amount to request (USD)').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── SET ───────────────────────────────────────────────────────────────────
    if (sub === 'set') {
      const coin = interaction.options.getString('coin').toUpperCase();
      const addr = interaction.options.getString('address');
      db.setPaymentAddress(interaction.user.id, coin, addr);
      const meta = COINS[coin];
      const embed = new EmbedBuilder()
        .setColor(meta?.color || COLORS.info)
        .setDescription(`${meta?.emoji || '🪙'} **${coin}** address saved.\n\`${addr}\``)
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── ADDRESS ───────────────────────────────────────────────────────────────
    if (sub === 'address') {
      const coin = interaction.options.getString('coin').toUpperCase();
      const row = db.getPaymentAddress(interaction.user.id, coin);
      if (!row) return interaction.reply({ content: `❌ No **${coin}** address saved. Use \`/payment set\`.`, ephemeral: true });
      const meta = COINS[coin];
      const embed = new EmbedBuilder()
        .setColor(meta?.color || COLORS.info)
        .setTitle(`${meta?.emoji || '🪙'} Your ${coin} Address`)
        .setDescription(`\`${row.address}\``)
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── LIST ──────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const rows = db.getPaymentAddresses(interaction.user.id);
      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('💳 Your Payment Addresses')
        .setTimestamp();
      embed.setDescription(rows.length === 0
        ? 'No addresses saved. Use `/payment set` to add one.'
        : rows.map(r => {
            const meta = COINS[r.coin];
            return `${meta?.emoji || '🪙'} **${r.coin}**\n\`${r.address}\``;
          }).join('\n\n')
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── BAL ───────────────────────────────────────────────────────────────────
    if (sub === 'bal') {
      const coin = interaction.options.getString('coin').toUpperCase();
      let addr = interaction.options.getString('address');
      const coinMeta = COINS[coin];

      if (!coinMeta) return interaction.reply({ content: `❌ Unsupported coin: **${coin}**`, ephemeral: true });

      if (!addr) {
        const saved = db.getPaymentAddress(interaction.user.id, coin);
        if (!saved) return interaction.reply({ content: `❌ No **${coin}** address saved. Pass one or use \`/payment set\`.`, ephemeral: true });
        addr = saved.address;
      }

      await interaction.deferReply();

      try {
        const price = await getCoinPrice(coinMeta.geckoId);
        const priceUsd = price.usd || 0;
        const change24h = price.usd_24h_change || 0;
        const changeSign = change24h >= 0 ? '+' : '';
        const changeEmoji = change24h >= 0 ? '📈' : '📉';

        let balanceData = { balance: 0, unconfirmed: 0, totalReceived: 0, txs: [] };

        if (coin === 'LTC' || coin === 'ETH') {
          const token = process.env.BLOCKCYPHER_TOKEN;
          const url = `https://api.blockcypher.com/v1/${coin.toLowerCase()}/main/addrs/${addr}?limit=5${token ? `&token=${token}` : ''}`;
          const res = await axios.get(url, { timeout: 10000 });
          const factor = coin === 'ETH' ? 1e18 : 1e8;
          balanceData.balance = (res.data.balance || 0) / factor;
          balanceData.unconfirmed = (res.data.unconfirmed_balance || 0) / factor;
          balanceData.totalReceived = (res.data.total_received || 0) / factor;
          balanceData.txs = (res.data.txrefs || []).slice(0, 5);
        } else if (coin === 'BTC') {
          const res = await axios.get(`https://blockchain.info/rawaddr/${addr}?limit=5`, { timeout: 10000 });
          balanceData.balance = res.data.final_balance / 1e8;
          balanceData.unconfirmed = 0;
          balanceData.totalReceived = res.data.total_received / 1e8;
          balanceData.txs = (res.data.txs || []).slice(0, 5).map(tx => ({ tx_hash: tx.hash, value: tx.result, confirmations: tx.block_height ? 1 : 0 }));
        } else if (coin === 'SOL') {
          const res = await axios.post('https://api.mainnet-beta.solana.com', { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [addr] }, { timeout: 10000 });
          balanceData.balance = (res.data.result?.value || 0) / 1e9;
        } else if (coin === 'USDT' || coin === 'USDC') {
          const res = await axios.get(`https://api.ethplorer.io/getAddressInfo/${addr}?apiKey=freekey`, { timeout: 10000 });
          const tokenInfo = (res.data.tokens || []).find(t => t.tokenInfo?.symbol?.toUpperCase() === coin);
          balanceData.balance = tokenInfo ? parseFloat(tokenInfo.balance) / Math.pow(10, tokenInfo.tokenInfo.decimals || 6) : 0;
        }

        const balUsd = fmtUsd(balanceData.balance * priceUsd);
        const unconfUsd = fmtUsd(balanceData.unconfirmed * priceUsd);
        const totalUsd = fmtUsd(balanceData.totalReceived * priceUsd);

        const txLines = balanceData.txs.map(tx => {
          const dir = (tx.value || 0) > 0 ? '🔵' : '🔴';
          const valUsd = fmtUsd(Math.abs(tx.value || 0) * priceUsd);
          return `${dir} from \`${addr.slice(0, 8)}...\` : $${valUsd}`;
        });

        const description = [
          `${coinMeta.emoji} \`${addr}\``,
          '',
          `**💲 Balance**`,
          `$${balUsd}  *(${balanceData.balance.toFixed(8)} ${coin})*`,
          '',
          `**Unconfirmed**`,
          `$${unconfUsd}`,
          '',
          `**Total Received**`,
          `$${totalUsd}`,
          '',
          `**${changeEmoji} 24h Change**`,
          `${changeSign}$${fmtUsd(priceUsd * Math.abs(change24h / 100))} *(${changeSign}${change24h.toFixed(2)}%)*`,
          '',
          `**${coinMeta.emoji} Price**`,
          `$${priceUsd}`,
          '',
          `**Last 5 Transactions**`,
          txLines.length > 0 ? txLines.join('\n') : '_No transactions found_',
        ].join('\n');

        const embed = new EmbedBuilder()
          .setColor(coinMeta.color)
          .setTitle(`${coinMeta.emoji} ${coinMeta.name} Balance`)
          .setDescription(description)
          .setFooter({ text: 'Prices via CoinGecko' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        return interaction.editReply(`❌ Failed to fetch balance: ${e.message}`);
      }
    }

    // ── TX ────────────────────────────────────────────────────────────────────
    if (sub === 'tx') {
      const coin = interaction.options.getString('coin').toUpperCase();
      let addr = interaction.options.getString('address');
      const coinMeta = COINS[coin];
      if (!coinMeta) return interaction.reply({ content: `❌ Unsupported coin: **${coin}**`, ephemeral: true });

      if (!addr) {
        const saved = db.getPaymentAddress(interaction.user.id, coin);
        if (!saved) return interaction.reply({ content: `❌ No **${coin}** address found.`, ephemeral: true });
        addr = saved.address;
      }

      await interaction.deferReply();

      try {
        let txList = [];
        if (coin === 'LTC' || coin === 'ETH') {
          const token = process.env.BLOCKCYPHER_TOKEN;
          const res = await axios.get(`https://api.blockcypher.com/v1/${coin.toLowerCase()}/main/addrs/${addr}?limit=10${token ? `&token=${token}` : ''}`, { timeout: 10000 });
          txList = (res.data.txrefs || []).slice(0, 10);
        } else if (coin === 'BTC') {
          const res = await axios.get(`https://blockchain.info/rawaddr/${addr}?limit=10`, { timeout: 10000 });
          txList = (res.data.txs || []).slice(0, 10).map(t => ({ tx_hash: t.hash, value: t.result, confirmations: t.block_height ? 1 : 0 }));
        }

        const embed = new EmbedBuilder()
          .setColor(coinMeta.color)
          .setTitle(`${coinMeta.emoji} ${coin} Transactions`)
          .setDescription(`\`${addr}\``)
          .setFooter({ text: `Last ${Math.min(txList.length, 10)} transaction(s)` })
          .setTimestamp();

        if (txList.length === 0) {
          embed.addFields({ name: 'No transactions', value: 'No activity found.' });
        } else {
          const factor = coin === 'ETH' ? 1e18 : 1e8;
          embed.addFields({
            name: 'History',
            value: txList.map((t, i) => {
              const dir = (t.value || 0) > 0 ? '🟢 IN' : '🔴 OUT';
              const amount = (Math.abs(t.value || 0) / factor).toFixed(8);
              const conf = t.confirmations > 0 ? '✅ Confirmed' : '⏳ Pending';
              return `\`#${i + 1}\` ${dir} — **${amount} ${coin}** — ${conf}`;
            }).join('\n'),
          });
        }

        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        return interaction.editReply(`❌ Error: ${e.message}`);
      }
    }

    // ── TXID ──────────────────────────────────────────────────────────────────
    if (sub === 'txid') {
      const coin = interaction.options.getString('coin').toUpperCase();
      const hash = interaction.options.getString('hash');
      const coinMeta = COINS[coin];

      const explorerUrls = {
        LTC: `https://live.blockcypher.com/ltc/tx/${hash}/`,
        BTC: `https://blockchain.info/tx/${hash}`,
        ETH: `https://etherscan.io/tx/${hash}`,
        SOL: `https://explorer.solana.com/tx/${hash}`,
      };

      const embed = new EmbedBuilder()
        .setColor(coinMeta?.color || COLORS.info)
        .setTitle('🔍 Transaction Lookup')
        .addFields(
          { name: '🪙 Coin', value: coin, inline: true },
          { name: '🔗 Hash', value: `\`${hash}\`` },
        )
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('View on Explorer').setURL(explorerUrls[coin] || 'https://live.blockcypher.com/').setStyle(ButtonStyle.Link).setEmoji('🔍'),
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    // ── CONVERT ───────────────────────────────────────────────────────────────
    if (sub === 'convert') {
      const amount = interaction.options.getNumber('amount');
      const fromRaw = interaction.options.getString('from').toUpperCase();
      const toRaw = (interaction.options.getString('to') || 'USD').toUpperCase();

      await interaction.deferReply();

      const geckoMap = { LTC: 'litecoin', BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', XRP: 'ripple', DOGE: 'dogecoin' };

      try {
        let resultStr;
        if (geckoMap[fromRaw]) {
          const priceData = await getCoinPrice(geckoMap[fromRaw]);
          const priceUsd = priceData.usd || 0;
          if (toRaw === 'USD') resultStr = `$${fmtUsd(amount * priceUsd)} USD`;
          else if (toRaw === 'EUR') resultStr = `€${fmtUsd(amount * (priceData.eur || 0))} EUR`;
          else if (geckoMap[toRaw]) {
            const toPrice = await getCoinPrice(geckoMap[toRaw]);
            resultStr = `${(amount * priceUsd / (toPrice.usd || 1)).toFixed(8)} ${toRaw}`;
          } else resultStr = `$${fmtUsd(amount * priceUsd)} USD`;
        } else {
          resultStr = `${amount} ${fromRaw} → ${toRaw} (unsupported pair)`;
        }

        const embed = new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('💱 Conversion')
          .addFields(
            { name: 'From', value: `${amount} ${fromRaw}`, inline: true },
            { name: 'To', value: `**${resultStr}**`, inline: true },
          )
          .setFooter({ text: 'Prices via CoinGecko' })
          .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
      } catch (e) {
        return interaction.editReply(`❌ Error: ${e.message}`);
      }
    }

    // ── SETPAYPAL ─────────────────────────────────────────────────────────────
    if (sub === 'setpaypal') {
      const email = interaction.options.getString('email');
      db.setPaypal(interaction.user.id, email,
        interaction.options.getString('title'),
        interaction.options.getString('description'),
        interaction.options.getString('color'),
      );
      return interaction.reply({ content: '✅ PayPal settings saved.', ephemeral: true });
    }

    // ── PAYPAL ────────────────────────────────────────────────────────────────
    if (sub === 'paypal') {
      const amount = interaction.options.getNumber('amount');
      const settings = db.getPaypal(interaction.user.id);
      if (!settings) return interaction.reply({ content: '❌ No PayPal saved. Use `/payment setpaypal`.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(settings.embed_color || '#003087')
        .setTitle(settings.embed_title || '💳 PayPal Payment')
        .setDescription(settings.embed_description || 'Please use the button below to send payment via PayPal.')
        .addFields(
          { name: '💰 Amount', value: `**$${amount.toFixed(2)} USD**`, inline: true },
          { name: '📧 To', value: settings.email, inline: true },
        )
        .setFooter({ text: 'flux • PayPal Payment' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Pay with PayPal')
          .setURL(`https://paypal.me/${settings.email.split('@')[0]}/${amount}`)
          .setStyle(ButtonStyle.Link)
          .setEmoji('💳'),
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }
  },
};

// ─── /pay ────────────────────────────────────────────────────────────────────
const pay = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Generate a crypto payment embed with QR code')
    .addNumberOption(o => o.setName('amount').setDescription('Amount in EUR').setRequired(true))
    .addStringOption(o => o.setName('coin').setDescription('Coin ticker').setRequired(true)),
  async execute(interaction) {
    const amountEur = interaction.options.getNumber('amount');
    const coin = interaction.options.getString('coin').toUpperCase();
    const coinMeta = COINS[coin];

    if (!coinMeta) return interaction.reply({ content: `❌ Unsupported coin: **${coin}**`, ephemeral: true });

    const row = db.getPaymentAddress(interaction.user.id, coin);
    if (!row) return interaction.reply({ content: `❌ No **${coin}** address saved. Use \`/payment set ${coin} <address>\`.`, ephemeral: true });

    await interaction.deferReply();

    try {
      const [price, buf] = await Promise.all([
        getCoinPrice(coinMeta.geckoId),
        qrBuffer(row.address),
      ]);

      const priceUsd = price.usd || 0;
      const priceEur = price.eur || 1;
      const cryptoAmount = priceEur > 0 ? (amountEur / priceEur).toFixed(8) : 'N/A';
      const usdAmount = priceUsd > 0 ? fmtUsd((amountEur / priceEur) * priceUsd) : 'N/A';

      const file = new AttachmentBuilder(buf, { name: 'qr.png' });

      const embed = new EmbedBuilder()
        .setColor(coinMeta.color)
        .setTitle(`${coinMeta.emoji} ${coinMeta.name} (${coin}) Payment`)
        .addFields(
          { name: '💳 Payment Method', value: coinMeta.name, inline: true },
          { name: '💰 Amount', value: `€${amountEur.toFixed(2)} / $${usdAmount}`, inline: true },
          { name: '🔢 Crypto Amount', value: `**${cryptoAmount} ${coin}**`, inline: true },
          { name: '📍 Address', value: `\`${row.address}\`` },
        )
        .setImage('attachment://qr.png')
        .setFooter({ text: `${coin} price: $${priceUsd} • Powered by CoinGecko` })
        .setTimestamp();

      const btns = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`copy_addr_${row.address}`).setLabel('Copy Address').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
        new ButtonBuilder().setCustomId(`copy_amount_${cryptoAmount}`).setLabel('Copy Amount').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
      );

      await interaction.editReply({ embeds: [embed], files: [file], components: [btns] });
      await interaction.followUp({ content: '📩 Send payment proof after paying!' });
    } catch (e) {
      await interaction.editReply(`❌ Error: ${e.message}`);
    }
  },
};

// ─── /stock ──────────────────────────────────────────────────────────────────
const stock = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Look up a stock price and add to your watchlist')
    .addStringOption(o => o.setName('symbol').setDescription('Stock symbol (e.g. AAPL, TSLA)').setRequired(true)),
  async execute(interaction) {
    const symbol = interaction.options.getString('symbol').toUpperCase();
    await interaction.deferReply();

    try {
      const key = process.env.ALPHA_VANTAGE_KEY;
      if (!key) {
        db.addStock(interaction.guild.id, interaction.user.id, symbol);
        return interaction.editReply(`✅ **${symbol}** added to watchlist. (Configure \`ALPHA_VANTAGE_KEY\` for live prices.)`);
      }

      const res = await axios.get(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${key}`, { timeout: 10000 });
      const q = res.data['Global Quote'];
      if (!q || !q['05. price']) return interaction.editReply(`❌ Symbol **${symbol}** not found.`);

      db.addStock(interaction.guild.id, interaction.user.id, symbol);

      const change = parseFloat(q['10. change percent']);
      const changeEmoji = change >= 0 ? '📈' : '📉';

      const embed = new EmbedBuilder()
        .setColor(change >= 0 ? COLORS.success : COLORS.error)
        .setTitle(`${changeEmoji} ${symbol}`)
        .addFields(
          { name: '💵 Price', value: `$${parseFloat(q['05. price']).toFixed(2)}`, inline: true },
          { name: '📊 24h Change', value: `${q['10. change percent']}`, inline: true },
          { name: '📦 Volume', value: parseInt(q['06. volume']).toLocaleString(), inline: true },
          { name: '🔼 High', value: `$${parseFloat(q['03. high']).toFixed(2)}`, inline: true },
          { name: '🔽 Low', value: `$${parseFloat(q['04. low']).toFixed(2)}`, inline: true },
          { name: '📂 Open', value: `$${parseFloat(q['02. open']).toFixed(2)}`, inline: true },
        )
        .setFooter({ text: 'Added to watchlist • Alpha Vantage' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      await interaction.editReply(`❌ Error: ${e.message}`);
    }
  },
};

// ─── /stock_option ───────────────────────────────────────────────────────────
const stock_option = {
  data: new SlashCommandBuilder()
    .setName('stock_option')
    .setDescription('Track a stock option contract')
    .addStringOption(o => o.setName('symbol').setDescription('Stock symbol').setRequired(true))
    .addStringOption(o => o.setName('type').setDescription('Call or Put').setRequired(true).addChoices({ name: 'call', value: 'call' }, { name: 'put', value: 'put' }))
    .addNumberOption(o => o.setName('strike').setDescription('Strike price').setRequired(true))
    .addStringOption(o => o.setName('expiry').setDescription('Expiry date (YYYY-MM-DD)').setRequired(true))
    .addIntegerOption(o => o.setName('qty').setDescription('Quantity (default 1)')),
  async execute(interaction) {
    const symbol = interaction.options.getString('symbol').toUpperCase();
    const type = interaction.options.getString('type');
    const strike = interaction.options.getNumber('strike');
    const expiry = interaction.options.getString('expiry');
    const qty = interaction.options.getInteger('qty') || 1;

    db.addStockOption(interaction.guild.id, interaction.user.id, symbol, type, strike, expiry, qty);

    const embed = new EmbedBuilder()
      .setColor(type === 'call' ? COLORS.success : COLORS.error)
      .setTitle(`${type === 'call' ? '📈' : '📉'} Option Tracked — ${symbol}`)
      .addFields(
        { name: 'Type', value: type.toUpperCase(), inline: true },
        { name: 'Strike', value: `$${strike}`, inline: true },
        { name: 'Expiry', value: expiry, inline: true },
        { name: 'Quantity', value: qty.toString(), inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

// ─── /stock_remove ───────────────────────────────────────────────────────────
const stock_remove = {
  data: new SlashCommandBuilder()
    .setName('stock_remove')
    .setDescription('Remove a stock from your watchlist')
    .addStringOption(o => o.setName('symbol').setDescription('Stock symbol').setRequired(true)),
  async execute(interaction) {
    const symbol = interaction.options.getString('symbol').toUpperCase();
    db.removeStock(interaction.guild.id, interaction.user.id, symbol);
    await interaction.reply({ content: `✅ **${symbol}** removed from your watchlist.` });
  },
};

// ─── /vouch ──────────────────────────────────────────────────────────────────
const vouch = {
  data: new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Vouching commands')
    .addSubcommand(s => s.setName('add').setDescription('Leave a +rep for your vouch target')
      .addIntegerOption(o => o.setName('quantity').setDescription('Quantity').setRequired(true))
      .addStringOption(o => o.setName('product').setDescription('Product name').setRequired(true))
      .addStringOption(o => o.setName('price').setDescription('Price paid').setRequired(true))
      .addStringOption(o => o.setName('payment_method').setDescription('Payment method').setRequired(true)))
    .addSubcommand(s => s.setName('setup').setDescription('Set your vouch target')
      .addUserOption(o => o.setName('user').setDescription('User to receive vouches').setRequired(true)))
    .addSubcommand(s => s.setName('exch').setDescription('Set your exchange vouch target')
      .addUserOption(o => o.setName('user').setDescription('Exchange target user').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const qty = interaction.options.getInteger('quantity');
      const product = interaction.options.getString('product');
      const price = interaction.options.getString('price');
      const paymentMethod = interaction.options.getString('payment_method');

      const vouchData = db.getVouch(interaction.user.id);
      if (!vouchData?.target_user_id)
        return interaction.reply({ content: '❌ No vouch target set. Use `/vouch setup`.', ephemeral: true });

      return interaction.reply({ content: `+rep <@!${vouchData.target_user_id}> | ${qty}x ${product} | ${price} | ${paymentMethod}` });
    }

    if (sub === 'setup') {
      const user = interaction.options.getUser('user');
      db.setVouch(interaction.user.id, user.id);
      return interaction.reply({ content: `✅ Your vouch target has been set to <@!${user.id}>.`, ephemeral: true });
    }

    if (sub === 'exch') {
      const user = interaction.options.getUser('user');
      db.setVouchExch(interaction.user.id, user.id);
      return interaction.reply({ content: `✅ Your exchange vouch target has been set to <@!${user.id}>.`, ephemeral: true });
    }
  },
};

module.exports = [wallet, payment, pay, stock, stock_option, stock_remove, vouch];

module.exports[0].handleSendConfirm = wallet.handleSendConfirm;
module.exports[0].handleKeyRotate = wallet.handleKeyRotate;
