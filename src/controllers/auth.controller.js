// src/controllers/auth.controller.js
const { validationResult } = require('express-validator');
const authService = require('../services/auth.service');

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

// POST /api/auth/change-password
async function changePassword(req, res) {
  try {
    const data = await authService.changePassword(req.user.id, req.body);
    return res.json({ success: true, ...data });
  } catch (err) { handleError(res, err); }
}

// POST /api/auth/logout
async function logout(req, res) {
  // Côté client : supprimer les tokens du stockage local
  return res.json({ success: true, message: 'Déconnexion réussie' });
}

module.exports = { register, login, refresh, changePassword, logout };
