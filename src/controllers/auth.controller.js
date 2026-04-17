// src/controllers/auth.controller.js
const { validationResult } = require('express-validator');
const authService  = require('../services/auth.service');
const emailService = require('../services/email.service');

function handleError(res, err) {
  const status  = err.status  || 500;
  const message = err.message || 'Erreur serveur';
  return res.status(status).json({ success: false, message });
}

// POST /api/auth/register
async function register(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });
  try {
    const data = await authService.register(req.body);

    // Email de bienvenue (async)
    emailService.sendWelcome({
      to:        req.body.email,
      firstName: req.body.first_name || 'cher(e) membre',
    }).catch(err => console.error('Email bienvenue:', err.message));

    return res.status(201).json({ success: true, message: 'Compte créé avec succès', data });
  } catch (err) { handleError(res, err); }
}

// POST /api/auth/login
async function login(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });
  try {
    const data = await authService.login(req.body);
    return res.json({ success: true, data });
  } catch (err) { handleError(res, err); }
}

// POST /api/auth/refresh
async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token requis' });
  try {
    const tokens = await authService.refreshToken(refreshToken);
    return res.json({ success: true, data: tokens });
  } catch (err) { handleError(res, err); }
}

// POST /api/auth/forgot-password
async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email requis' });
  try {
    const pool = require('../config/database');
    const [users] = await pool.query('SELECT id, first_name FROM users WHERE email = ? AND status = "active"', [email]);
    if (!users.length) return res.json({ success: true, message: 'Email de reinitialisation envoye' });
    const user = users[0];
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);
    await pool.query('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [resetToken, expires, user.id]);
    try {
      await emailService.sendPasswordReset({ to: email, firstName: user.first_name, resetToken });
    } catch(emailErr) {
      console.error('ERREUR EMAIL:', emailErr.message);
    }
    return res.json({ success: true, message: 'Email de reinitialisation envoye' });
  } catch (err) { handleError(res, err); }
}
// POST /api/auth/change-password
async function changePassword(req, res) {
  try {
    const data = await authService.changePassword(req.user.id, req.body);
    return res.json({ success: true, ...data });
  } catch (err) { handleError(res, err); }
}

// POST /api/auth/logout
async function logout(req, res) {
  return res.json({ success: true, message: 'Déconnexion réussie' });
}

async function resetPassword(req, res) {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ success: false, message: 'Token et mot de passe requis' });
  try {
    const pool = require('../config/database');
    const [users] = await pool.query('SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()', [token]);
    if (!users.length) return res.status(400).json({ success: false, message: 'Token invalide ou expire' });
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?', [hash, users[0].id]);
    return res.json({ success: true, message: 'Mot de passe mis a jour' });
  } catch (err) { handleError(res, err); }
}
module.exports = { register, login, refresh, changePassword, logout, forgotPassword, resetPassword };



