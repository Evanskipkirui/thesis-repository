'use strict';

const mysql  = require('mysql2/promise');
require('dotenv').config();

let pool;

if (process.env.MYSQL_URL) {
  // Railway provides a full connection URL
  pool = mysql.createPool(process.env.MYSQL_URL + '?ssl={"rejectUnauthorized":false}');
} else {
  // Local development using individual credentials
  pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     process.env.DB_PORT     || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'thesis_repository',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
  });
}

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✔  MySQL connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('✖  MySQL connection failed:', err.message);
    console.error('   Make sure MySQL is running and credentials are correct.');
  });

module.exports = pool;
