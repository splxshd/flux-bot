'use strict';
const { hasManageGuild, getGuildMember } = require('../lib/discord');

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

async function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  const { guildId } = req.params;
  const guild = (req.session.guilds || []).find(g => g.id === guildId);
  if (!guild) return res.status(403).render('error', { code: 403, message: 'You do not have access to this server.' });
  if (!hasManageGuild(guild.permissions || '0')) {
    return res.status(403).render('error', { code: 403, message: 'You need Manage Server permission.' });
  }
  req.guild = guild;
  next();
}

function requireOwner(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.id !== process.env.OWNER_ID) {
    return res.status(403).render('error', { code: 403, message: 'Owner only.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireOwner };
