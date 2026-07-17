-- ============================================================
--  Thesis Repository Management System — Database Schema
--
--  HOW TO USE:
--  1. Open phpMyAdmin → http://localhost/phpmyadmin
--  2. Click "SQL" tab at the top
--  3. Paste this entire file and click "Go"
-- ============================================================


-- ── Create & select the database ──────────────────────────
CREATE DATABASE IF NOT EXISTS thesis_repository
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE thesis_repository;


-- ============================================================
--  TABLE 1: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              INT          NOT NULL AUTO_INCREMENT,
  name            VARCHAR(150) NOT NULL,
  email           VARCHAR(150) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('student','admin') NOT NULL DEFAULT 'student',
  failed_attempts TINYINT      NOT NULL DEFAULT 0,
  locked_until    DATETIME         NULL DEFAULT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;


-- ============================================================
--  TABLE 2: theses
-- ============================================================
CREATE TABLE IF NOT EXISTS theses (
  id         INT          NOT NULL AUTO_INCREMENT,
  student_id INT          NOT NULL,
  title      VARCHAR(300) NOT NULL,
  abstract   TEXT         NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT fk_theses_student
    FOREIGN KEY (student_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;


-- ============================================================
--  TABLE 3: version_records
--  Files are NEVER deleted — only is_active changes.
--  UNIQUE KEY includes event_type so a rollback log entry
--  can share the same version_number as the original upload.
-- ============================================================
CREATE TABLE IF NOT EXISTS version_records (
  id             INT          NOT NULL AUTO_INCREMENT,
  thesis_id      INT          NOT NULL,
  version_number INT          NOT NULL,
  content_hash   CHAR(64)     NOT NULL,
  uploader_id    INT          NOT NULL,
  change_note    VARCHAR(500)     NULL DEFAULT NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 0,
  is_corrupted   TINYINT(1)   NOT NULL DEFAULT 0,
  event_type     ENUM('upload','rollback') NOT NULL DEFAULT 'upload',
  uploaded_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_version (thesis_id, version_number, event_type),

  CONSTRAINT fk_versions_thesis
    FOREIGN KEY (thesis_id)   REFERENCES theses(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_versions_uploader
    FOREIGN KEY (uploader_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;


-- ============================================================
--  TABLE 4: audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            INT      NOT NULL AUTO_INCREMENT,
  run_by        INT      NOT NULL,
  run_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_checked INT      NOT NULL DEFAULT 0,
  total_failed  INT      NOT NULL DEFAULT 0,

  PRIMARY KEY (id),
  CONSTRAINT fk_audit_admin
    FOREIGN KEY (run_by) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;


-- ============================================================
--  SEED DATA
--
--  Admin    : evanskipkirui334@gmail.com   / 861820evans
--
--  Hashes generated with bcrypt cost factor 10.
-- ============================================================

INSERT INTO users (name, email, password_hash, role) VALUES
  ('Evans Rono', 'evanskipkirui334@gmail.com',
   '$2b$10$Gagda0/bdY5g1eKsqJWbauBm3dlJpyFAjzqTdbWn/ltaVdD7LJKOa',
   'admin');


-- ============================================================
--  VERIFY
-- ============================================================
-- SELECT * FROM users;
-- SELECT * FROM theses;
-- SELECT * FROM version_records;
-- SELECT * FROM audit_logs;
