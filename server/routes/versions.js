'use strict';

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const db       = require('../db');
const { requireLogin, requireStudent, requireAdmin } = require('../middleware/auth');
const router   = express.Router();

/* ── Storage folder ── */
const STORAGE = path.join(__dirname, '..', '..', 'storage');
if (!fs.existsSync(STORAGE)) fs.mkdirSync(STORAGE, { recursive: true });

/* ── Multer: store file temporarily in memory so we can hash it ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter(req, file, cb) {
    if (file.mimetype === 'application/pdf' ||
        file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted.'));
    }
  },
});

/* ── Helper: compute SHA-256 of a buffer ── */
function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/* ══════════════════════════════════════
   GET /api/versions/:thesisId
   All versions for a thesis
   ══════════════════════════════════════ */
router.get('/:thesisId', requireLogin, async (req, res) => {
  try {
    const user     = req.session.user;
    const thesisId = parseInt(req.params.thesisId);

    const [thesisRows] = await db.query(
      'SELECT t.*, u.name AS student_name FROM theses t JOIN users u ON u.id = t.student_id WHERE t.id = ?',
      [thesisId]
    );
    if (!thesisRows.length) return res.status(404).json({ error: 'Thesis not found.' });

    const thesis = thesisRows[0];
    if (user.role === 'student' && thesis.student_id !== user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const [versions] = await db.query(`
      SELECT vr.*, u.name AS uploader_name
      FROM   version_records vr
      JOIN   users u ON u.id = vr.uploader_id
      WHERE  vr.thesis_id = ?
      AND    vr.event_type = 'upload'
      ORDER  BY vr.version_number DESC
    `, [thesisId]);

    res.json({ versions, thesis });

  } catch (err) {
    console.error('Get versions error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ══════════════════════════════════════
   GET /api/versions/:thesisId/download/:versionNumber
   Download a specific version PDF
   ══════════════════════════════════════ */
router.get('/:thesisId/download/:versionNumber', requireLogin, async (req, res) => {
  try {
    const user          = req.session.user;
    const thesisId      = parseInt(req.params.thesisId);
    const versionNumber = parseInt(req.params.versionNumber);

    // Verify access
    const [thesisRows] = await db.query('SELECT * FROM theses WHERE id = ?', [thesisId]);
    if (!thesisRows.length) return res.status(404).json({ error: 'Thesis not found.' });

    const thesis = thesisRows[0];
    if (user.role === 'student' && thesis.student_id !== user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Get version record
    const [rows] = await db.query(
      'SELECT * FROM version_records WHERE thesis_id = ? AND version_number = ? AND event_type = ?',
      [thesisId, versionNumber, 'upload']
    );
    if (!rows.length) return res.status(404).json({ error: 'Version not found.' });

    const version = rows[0];
    if (version.is_corrupted) {
      return res.status(400).json({ error: 'This version is corrupted and cannot be downloaded.' });
    }

    // Find the stored file by hash
    const filePath = path.join(STORAGE, version.content_hash + '.pdf');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server. It may not have been uploaded yet.' });
    }

    // Verify integrity before serving — re-hash the file
    const fileBuffer = fs.readFileSync(filePath);
    const actualHash = hashBuffer(fileBuffer);
    if (actualHash !== version.content_hash) {
      // Mark as corrupted
      await db.query(
        'UPDATE version_records SET is_corrupted = 1 WHERE id = ?',
        [version.id]
      );
      return res.status(500).json({ error: 'File integrity check failed. File has been marked as corrupted.' });
    }

    // Serve the file
    const safeTitle = thesis.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const filename  = `${safeTitle}_v${versionNumber}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileBuffer);

  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ══════════════════════════════════════
   POST /api/versions/:thesisId
   Upload a new version — multipart/form-data
   Fields: file (PDF), changeNote (optional)
   ══════════════════════════════════════ */
router.post('/:thesisId', requireStudent, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File exceeds 20 MB limit.' });
      }
      return res.status(400).json({ error: err.message || 'File upload error.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const user     = req.session.user;
    const thesisId = parseInt(req.params.thesisId);

    if (!req.file) {
      return res.status(400).json({ error: 'Please select a PDF file to upload.' });
    }

    // Verify thesis ownership
    const [thesisRows] = await db.query(
      'SELECT * FROM theses WHERE id = ? AND student_id = ?',
      [thesisId, user.id]
    );
    if (!thesisRows.length) {
      return res.status(403).json({ error: 'Thesis not found or access denied.' });
    }

    // Compute SHA-256 hash of the uploaded file
    const contentHash = hashBuffer(req.file.buffer);
    const changeNote  = req.body.changeNote || null;

    // Check for duplicate (identical file already uploaded)
    const [dupRows] = await db.query(
      'SELECT id, version_number FROM version_records WHERE thesis_id = ? AND content_hash = ? AND event_type = ?',
      [thesisId, contentHash, 'upload']
    );
    if (dupRows.length) {
      return res.status(409).json({
        error: `This file is identical to version v${dupRows[0].version_number}. No new version created.`,
        duplicate: true,
        existingVersion: dupRows[0].version_number,
      });
    }

    // Get next version number
    const [[maxRow]] = await db.query(
      'SELECT COALESCE(MAX(version_number), 0) AS maxV FROM version_records WHERE thesis_id = ? AND event_type = ?',
      [thesisId, 'upload']
    );
    const nextVersion = maxRow.maxV + 1;

    // Save file to storage using hash as filename (content-addressable)
    const filePath = path.join(STORAGE, contentHash + '.pdf');
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, req.file.buffer);
    }

    // Deactivate current active version
    await db.query(
      'UPDATE version_records SET is_active = 0 WHERE thesis_id = ? AND is_active = 1',
      [thesisId]
    );

    // Insert new version record
    const [result] = await db.query(`
      INSERT INTO version_records
        (thesis_id, version_number, content_hash, uploader_id, change_note, is_active, event_type)
      VALUES (?, ?, ?, ?, ?, 1, 'upload')
    `, [thesisId, nextVersion, contentHash, user.id, changeNote]);

    res.status(201).json({
      message:       `Version v${nextVersion} uploaded successfully.`,
      versionId:     result.insertId,
      versionNumber: nextVersion,
      contentHash,
    });

  } catch (err) {
    console.error('Upload version error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

/* ══════════════════════════════════════
   POST /api/versions/:thesisId/rollback
   Rollback to a specific version (admin only)
   Body: { targetVersion }
   ══════════════════════════════════════ */
router.post('/:thesisId/rollback', requireAdmin, async (req, res) => {
  try {
    const user          = req.session.user;
    const thesisId      = parseInt(req.params.thesisId);
    const { targetVersion } = req.body;

    if (!targetVersion) {
      return res.status(400).json({ error: 'targetVersion is required.' });
    }

    const [thesisRows] = await db.query('SELECT * FROM theses WHERE id = ?', [thesisId]);
    if (!thesisRows.length) return res.status(404).json({ error: 'Thesis not found.' });

    const [targetRows] = await db.query(
      'SELECT * FROM version_records WHERE thesis_id = ? AND version_number = ? AND event_type = ?',
      [thesisId, targetVersion, 'upload']
    );
    if (!targetRows.length) {
      return res.status(404).json({ error: `Version v${targetVersion} not found.` });
    }

    const target = targetRows[0];
    if (target.is_corrupted) {
      return res.status(400).json({ error: 'Cannot rollback to a corrupted version.' });
    }
    if (target.is_active) {
      return res.status(400).json({ error: `Version v${targetVersion} is already the active version.` });
    }

    // Deactivate all, activate target
    await db.query('UPDATE version_records SET is_active = 0 WHERE thesis_id = ?', [thesisId]);
    await db.query(
      'UPDATE version_records SET is_active = 1 WHERE thesis_id = ? AND version_number = ? AND event_type = ?',
      [thesisId, targetVersion, 'upload']
    );

    // Log rollback entry (event_type='rollback' avoids unique key conflict)
    await db.query(`
      INSERT INTO version_records
        (thesis_id, version_number, content_hash, uploader_id, change_note, is_active, event_type)
      VALUES (?, ?, ?, ?, ?, 0, 'rollback')
    `, [
      thesisId,
      targetVersion,
      target.content_hash,
      user.id,
      `Rollback to v${targetVersion} — ${target.change_note || ''}`,
    ]);

    res.json({
      message: `Successfully rolled back to v${targetVersion}.`,
      thesisId,
      restoredVersion: targetVersion,
    });

  } catch (err) {
    console.error('Rollback error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
