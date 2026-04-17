// src/config/database.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'mixte_meet',
  waitForConnections: true,
  connectionLimit:    3,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           '+00:00',
});

// Test silencieux sans bloquer le demarrage
pool.query('SELECT 1')
  .then(() => console.log('✅ Base de données connectée — mixte_meet'))
  .catch(err => console.error('⚠️ DB warning:', err.message));

module.exports = pool;