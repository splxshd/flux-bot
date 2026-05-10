'use strict';
require('dotenv').config();

const express        = require('express');
const session        = require('express-session');
const SQLiteStore    = require('connect-sqlite3')(session);
const path           = require('path');

const authRoutes  = require('./routes/auth');
const userRoutes  = require('./routes/user');
const adminRoutes = require('./routes/admin');
const ownerRoutes = require('./routes/owner');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── View engine ───────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Sessions ──────────────────────────────────────────────────────────────────
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'changeme',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
}));

// ── Locals middleware (available in all EJS views) ────────────────────────────
app.use((req, res, next) => {
  res.locals.user      = req.session.user || null;
  res.locals.guilds    = req.session.guilds || [];
  res.locals.BOT_ID    = process.env.BOT_ID || '';
  res.locals.OWNER_ID  = process.env.OWNER_ID || '';
  res.locals.path      = req.path;
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard/user');
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard/user');
  res.render('login');
});

app.use('/auth',            authRoutes);
app.use('/dashboard/user',  userRoutes);
app.use('/dashboard/admin', adminRoutes);
app.use('/dashboard/owner', ownerRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', { code: 404, message: 'Page not found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Dashboard Error]', err);
  res.status(500).render('error', { code: 500, message: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.listen(PORT, () => {
  console.log(`[Dashboard] Running on http://localhost:${PORT}`);
});
