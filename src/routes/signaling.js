// src/routes/signaling.js
const express = require('express');
const router = express.Router();

// Stockage temporaire des signaux en mémoire
const signals = {};

// Envoyer un signal (offer, answer, ice-candidate)
router.post('/:convId/signal', async (req, res) => {
  const { convId } = req.params;
  const { type, data, to } = req.body;
  if (!signals[convId]) signals[convId] = [];
  signals[convId].push({ type, data, from: req.user.id, to, ts: Date.now() });
  // Garder seulement les 20 derniers signaux
  if (signals[convId].length > 20) signals[convId].shift();
  res.json({ success: true });
});

// Récupérer les signaux en attente
router.get('/:convId/signal', async (req, res) => {
  const { convId } = req.params;
  const userId = req.user.id;
  if (!signals[convId]) return res.json({ success: true, data: [] });
  // Retourner les signaux destinés à cet utilisateur
  const mySignals = signals[convId].filter(s => s.to === userId && (Date.now() - s.ts) < 30000);
  // Supprimer les signaux récupérés
  signals[convId] = signals[convId].filter(s => !(s.to === userId));
  res.json({ success: true, data: mySignals });
});

module.exports = router;
