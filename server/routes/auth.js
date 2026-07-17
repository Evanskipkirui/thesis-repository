'use strict';

const express = require('express');
const bcrypt  = require('bcrypt');
const db      = require('../db');
const router  = express.Router();

/* ══════════════════════════════════════
   POST /api/auth/login
   Body: { email, password }
   ══════════════════════════════════════ */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Fetch user
    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = rows[0];

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const unlockTime = new Date(user.locked_until).toLocaleTimeString();
      return res.status(403).json({
        error: `Account locked due to too many failed attempts. Try again after ${unlockTime}.`
      });
    }

    // Verify password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      // Increment failed attempts
      const newAttempts = (user.failed_attempts || 0) + 1;
      if (newAttempts >= 5) {
        // Lock for 15 minutes
        const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        await db.query(
          'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
          [newAttempts, lockUntil, user.id]
        );
        return res.status(403).json({
          error: 'Too many failed attempts. Account locked for 15 minutes.'
        });
      }
      await db.query(
        'UPDATE users SET failed_attempts = ? WHERE id = ?',
        [newAttempts, user.id]
      );
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Reset failed attempts on successful login
    await db.query(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?',
      [user.id]
    );

    // Store session (never store password_hash)
    req.session.user = {
      id:   user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    res.json({
      message: 'Login successful.',
      user: req.session.user,
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

/* ══════════════════════════════════════
   POST /api/auth/signup
   Body: { name, email, password }
   ══════════════════════════════════════ */
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    // Check duplicate email
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), hash, 'student']
    );

    res.status(201).json({
      message: 'Account created successfully.',
      userId: result.insertId,
    });

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

/* ══════════════════════════════════════
   POST /api/auth/logout
   ══════════════════════════════════════ */
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Could not log out.' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

/* ══════════════════════════════════════
   GET /api/auth/me  — get current session user
   ══════════════════════════════════════ */
router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  res.json({ user: req.session.user });
});

module.exports = router;
