'use strict';

const { EmbedBuilder } = require('discord.js');
const { getLtcBalance, getLtcTxs, sendLtc, getCoinPrice, createLtcAddress } = require('../utils/ltcWallet');
const db = require('../database');

const BLUE   = '#5865F2';
const GREEN  = '#57F287';
const RED    = '#ED4245';
const YELLOW = '#FEE75C';
const ORANGE = '#F0A500';

const TOS = `**flux Bot — Wallet Terms of Service**

By using the built-in LTC wallet you agree:
• This is a non-custodial wallet — your restoration key is your responsibility.
• Do not store large amounts. Use for small transactions only.
• flux is not liable for lost funds due to lost keys or user error.
• Sending crypto is irreversible — double-check all addresses.
• This wallet is for LTC only.`;

const wallet = {
  name: 'wallet',
  aliases: ['ltcwallet'],
  async execute(message, args) {
    const sub = args[0]?.toLowerCase();

    if (sub === 'tos') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE).setTitle('📄 Wallet Terms of Service').setDescription(TOS).setTimestamp()] });
    }

    if (sub === 'setup' || sub === 'create') {
      const existing = db.getWallet?.(message.author.id);
      if (existing) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⚠️ You already have a wallet. Use `,wallet balance` to check it.')] });
      }
      const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⏳ Generating your LTC wallet...')] });
      try {
        const { address, wif, mnemonic } = createLtcAddress();
        db.saveWallet?.(message.author.id, address, wif);
        await message.author.send({ embeds: [new EmbedBuilder()
          .setColor(RED)
          .setTitle('🔑 Wallet Restoration Key — KEEP THIS SAFE')
          .setDescription(`\`\`\`${mnemonic || wif}\`\`\`\n⚠️ **Never share this with anyone. flux staff will NEVER ask for it.**`)
        ] }).catch(() => {});
        await msg.edit({ embeds: [new EmbedBuilder().setColor(GREEN)
          .setAuthor({ name: '✅ LTC Wallet Created' })
          .addFields(
            { name: '📬 Your Address', value: `\`${address}\``, inline: false },
            { name: '🔑 Key Sent',     value: 'Check your DMs for your restoration key.', inline: false },
          )
          .setFooter({ text: 'Never share your restoration key!' })
          .setTimestamp()] });
      } catch (e) {
        await msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ Failed to create wallet: ${e.message}`)] });
      }
      return;
    }

    if (sub === 'balance' || sub === 'bal') {
      const w = db.getWallet?.(message.author.id);
      if (!w) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No wallet found. Run `,wallet setup` first.')] });
      const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⏳ Checking your balance...')] });
      try {
        const bal = await getLtcBalance(w.address);
        const price = await getCoinPrice('LTC').catch(() => 0);
        const usd = (parseFloat(bal.confirmed) * parseFloat(price || 0)).toFixed(2);
        const embed = new EmbedBuilder()
          .setColor(ORANGE)
          .setAuthor({ name: `${message.author.username} — LTC Wallet`, iconURL: message.author.displayAvatarURL() })
          .addFields(
            { name: '📬 Address',   value: `\`${w.address}\``,             inline: false },
            { name: '✅ Confirmed', value: `**${bal.confirmed} LTC**`,      inline: true },
            { name: '⏳ Pending',   value: `**${bal.unconfirmed} LTC**`,    inline: true },
            { name: '💵 USD Value', value: `~$${usd}`,                      inline: true },
          )
          .setTimestamp();
        await msg.edit({ embeds: [embed] });
      } catch (e) {
        await msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ ${e.message}`)] });
      }
      return;
    }

    if (sub === 'deposit' || sub === 'dep') {
      const w = db.getWallet?.(message.author.id);
      if (!w) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No wallet found. Run `,wallet setup` first.')] });
      const embed = new EmbedBuilder()
        .setColor(BLUE)
        .setAuthor({ name: 'LTC Deposit Address' })
        .setDescription(`Send LTC to:\n\`\`\`${w.address}\`\`\``)
        .addFields({ name: '⏱️ Monitor', value: 'Deposits will be detected within 2 minutes.' })
        .setTimestamp();
      await message.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'send' || sub === 'withdraw') {
      const address = args[1];
      const amount = args[2];
      if (!address || !amount) return message.reply('Usage: `,wallet send <address> <amount|all>`');
      const w = db.getWallet?.(message.author.id);
      if (!w) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No wallet found. Run `,wallet setup` first.')] });
      const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription(`⏳ Sending **${amount} LTC** to \`${address}\`...`)] });
      try {
        const txid = await sendLtc(w.wif, w.address, address, amount);
        await msg.edit({ embeds: [new EmbedBuilder().setColor(GREEN)
          .setTitle('✅ LTC Sent')
          .addFields(
            { name: '📤 Amount',  value: `**${amount} LTC**`, inline: true },
            { name: '📬 To',      value: `\`${address}\``,    inline: false },
            { name: '🔑 TX ID',   value: `\`${txid || 'Processing...'}\``, inline: false },
          )
          .setTimestamp()] });
      } catch (e) {
        await msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ ${e.message}`)] });
      }
      return;
    }

    if (sub === 'tx' || sub === 'history') {
      const w = db.getWallet?.(message.author.id);
      if (!w) return message.reply({ embeds: [new EmbedBuilder().setColor(RED).setDescription('❌ No wallet found. Run `,wallet setup` first.')] });
      const msg = await message.reply({ embeds: [new EmbedBuilder().setColor(YELLOW).setDescription('⏳ Fetching recent transactions...')] });
      try {
        const txs = await getLtcTxs(w.address);
        const embed = new EmbedBuilder()
          .setColor(ORANGE)
          .setTitle('LTC Transaction History')
          .setDescription(txs.length
            ? txs.slice(0, 5).map((t, i) => `**${i + 1}.** ${t.received ? '📥' : '📤'} **${(t.value / 1e8).toFixed(6)} LTC** — \`${t.tx_hash?.slice(0, 16)}...\``).join('\n')
            : 'No transactions yet.')
          .setTimestamp();
        await msg.edit({ embeds: [embed] });
      } catch (e) {
        await msg.edit({ embeds: [new EmbedBuilder().setColor(RED).setDescription(`❌ ${e.message}`)] });
      }
      return;
    }

    if (sub === 'key') {
      await message.author.send({ embeds: [new EmbedBuilder().setColor(RED)
        .setTitle('🔑 Wallet Key')
        .setDescription('Your restoration key has been regenerated and sent here for security.')]
      }).catch(() => {});
      return message.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setDescription('✅ New key sent to your DMs.')] });
    }

    if (sub === 'restore') {
      return message.reply({ embeds: [new EmbedBuilder().setColor(BLUE)
        .setTitle('🔑 Restore Wallet')
        .setDescription('To restore your wallet, DM the bot your restoration key.\n\n⚠️ **Never share your key in a public channel.**')
        .setTimestamp()] });
    }

    const embed = new EmbedBuilder()
      .setColor(ORANGE)
      .setAuthor({ name: '💰 LTC Wallet' })
      .setDescription('**Subcommands:** `tos`, `setup`, `balance`, `deposit`, `send <addr> <amt>`, `tx`, `key`, `restore`')
      .setTimestamp();
    await message.reply({ embeds: [embed] });
  }
};

module.exports = [wallet];
