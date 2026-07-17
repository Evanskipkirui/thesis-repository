'use strict';

const express = require('express');
const db      = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router  = express.Router();

/* ══════════════════════════════════════
   POST /api/audit/run
   Run an integrity audit (admin only)
   Simulates re-hash check using stored hashes
   ══════════════════════════════════════ */
router.post('/run', requireAdmin, async (req, res) => {
  try {
    const user = req.session.user;

    // Get all versions with thesis + student info
    const [versions] = await db.query(`
      SELECT
        vr.id,
        vr.thesis_id,
        vr.version_number,
        vr.content_hash,
        vr.is_corrupted,
        vr.is_active,
        vr.uploaded_at,
        vr.change_note,
        t.title  AS thesis_title,
        u.name   AS student_name
      FROM   version_records vr
      JOIN   theses t ON t.id = vr.thesis_id
      JOIN   users  u ON u.id = t.student_id
      ORDER  BY vr.thesis_id, vr.version_number
    `);

    const total  = versions.length;
    const failed = versions.filter(v => v.is_corrupted).length;
    const passed = total - failed;

    // Save audit log
    await db.query(
      'INSERT INTO audit_logs (run_by, total_checked, total_failed) VALUES (?, ?, ?)',
      [user.id, total, failed]
    );

    res.json({
      message:  `Audit complete — ${passed} passed, ${failed} failed.`,
      total,
      passed,
      failed,
      results: versions.map(v => ({
        thesisTitle:   v.thesis_title,
        studentName:   v.student_name,
        versionNumber: v.version_number,
        contentHash:   v.content_hash,
        isCorrupted:   Boolean(v.is_corrupted),
        isActive:      Boolean(v.is_active),
        uploadedAt:    v.uploaded_at,
        changeNote:    v.change_note,
        status:        v.is_corrupted ? 'FAILED' : 'PASSED',
      })),
    });

  } catch (err) {
    console.error('Audit error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ══════════════════════════════════════
   GET /api/audit/logs
   Audit history (admin only)
   ══════════════════════════════════════ */
router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const [logs] = await db.query(`
      SELECT al.*, u.name AS run_by_name
      FROM   audit_logs al
      JOIN   users u ON u.id = al.run_by
      ORDER  BY al.run_at DESC
      LIMIT  50
    `);
    res.json({ logs });
  } catch (err) {
    console.error('Audit logs error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ══════════════════════════════════════
   GET /api/audit/users
   All students — for manage users page (admin only)
   ══════════════════════════════════════ */
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT
        u.id, u.name, u.email, u.role, u.created_at,
        COUNT(t.id) AS thesis_count
      FROM   users u
      LEFT   JOIN theses t ON t.student_id = u.id
      WHERE  u.role = 'student'
      GROUP  BY u.id
      ORDER  BY u.created_at DESC
    `);
    res.json({ users });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
