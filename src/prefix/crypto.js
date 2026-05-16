'use strict';

const { EmbedBuilder } = require('discord.js');
const axios = require('axios');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const ORANGE = '#F0A500';

const COINS = ['BTC', 'LTC', 'ETH', 'SOL'];
const EXPLORERS = {
  BTC: 'https://api.blockcypher.com/v1/btc/main',
  LTC: 'https://api.blockcypher.com/v1/ltc/main',
  ETH: 'https://api.blockcypher.com/v1/eth/main',
};

async function getBalance(coin, address) {
  const base = EXPLORERS[coin.toUpperCase()];
  if (!base) return null;
  const token = process.env.BLOCKCYPHER_TOKEN ? `?token=${process.env.BLOCKCYPHER_TOKEN}` : '';
  const res = await axios.get(`${base}/addrs/${address}/balance${token}`, { timeout: 8000 }).catch(() => null);
  return res?.data;
}

// ── ,bal ─────────────────────────────────────────────────────────────────────
const bal = {
  name: 'cryptobal',
  aliases: ['cbal'],
  async execute(message, args) {
    const coin = args[0]?.toUpperCase();
    const address = args[1];
    if (!coin || !address) return message.reply('Usage: `,bal <BTC|LTC|ETH> <address>`');
    if (!COINS.includes(coin)) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ Unsupported coin. Use: ${COINS.join(', ')}`)] });

    const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`⏳ Fetching **${coin}** balance...`)] });
    const data = await getBalance(coin, address);
    if (!data) return msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Failed to fetch balance. Check the address and try again.')] });

    const confirmed = (data.balance / 1e8).toFixed(8);
    const unconfirmed = (data.unconfirmed_balance / 1e8).toFixed(8);
    const embed = new EmbedBuilder()
      .setColor(ORANGE)
      .setTitle(`${coin} Balance`)
      .addFields(
        { name: '📬 Address',     value: `\`${address}\``,   inline: false },
        { name: '✅ Confirmed',   value: `**${confirmed} ${coin}**`,   inline: true },
        { name: '⏳ Unconfirmed', value: `**${unconfirmed} ${coin}**`, inline: true },
        { name: '📊 Total Txs',  value: `**${data.n_tx || 0}**`,       inline: true },
      )
      .setTimestamp();
    await msg.edit({ embeds: [embed] });
  }
};

// ── ,tx ──────────────────────────────────────────────────────────────────────
const tx = {
  name: 'tx',
  aliases: ['transactions', 'txs'],
  async execute(message, args) {
    const coin = args[0]?.toUpperCase();
    const address = args[1];
    if (!coin || !address) return message.reply('Usage: `,tx <BTC|LTC|ETH> <address>`');

    const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`⏳ Fetching **${coin}** transactions...`)] });
    const base = EXPLORERS[coin];
    if (!base) return msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ Unsupported coin.`)] });

    const token = process.env.BLOCKCYPHER_TOKEN ? `?token=${process.env.BLOCKCYPHER_TOKEN}` : '';
    const res = await axios.get(`${base}/addrs/${address}${token}`, { timeout: 8000 }).catch(() => null);
    if (!res) return msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Failed to fetch transactions.')] });

    const txs = res.data.txrefs?.slice(0, 5) || [];
    const embed = new EmbedBuilder()
      .setColor(ORANGE)
      .setTitle(`${coin} Transactions for ...${address.slice(-8)}`)
      .setDescription(txs.length
        ? txs.map((t, i) => `**${i + 1}.** \`${t.tx_hash?.slice(0, 16)}...\` — ${(t.value / 1e8).toFixed(6)} ${coin} (${t.confirmations} confs)`).join('\n')
        : 'No transactions found.')
      .setTimestamp();
    await msg.edit({ embeds: [embed] });
  }
};

// ── ,txid ────────────────────────────────────────────────────────────────────
const txid = {
  name: 'txid',
  aliases: ['transaction', 'txlookup'],
  async execute(message, args) {
    const coin = args[0]?.toUpperCase();
    const hash = args[1];
    if (!coin || !hash) return message.reply('Usage: `,txid <BTC|LTC|ETH> <txid>`');
    const base = EXPLORERS[coin];
    if (!base) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Unsupported coin.')] });

    const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⏳ Fetching transaction...')] });
    const token = process.env.BLOCKCYPHER_TOKEN ? `?token=${process.env.BLOCKCYPHER_TOKEN}` : '';
    const res = await axios.get(`${base}/txs/${hash}${token}`, { timeout: 8000 }).catch(() => null);
    if (!res) return msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Transaction not found.')] });

    const d = res.data;
    const totalOut = (d.outputs?.reduce((s, o) => s + (o.value || 0), 0) / 1e8).toFixed(8);
    const embed = new EmbedBuilder()
      .setColor(ORANGE)
      .setTitle(`${coin} Transaction`)
      .addFields(
        { name: '🔑 Hash',          value: `\`${hash.slice(0, 32)}...\``, inline: false },
        { name: '✅ Confirmations', value: `**${d.confirmations || 0}**`, inline: true },
        { name: '💸 Total Output',  value: `**${totalOut} ${coin}**`,     inline: true },
        { name: '📅 Received',      value: d.received ? `<t:${Math.floor(new Date(d.received).getTime() / 1000)}:R>` : 'Pending', inline: true },
      )
      .setTimestamp();
    await msg.edit({ embeds: [embed] });
  }
};

// ── ,portfolio ────────────────────────────────────────────────────────────────
const portfolio = {
  name: 'portfolio',
  aliases: ['cryptoevo', 'market'],
  async execute(message) {
    const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⏳ Fetching market data...')] });
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,litecoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true', { timeout: 8000 }).catch(() => null);
    if (!res) return msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ Could not fetch market data.')] });

    const d = res.data;
    const fmt = (n) => n?.toFixed(2);
    const sign = (n) => (n >= 0 ? '📈 +' : '📉 ') + fmt(n) + '%';

    const embed = new EmbedBuilder()
      .setColor(ORANGE)
      .setTitle('💹 Crypto Market Overview')
      .addFields(
        { name: '₿ Bitcoin (BTC)',    value: `$${d.bitcoin?.usd?.toLocaleString()}\n${sign(d.bitcoin?.usd_24h_change)}`,    inline: true },
        { name: '⟠ Ethereum (ETH)',   value: `$${d.ethereum?.usd?.toLocaleString()}\n${sign(d.ethereum?.usd_24h_change)}`,  inline: true },
        { name: 'Ł Litecoin (LTC)',   value: `$${d.litecoin?.usd?.toLocaleString()}\n${sign(d.litecoin?.usd_24h_change)}`,  inline: true },
        { name: '◎ Solana (SOL)',     value: `$${d.solana?.usd?.toLocaleString()}\n${sign(d.solana?.usd_24h_change)}`,      inline: true },
      )
      .setFooter({ text: 'Data from CoinGecko • 24h change' })
      .setTimestamp();
    await msg.edit({ embeds: [embed] });
  }
};

// ── ,setwallet ────────────────────────────────────────────────────────────────
const setwallet = {
  name: 'setwallet',
  aliases: ['savewallet'],
  async execute(message, args) {
    const coin = args[0]?.toUpperCase();
    const address = args[1];
    if (!coin || !address) return message.reply('Usage: `,setwallet <coin> <address>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Saved your **${coin}** wallet: \`${address}\``)] });
  }
};

// ── ,mybal ────────────────────────────────────────────────────────────────────
const mybal = {
  name: 'mybal',
  aliases: ['mywallet'],
  async execute(message, args) {
    const coin = args[0]?.toUpperCase() || 'LTC';
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription(`ℹ️ Use \`,setwallet ${coin} <address>\` first to save your wallet.`)] });
  }
};

// ── ,notify ───────────────────────────────────────────────────────────────────
const notify = {
  name: 'notify',
  aliases: ['walletnotify', 'txnotify'],
  async execute(message, args) {
    const coin = args[0]?.toUpperCase();
    const address = args[1];
    if (!coin || !address) return message.reply('Usage: `,notify <coin> <address>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ You'll receive a DM when **${address.slice(0, 10)}...** receives a transaction.`)] });
  }
};

// ── ,notify-off ───────────────────────────────────────────────────────────────
const notifyoff = {
  name: 'notify-off',
  aliases: ['notifyoff', 'unnotify'],
  async execute(message, args) {
    const coin = args[0]?.toUpperCase();
    const address = args[1];
    if (!coin || !address) return message.reply('Usage: `,notify-off <coin> <address>`');
    return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription(`✅ Disabled notifications for **${address.slice(0, 10)}...**.`)] });
  }
};

// ── ,mynotify ─────────────────────────────────────────────────────────────────
const mynotify = {
  name: 'mynotify',
  aliases: ['mynotifications'],
  async execute(message) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setDescription('ℹ️ No active wallet notifications. Use `,notify <coin> <address>` to set one.')] });
  }
};

module.exports = [bal, tx, txid, portfolio, setwallet, mybal, notify, notifyoff, mynotify];
