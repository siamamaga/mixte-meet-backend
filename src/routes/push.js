// src/routes/push.js
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const pool = require('../config/database');

router.post('/register', authMiddleware, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'Token requis' });
    await pool.query(
      'INSERT INTO push_tokens (user_id, token, platform, is_active) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()',
      [req.user.id, token, platform || 'web']
    );
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/unregister', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    await pool.query('UPDATE push_tokens SET is_active = 0 WHERE user_id = ? AND token = ?', [req.user.id, token]);
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
