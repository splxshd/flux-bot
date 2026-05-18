'use strict';
const express = require('express');
const { exchangeCode, getUser, getGuilds, getMutualGuilds } = require('../lib/discord');

const router = express.Router();

const SCOPES = 'identify guilds';

router.get('/login', (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.DISCORD_CLIENT_ID,
    redirect_uri:  process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/login');

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.access_token) return res.redirect('/login');

    const [user, allGuilds] = await Promise.all([
      getUser(tokens.access_token),
      getGuilds(tokens.access_token),
    ]);

    const mutualGuilds = await getMutualGuilds(allGuilds);

    req.session.user       = user;
    req.session.guilds     = mutualGuilds;
    req.session.allGuilds  = allGuilds;
    req.session.accessToken = tokens.access_token;

    const returnTo = req.session.returnTo || '/dashboard/user';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error('[Auth] Callback error:', err.message);
    res.redirect('/login');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
