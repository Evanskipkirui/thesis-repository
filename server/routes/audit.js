'use strict';

const express = require('express');
const db      = require('../db');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const { requireAdmin } = require('../middleware/auth');
const router  = express.Router();

const STORAGE = path.join(__dirname, '..', '..', 'storage');

/* ── Helper: compute SHA-256 of a file buffer ── */
function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/* ══════════════════════════════════════
   POST /api/audit/run
   Run an integrity audit (admin only)
   Actively re-hashes every stored file
   and compares against recorded SHA-256
   ══════════════════════════════════════ */
router.post('/run', requireAdmin, async (req, res) => {
  try {
    const user = req.session.user;

    // Get all upload versions with thesis + student info
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
      WHERE  vr.event_type = 'upload'
      ORDER  BY vr.thesis_id, vr.version_number
    `);

    const results = [];

    for (const v of versions) {
      const filePath = path.join(STORAGE, v.content_hash + '.pdf');
      let status     = 'PASSED';
      let corrupted  = false;

      if (!fs.existsSync(filePath)) {
        // File missing from storage
        status    = 'FAILED';
        corrupted = true;
      } else {
        // Re-hash the file and compare
        const fileBuffer = fs.readFileSync(filePath);
        const actualHash = hashBuffer(fileBuffer);
        if (actualHash !== v.content_hash) {
          status    = 'FAILED';
          corrupted = true;
        }
      }

      // Update is_corrupted in DB if status changed
      if (corrupted !== Boolean(v.is_corrupted)) {
        await db.query(
          'UPDATE version_records SET is_corrupted = ? WHERE id = ?',
          [corrupted ? 1 : 0, v.id]
        );
      }

      results.push({
        thesisTitle:   v.thesis_title,
        studentName:   v.student_name,
        versionNumber: v.version_number,
        contentHash:   v.content_hash,
        isCorrupted:   corrupted,
        isActive:      Boolean(v.is_active),
        uploadedAt:    v.uploaded_at,
        changeNote:    v.change_note,
        status,
      });
    }

    const total  = results.length;
    const failed = results.filter(r => r.isCorrupted).length;
    const passed = total - failed;

    // Save audit log
    await db.query(
      'INSERT INTO audit_logs (run_by, total_checked, total_failed) VALUES (?, ?, ?)',
      [user.id, total, failed]
    );

    res.json({
      message: `Audit complete — ${passed} passed, ${failed} failed.`,
      total,
      passed,
      failed,
      results,
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
   All students (admin only)
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
