'use strict';

const express  = require('express');
const db       = require('../db');
const { requireLogin, requireStudent, requireAdmin } = require('../middleware/auth');
const router   = express.Router();

/* ══════════════════════════════════════
   GET /api/theses
   Admin → all theses
   Student → only their own
   ══════════════════════════════════════ */
router.get('/', requireLogin, async (req, res) => {
  try {
    const user = req.session.user;
    let rows;

    if (user.role === 'admin') {
      [rows] = await db.query(`
        SELECT t.*, u.name AS student_name
        FROM   theses t
        JOIN   users  u ON u.id = t.student_id
        ORDER  BY t.created_at DESC
      `);
    } else {
      [rows] = await db.query(`
        SELECT t.*, u.name AS student_name
        FROM   theses t
        JOIN   users  u ON u.id = t.student_id
        WHERE  t.student_id = ?
        ORDER  BY t.created_at DESC
      `, [user.id]);
    }

    res.json({ theses: rows });

  } catch (err) {
    console.error('Get theses error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ══════════════════════════════════════
   GET /api/theses/stats/summary
   Dashboard stats for current user
   ══════════════════════════════════════ */
router.get('/stats/summary', requireLogin, async (req, res) => {
  try {
    const user = req.session.user;

    if (user.role === 'admin') {
      const [[students]]  = await db.query("SELECT COUNT(*) AS cnt FROM users WHERE role='student'");
      const [[theses]]    = await db.query('SELECT COUNT(*) AS cnt FROM theses');
      const [[versions]]  = await db.query("SELECT COUNT(*) AS cnt FROM version_records WHERE event_type='upload'");
      const [[corrupted]] = await db.query("SELECT COUNT(*) AS cnt FROM version_records WHERE is_corrupted=1 AND event_type='upload'");

      return res.json({
        students:  students.cnt,
        theses:    theses.cnt,
        versions:  versions.cnt,
        corrupted: corrupted.cnt,
      });
    }

    // Student stats
    const [[myTheses]]   = await db.query('SELECT COUNT(*) AS cnt FROM theses WHERE student_id=?', [user.id]);
    const [[myVersions]] = await db.query(`
      SELECT COUNT(*) AS cnt
      FROM   version_records vr
      JOIN   theses t ON t.id = vr.thesis_id
      WHERE  t.student_id = ?
      AND    vr.event_type = 'upload'
    `, [user.id]);
    const [lastUpload] = await db.query(`
      SELECT vr.uploaded_at
      FROM   version_records vr
      JOIN   theses t ON t.id = vr.thesis_id
      WHERE  t.student_id = ?
      ORDER  BY vr.uploaded_at DESC
      LIMIT  1
    `, [user.id]);

    res.json({
      theses:     myTheses.cnt,
      versions:   myVersions.cnt,
      lastUpload: lastUpload.length ? lastUpload[0].uploaded_at : null,
    });

  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ══════════════════════════════════════
   GET /api/theses/:id
   ══════════════════════════════════════ */
router.get('/:id', requireLogin, async (req, res) => {
  try {
    const user = req.session.user;
    const [rows] = await db.query(`
      SELECT t.*, u.name AS student_name
      FROM   theses t
      JOIN   users  u ON u.id = t.student_id
      WHERE  t.id = ?
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Thesis not found.' });

    const thesis = rows[0];
    // Students can only view their own
    if (user.role === 'student' && thesis.student_id !== user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json({ thesis });

  } catch (err) {
    console.error('Get thesis error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ══════════════════════════════════════
   POST /api/theses
   Register a new thesis (students only)
   Body: { title, abstract }
   ══════════════════════════════════════ */
router.post('/', requireStudent, async (req, res) => {
  try {
    const { title, abstract } = req.body;
    const user = req.session.user;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required.' });
    }
    if (!abstract || !abstract.trim()) {
      return res.status(400).json({ error: 'Abstract is required.' });
    }
    if (title.trim().length > 300) {
      return res.status(400).json({ error: 'Title must not exceed 300 characters.' });
    }

    const [result] = await db.query(
      'INSERT INTO theses (student_id, title, abstract) VALUES (?, ?, ?)',
      [user.id, title.trim(), abstract.trim()]
    );

    res.status(201).json({
      message: 'Thesis registered successfully.',
      thesisId: result.insertId,
    });

  } catch (err) {
    console.error('Register thesis error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
