// src/middlewares/auth.js
const jwt  = require('jsonwebtoken');
const pool = require('../config/database');

// ── Vérifie le token JWT ──────────────────────────────────
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token manquant' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Vérifier que l'utilisateur existe et est actif
    const [rows] = await pool.query(
      'SELECT id, uuid, email, role, status, is_premium, coins FROM users WHERE id = ? AND status = "active"',
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Utilisateur introuvable ou suspendu' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expirée', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Token invalide' });
  }
}

// ── Vérifie le rôle admin ─────────────────────────────────
function adminOnly(req, res, next) {
  if (!['admin', 'superadmin'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Accès refusé — Admin requis' });
  }
  next();
}

// ── Vérifie l'abonnement Premium ──────────────────────────
function premiumOnly(req, res, next) {
  if (!req.user?.is_premium) {
    return res.status(403).json({
      success: false,
      message: 'Fonctionnalité Premium',
      code: 'PREMIUM_REQUIRED'
    });
  }
  next();
}

module.exports = { authMiddleware, adminOnly, premiumOnly };

