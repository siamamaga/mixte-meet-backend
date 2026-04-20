// src/routes/signaling.js
const express = require('express');
const router = express.Router();

// Stockage en mémoire des signaux WebRTC
const signals = {};

// Nettoyer les signaux expirés toutes les 60s
setInterval(function() {
  const now = Date.now();
  for (const convId in signals) {
    signals[convId] = signals[convId].filter(s => (now - s.ts) < 35000);
    if (signals[convId].length === 0) delete signals[convId];
  }
}, 60000);

// ⚠️ IMPORTANT: /incoming DOIT être avant /:convId/signal
// sinon Express interprète "incoming" comme un convId

// ── Vérifier appel entrant (polling global léger)
router.get('/incoming', async (req, res) => {
  try {
    const userId = req.user.id;
    for (const convId in signals) {
      const pending = signals[convId].filter(function(s) {
        return s.to === userId && s.type === 'offer' && (Date.now() - s.ts) < 30000;
      });
      if (pending.length > 0) {
        // Consommer le signal offer
        signals[convId] = signals[convId].filter(function(s) {
          return !(s.to === userId && s.type === 'offer');
        });
        return res.json({ success: true, data: { signal: pending[0], convId: parseInt(convId) } });
      }
    }
    res.json({ success: true, data: null });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Envoyer un signal (offer, answer, ice-candidate, reject, end)
router.post('/:convId/signal', async (req, res) => {
  try {
    const { convId } = req.params;
    const { type, data, to, audioOnly } = req.body;
    if (!type || !to) return res.status(400).json({ success: false, message: 'type et to requis' });
    if (!signals[convId]) signals[convId] = [];
    signals[convId].push({ type, data, from: req.user.id, to, audioOnly: audioOnly || false, ts: Date.now() });
    // Garder seulement les 30 derniers signaux par conversation
    if (signals[convId].length > 30) signals[convId].shift();
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Récupérer les signaux en attente pour une conversation
router.get('/:convId/signal', async (req, res) => {
  try {
    const { convId } = req.params;
    const userId = req.user.id;
    if (!signals[convId]) return res.json({ success: true, data: [] });
    const now = Date.now();
    const mySignals = signals[convId].filter(function(s) {
      return s.to === userId && (now - s.ts) < 30000;
    });
    // Supprimer les signaux récupérés
    signals[convId] = signals[convId].filter(function(s) {
      return s.to !== userId;
    });
    res.json({ success: true, data: mySignals });
  } catch(err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;