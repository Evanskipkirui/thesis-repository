'use strict';

// This script runs the database schema on startup
// It creates all tables if they don't exist

require('dotenv').config();
const mysql = require('mysql2/promise');
const path  = require('path');
const fs    = require('fs');

async function migrate() {
  let connection;
  try {
    // Connect using MYSQL_URL (Railway) or individual credentials (local)
    if (process.env.MYSQL_URL) {
      connection = await mysql.createConnection(process.env.MYSQL_URL);
    } else {
      connection = await mysql.createConnection({
        host:     process.env.DB_HOST     || 'localhost',
        port:     process.env.DB_PORT     || 3306,
        user:     process.env.DB_USER     || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME     || 'thesis_repository',
        multipleStatements: true,
      });
    }

    console.log('✔  Running database migration...');

    // Create tables
    await connection.query(`
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
      ) ENGINE=InnoDB
    `);

    await connection.query(`
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
      ) ENGINE=InnoDB
    `);

    await connection.query(`
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
      ) ENGINE=InnoDB
    `);

    await connection.query(`
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
      ) ENGINE=InnoDB
    `);

    // Insert admin account if not exists
    const [existing] = await connection.query(
      "SELECT id FROM users WHERE email = 'evanskipkirui334@gmail.com'"
    );
    if (!existing.length) {
      await connection.query(`
        INSERT INTO users (name, email, password_hash, role) VALUES
        ('Evans Rono', 'evanskipkirui334@gmail.com',
         '$2b$10$Gagda0/bdY5g1eKsqJWbauBm3dlJpyFAjzqTdbWn/ltaVdD7LJKOa',
         'admin')
      `);
      console.log('✔  Admin account created');
    }

    console.log('✔  Database migration complete');
    await connection.end();

  } catch (err) {
    console.error('✖  Migration failed:', err.message);
    if (connection) await connection.end();
  }
}

module.exports = migrate;
