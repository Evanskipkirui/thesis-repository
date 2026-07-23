'use strict';

require('dotenv').config();

const express  = require('express');
const session  = require('express-session');
const cors     = require('cors');
const path     = require('path');
const migrate  = require('./migrate');

const authRoutes     = require('./routes/auth');
const thesesRoutes   = require('./routes/theses');
const versionsRoutes = require('./routes/versions');
const auditRoutes    = require('./routes/audit');

const app  = express();
const PORT = process.env.PORT || 3000;

// Run database migration on startup
migrate();

/* ── Middleware ── */
app.use(cors({
  origin:      true,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ── Sessions ── */
app.use(session({
  secret:            process.env.SESSION_SECRET || 'thesis_secret',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   false,   // set true when using HTTPS
    httpOnly: true,
    maxAge:   1000 * 60 * 60 * 4,  // 4 hours
  },
}));

/* ── Serve static frontend files ── */
const PUBLIC = path.join(__dirname, '..');
app.use(express.static(PUBLIC, {
  index: 'index.html',
}));

/* ── API Routes ── */
app.use('/api/auth',     authRoutes);
app.use('/api/theses',   thesesRoutes);
app.use('/api/versions', versionsRoutes);
app.use('/api/audit',    auditRoutes);

/* ── Catch-all: serve index.html for any non-API route ── */
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

/* ── 404 for unknown API routes ── */
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

/* ── Global error handler ── */
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

/* ── Start server ── */
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Thesis Repository Management System    ║');
  console.log('║   Server running on http://localhost:' + PORT + '  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
