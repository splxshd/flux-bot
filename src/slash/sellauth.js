'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const db = require('../database');

const BLUE  = '#5865F2';
const GREEN = '#57F287';
const RED   = '#ED4245';

const OWNER_ID = '1467527738091896986';
const ownerOnly = (i) => i.user.id !== OWNER_ID
  ? i.reply({ content: '❌ This command is restricted to the bot owner.', ephemeral: true }) || true
  : false;

async function sapiRequest(apiKey, method, path, data) {
  return axios({
    method,
    url: `https://sellauth.com/api/v1${path}`,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    data,
    timeout: 10000,
  });
}

// ─── /setapikey ──────────────────────────────────────────────────────────────
const setapikey = {
  data: new SlashCommandBuilder()
    .setName('setapikey')
    .setDescription('Save your SellAuth API key')
    .addStringOption(o => o.setName('key').setDescription('SellAuth API key').setRequired(true)),
  async execute(interaction) {
    if (ownerOnly(interaction)) return;
    const key = interaction.options.getString('key');
    const existing = db.getSellAuth(interaction.user.id);
    if (existing) {
      db.updateSellAuth(interaction.user.id, { api_key: key });
    } else {
      db.setSellAuth(interaction.user.id, key, null, null, null);
    }
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ SellAuth API Key Saved', iconURL: interaction.user.displayAvatarURL() })
        .setDescription('Your API key has been saved securely.')
        .setFooter({ text: 'Use /setshopid next • flux bot' })
        .setTimestamp()],
      ephemeral: true,
    });
  },
};

// ─── /setshopid ──────────────────────────────────────────────────────────────
const setshopid = {
  data: new SlashCommandBuilder()
    .setName('setshopid')
    .setDescription('Save your SellAuth shop ID')
    .addStringOption(o => o.setName('id').setDescription('Shop ID').setRequired(true)),
  async execute(interaction) {
    if (ownerOnly(interaction)) return;
    const shopId = interaction.options.getString('id');
    const existing = db.getSellAuth(interaction.user.id);
    if (!existing) {
      return interaction.reply({ content: '❌ Set your API key first with `/setapikey`.', ephemeral: true });
    }
    db.updateSellAuth(interaction.user.id, { shop_id: shopId });
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ Shop ID Saved', iconURL: interaction.user.displayAvatarURL() })
        .addFields({ name: '🛍️ Shop ID', value: `\`${shopId}\``, inline: true })
        .setFooter({ text: 'flux bot' })
        .setTimestamp()],
      ephemeral: true,
    });
  },
};

// ─── /setproduct ─────────────────────────────────────────────────────────────
const setproduct = {
  data: new SlashCommandBuilder()
    .setName('setproduct')
    .setDescription('Set default product and variant IDs')
    .addStringOption(o => o.setName('product_id').setDescription('Product ID').setRequired(true))
    .addStringOption(o => o.setName('variant_id').setDescription('Variant ID')),
  async execute(interaction) {
    if (ownerOnly(interaction)) return;
    const productId = interaction.options.getString('product_id');
    const variantId = interaction.options.getString('variant_id');
    const existing = db.getSellAuth(interaction.user.id);
    if (!existing) return interaction.reply({ content: '❌ Set your API key first.', ephemeral: true });
    db.updateSellAuth(interaction.user.id, { product_id: productId, variant_id: variantId || null });

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ Default Product Set', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '📦 Product ID', value: `\`${productId}\``, inline: true },
          { name: '🔖 Variant ID', value: variantId ? `\`${variantId}\`` : 'Not set', inline: true },
        )
        .setFooter({ text: 'flux bot' })
        .setTimestamp()],
      ephemeral: true,
    });
  },
};

// ─── /addproduct ─────────────────────────────────────────────────────────────
const addproduct = {
  data: new SlashCommandBuilder()
    .setName('addproduct')
    .setDescription('Add a product to your SellAuth shop')
    .addStringOption(o => o.setName('name').setDescription('Product name').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Description').setRequired(true))
    .addStringOption(o => o.setName('stock_type').setDescription('Stock type (serials/file/service)').setRequired(true))
    .addNumberOption(o => o.setName('price').setDescription('Price in USD').setRequired(true))
    .addStringOption(o => o.setName('variant_name').setDescription('Variant name').setRequired(true)),
  async execute(interaction) {
    if (ownerOnly(interaction)) return;
    const sa = db.getSellAuth(interaction.user.id);
    if (!sa) return interaction.reply({ content: '❌ No SellAuth config found. Use `/setapikey` and `/setshopid`.', ephemeral: true });
    if (!sa.shop_id) return interaction.reply({ content: '❌ Set your shop ID first with `/setshopid`.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const name        = interaction.options.getString('name');
    const description = interaction.options.getString('description');
    const stockType   = interaction.options.getString('stock_type');
    const price       = interaction.options.getNumber('price');
    const variantName = interaction.options.getString('variant_name');

    try {
      const res = await sapiRequest(sa.api_key, 'POST', `/shops/${sa.shop_id}/products`, {
        name, description, variants: [{ name: variantName, price, stock_type: stockType }],
      });

      const productId = res.data.id || res.data.data?.id;
      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ Product Created', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '📦 Name', value: name, inline: true },
          { name: '💵 Price', value: `$${price.toFixed(2)}`, inline: true },
          { name: '🔖 Variant', value: variantName, inline: true },
          { name: '📋 Stock Type', value: stockType, inline: true },
          { name: '🆔 Product ID', value: `\`${productId}\``, inline: true },
        )
        .setFooter({ text: 'SellAuth • flux bot' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      await interaction.editReply(`❌ SellAuth error: ${e.response?.data?.message || e.message}`);
    }
  },
};

// ─── /addvariant ─────────────────────────────────────────────────────────────
const addvariant = {
  data: new SlashCommandBuilder()
    .setName('addvariant')
    .setDescription('Add a variant to an existing product')
    .addStringOption(o => o.setName('product_id').setDescription('Product ID').setRequired(true))
    .addStringOption(o => o.setName('name').setDescription('Variant name').setRequired(true))
    .addNumberOption(o => o.setName('price').setDescription('Price').setRequired(true))
    .addStringOption(o => o.setName('stock_type').setDescription('Stock type').setRequired(true)),
  async execute(interaction) {
    if (ownerOnly(interaction)) return;
    const sa = db.getSellAuth(interaction.user.id);
    if (!sa) return interaction.reply({ content: '❌ No SellAuth config found.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const productId = interaction.options.getString('product_id');
    const name      = interaction.options.getString('name');
    const price     = interaction.options.getNumber('price');
    const stockType = interaction.options.getString('stock_type');

    try {
      await sapiRequest(sa.api_key, 'POST', `/shops/${sa.shop_id}/products/${productId}/variants`, {
        name, price, stock_type: stockType,
      });

      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ Variant Added', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '📦 Product', value: `\`${productId}\``, inline: true },
          { name: '🔖 Variant', value: name, inline: true },
          { name: '💵 Price', value: `$${price.toFixed(2)}`, inline: true },
        )
        .setFooter({ text: 'SellAuth • flux bot' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      await interaction.editReply(`❌ SellAuth error: ${e.response?.data?.message || e.message}`);
    }
  },
};

// ─── /removeproduct ──────────────────────────────────────────────────────────
const removeproduct = {
  data: new SlashCommandBuilder()
    .setName('removeproduct')
    .setDescription('Remove a product from your shop')
    .addStringOption(o => o.setName('id').setDescription('Product ID').setRequired(true)),
  async execute(interaction) {
    if (ownerOnly(interaction)) return;
    const sa = db.getSellAuth(interaction.user.id);
    if (!sa) return interaction.reply({ content: '❌ No SellAuth config.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const productId = interaction.options.getString('id');

    try {
      await sapiRequest(sa.api_key, 'DELETE', `/shops/${sa.shop_id}/products/${productId}`);
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(RED)
          .setAuthor({ name: '🗑️ Product Removed', iconURL: interaction.user.displayAvatarURL() })
          .addFields({ name: '🆔 Product ID', value: `\`${productId}\``, inline: true })
          .setFooter({ text: 'SellAuth • flux bot' })
          .setTimestamp()],
      });
    } catch (e) {
      await interaction.editReply(`❌ SellAuth error: ${e.response?.data?.message || e.message}`);
    }
  },
};

// ─── /restock ────────────────────────────────────────────────────────────────
const restock = {
  data: new SlashCommandBuilder()
    .setName('restock')
    .setDescription('Restock a product variant')
    .addStringOption(o => o.setName('stock').setDescription('Stock content (one item per line or serial keys)').setRequired(true))
    .addStringOption(o => o.setName('product_id').setDescription('Product ID (defaults to saved)'))
    .addStringOption(o => o.setName('variant_id').setDescription('Variant ID (defaults to saved)')),
  async execute(interaction) {
    if (ownerOnly(interaction)) return;
    const sa = db.getSellAuth(interaction.user.id);
    if (!sa) return interaction.reply({ content: '❌ No SellAuth config.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const productId   = interaction.options.getString('product_id') || sa.product_id;
    const variantId   = interaction.options.getString('variant_id') || sa.variant_id;
    const stockContent = interaction.options.getString('stock');

    if (!productId || !variantId) return interaction.editReply('❌ No product/variant ID specified or saved.');

    const items = stockContent.split('\n').map(s => s.trim()).filter(Boolean);

    try {
      await sapiRequest(sa.api_key, 'POST', `/shops/${sa.shop_id}/products/${productId}/variants/${variantId}/stock`, {
        items,
      });

      const embed = new EmbedBuilder()
        .setColor(GREEN)
        .setAuthor({ name: '✅ Restock Successful', iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '📦 Product', value: `\`${productId}\``, inline: true },
          { name: '🔖 Variant', value: `\`${variantId}\``, inline: true },
          { name: '📊 Items Added', value: `**${items.length}**`, inline: true },
        )
        .setFooter({ text: 'SellAuth • flux bot' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      await interaction.editReply(`❌ SellAuth error: ${e.response?.data?.message || e.message}`);
    }
  },
};

module.exports = [setapikey, setshopid, setproduct, addproduct, addvariant, removeproduct, restock];
