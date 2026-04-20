// src/routes/turn.js
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');

router.get('/credentials', authMiddleware, async (req, res) => {
  try {
    const appName = process.env.METERED_APP_NAME;
    const secretKey = process.env.METERED_SECRET_KEY;
    const url = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${secretKey}`;
    const response = await fetch(url);
    const iceServers = await response.json();
    res.json({ success: true, data: iceServers });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
