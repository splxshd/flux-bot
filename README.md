# splxshd — Discord Bot

Production-ready Discord bot with 105+ slash commands across 18 categories.

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in your .env values
npm start
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | ✅ | Discord bot token |
| `CLIENT_ID` | ✅ | Bot application client ID |
| `GUILD_ID` | ⬜ | Guild ID for dev (instant deploy). Omit for global |
| `BLOCKCYPHER_TOKEN` | ⬜ | BlockCypher API token (LTC wallet) |
| `GOOGLE_TRANSLATE_KEY` | ⬜ | Google Translate API key (falls back to MyMemory) |
| `ALPHA_VANTAGE_KEY` | ⬜ | Alpha Vantage API key (stock prices) |

## Features

| Category | Commands |
|---|---|
| 🔨 Moderation | ban, tempban, kick, mute, unmute, warn, warnings, clearwarns, notes, history, reason, nuke, nukeschedule, role, rolehumans, rolebots, temprole, temprolelist, forcenickname, forcenicknamelist, rolepersist, unrolepersist, rolerestore, stripstaff, bans, mutes, jaillist, timeoutlist, modstats, raid, talk, silence, unsilence, imute, iunmute, rmute, runmute, fakepermissions, invokemod |
| ℹ️ Utilities | ping, say, purge, purgefilter, snipe, editsnipe, clearsnipe, lock, unlock, hide, unhide, slowmode, channel, thread, webhook, stickymessage, alias, calc, afk, remind, uptime, botuptime, invite, pins, firstmsg, google, image, prefix, translate, log, autoresponder, reaction |
| 🎁 Giveaways | giveaways start/list/cancel/end/reroll/edit |
| 🪙 Wallet | wallet tos/setup/balance/deposit/send/tx/key/restore (real LTC on-chain) |
| 💳 Payments | set, address, payment, pay, setpaypal, paypal, bal, tx, txid, convert, stock, stock_option, stock_remove |
| ⭐ Vouching | setvouch, setvouchexch, vouch |
| 🎫 Tickets | ticket, ticketsetup (full system with transcripts) |
| 🔎 Ticket Watcher | ticketwatcher add/remove/list/preview/editsupport/editrefund |
| 👋 Welcome | welcome setup/message/preview/disable/view |
| 🛡️ Anti-Raid | antiraid enable/disable/config/view |
| 🔔 Autoping | autoping setup/remove/list/toggle/clear |
| 🛠️ Server | emoji add/remove/list, sticker add/remove/list |
| 🛍️ SellAuth | setapikey, setshopid, setproduct, addproduct, addvariant, removeproduct, restock |
| ⚙️ Bot Owner | setstatus, restart, rate |

## Wallet Security

- Private keys are AES-256-GCM encrypted using your BOT_TOKEN as a key derivation source
- Restoration keys are bcrypt-hashed (12 rounds)
- Transactions are fully signed client-side using `tiny-secp256k1` + `ecpair`
- BlockCypher is used for address creation, balance, and broadcasting

## Database

SQLite via `node-sqlite3-wasm` (pure JS, no native compilation required). Database stored at `data/nights.db`.

## Mute System

Uses a role-based "Muted" role (not Discord timeouts). The role is auto-created and its permission overwrites are applied to every channel. New channels automatically get the overwrite via the `channelCreate` event.
