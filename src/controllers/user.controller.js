// src/controllers/user.controller.js
const userSvc = require('../services/user.service');
const pool    = require('../config/database');

function handleError(res, err) {
  return res.status(err.status || 500).json({ success: false, message: err.message || 'Erreur serveur' });
}

exports.getMyProfile = async (req, res) => {
  try { res.json({ success: true, data: await userSvc.getMyProfile(req.user.id) }); }
  catch (err) { handleError(res, err); }
};

exports.getProfile = async (req, res) => {
  try { res.json({ success: true, data: await userSvc.getProfile(req.params.uuid, req.user.id) }); }
  catch (err) { handleError(res, err); }
};

exports.updateProfile = async (req, res) => {
  try { res.json({ success: true, data: await userSvc.updateProfile(req.user.id, req.body) }); }
  catch (err) { handleError(res, err); }
};

exports.getPhotos = async (req, res) => {
  try {
    const [photos] = await pool.query(
      'SELECT id, url, url_thumb, is_main, sort_order, moderation_status FROM user_photos WHERE user_id = ?',
      [req.user.id]
    );
    res.json({ success: true, data: photos });
  } catch (err) { handleError(res, err); }
};

exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier reçu' });
    const photo = await userSvc.uploadPhoto(req.user.id, req.file.buffer, req.file.mimetype);
    res.status(201).json({ success: true, data: photo });
  } catch (err) { handleError(res, err); }
};

exports.setMainPhoto = async (req, res) => {
  try { res.json({ success: true, ...(await userSvc.setMainPhoto(req.user.id, req.params.id)) }); }
  catch (err) { handleError(res, err); }
};

exports.deletePhoto = async (req, res) => {
  try { res.json({ success: true, ...(await userSvc.deletePhoto(req.user.id, req.params.id)) }); }
  catch (err) { handleError(res, err); }
};

exports.report = async (req, res) => {
  try {
    const { reported_uuid, reason, description } = req.body;
    const [user] = await pool.query('SELECT id FROM users WHERE uuid = ?', [reported_uuid]);
    if (!user.length) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    await pool.query(
      'INSERT INTO reports (reporter_id, reported_user_id, reason, description) VALUES (?, ?, ?, ?)',
      [req.user.id, user[0].id, reason, description]
    );
    res.json({ success: true, message: 'Signalement envoyé. Merci.' });
  } catch (err) { handleError(res, err); }
};

exports.block = async (req, res) => {
  try {
    const { blocked_uuid } = req.body;
    const [user] = await pool.query('SELECT id FROM users WHERE uuid = ?', [blocked_uuid]);
    if (!user.length) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    await pool.query('INSERT IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)', [req.user.id, user[0].id]);
    res.json({ success: true, message: 'Utilisateur bloqué' });
  } catch (err) { handleError(res, err); }
};

exports.unblock = async (req, res) => {
  try {
    const [user] = await pool.query('SELECT id FROM users WHERE uuid = ?', [req.params.uuid]);
    if (!user.length) return res.status(404).json({ success: false, message: 'Introuvable' });
    await pool.query('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', [req.user.id, user[0].id]);
    res.json({ success: true, message: 'Utilisateur débloqué' });
  } catch (err) { handleError(res, err); }
};
