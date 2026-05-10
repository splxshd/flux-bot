'use strict';

const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');

function ltcNetwork() {
  return {
    messagePrefix: '\x19Litecoin Signed Message:\n',
    bech32: 'ltc',
    bip32: { public: 0x019da462, private: 0x019d9cfe },
    pubKeyHash: 0x30,
    scriptHash: 0x32,
    wif: 0xb0,
  };
}

function getEncryptionKey() {
  return crypto.createHash('sha256').update(process.env.BOT_TOKEN).digest();
}

function encryptWif(wif) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(wif, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptWif(encryptedB64) {
  const key = getEncryptionKey();
  const buf = Buffer.from(encryptedB64, 'base64');
  const iv = buf.slice(0, 12);
  const authTag = buf.slice(12, 28);
  const encrypted = buf.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

function generateRestorationKey() {
  return `${uuidv4()}-${uuidv4()}`;
}

async function hashKey(key) {
  return bcrypt.hash(key, 12);
}

async function verifyKey(key, hash) {
  return bcrypt.compare(key, hash);
}

async function createLtcAddress() {
  const token = process.env.BLOCKCYPHER_TOKEN;
  const url = `https://api.blockcypher.com/v1/ltc/main/addrs${token ? `?token=${token}` : ''}`;
  const res = await axios.post(url);
  return res.data; // { address, public, private (WIF), wif }
}

async function getLtcBalance(address) {
  const token = process.env.BLOCKCYPHER_TOKEN;
  const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/balance${token ? `?token=${token}` : ''}`;
  const res = await axios.get(url, { timeout: 10000 });
  return res.data;
}

async function getLtcTxs(address, limit = 10) {
  const token = process.env.BLOCKCYPHER_TOKEN;
  const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${address}?limit=${limit}${token ? `&token=${token}` : ''}`;
  const res = await axios.get(url, { timeout: 10000 });
  return res.data;
}

async function sendLtc(wif, fromAddress, toAddress, amountLtc) {
  const secp256k1 = require('tiny-secp256k1');
  const { ECPairFactory } = require('ecpair');
  const ECPair = ECPairFactory(secp256k1);
  const token = process.env.BLOCKCYPHER_TOKEN;
  const tokenParam = token ? `?token=${token}` : '';

  const satoshis = Math.round(amountLtc * 1e8);
  const fee = 10000; // 0.0001 LTC in satoshis

  // Build skeleton
  const skeletonRes = await axios.post(`https://api.blockcypher.com/v1/ltc/main/txs/new${tokenParam}`, {
    inputs: [{ addresses: [fromAddress] }],
    outputs: [{ addresses: [toAddress], value: satoshis }],
  }, { timeout: 15000 });

  const skeleton = skeletonRes.data;
  if (skeleton.errors && skeleton.errors.length) {
    throw new Error(skeleton.errors.map(e => e.error).join(', '));
  }

  const keyPair = ECPair.fromWIF(wif, ltcNetwork());
  const signatures = skeleton.tosign.map(hash =>
    Buffer.from(secp256k1.sign(Buffer.from(hash, 'hex'), keyPair.privateKey)).toString('hex')
  );
  const pubkeys = skeleton.tosign.map(() => keyPair.publicKey.toString('hex'));

  // Broadcast
  const sendRes = await axios.post(`https://api.blockcypher.com/v1/ltc/main/txs/send${tokenParam}`, {
    ...skeleton,
    signatures,
    pubkeys,
  }, { timeout: 15000 });

  return sendRes.data;
}

async function getCoinPrice(coinGeckoId) {
  const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoId}&vs_currencies=usd,eur&include_24hr_change=true`, { timeout: 8000 });
  return res.data[coinGeckoId] || {};
}

module.exports = {
  ltcNetwork, encryptWif, decryptWif,
  generateRestorationKey, hashKey, verifyKey,
  createLtcAddress, getLtcBalance, getLtcTxs, sendLtc,
  getCoinPrice,
};
