// src/controllers/match.controller.js
const matchSvc = require('../services/match.service');
const pool     = require('../config/database');

function handleError(res, err) {
  return res.status(err.status || 500).json({ success: false, message: err.message || 'Erreur serveur', code: err.code });
}

exports.getSearch = async (req, res) => {
  try {
    const pool = require('../config/database');
    const userId = req.user.id;
    const q = req.query.q || '';
    const gender = req.query.gender || '';
    const continent = req.query.continent || '';
    let sql = 'SELECT u.uuid, u.first_name, u.gender, TIMESTAMPDIFF(YEAR, u.birthdate, CURDATE()) AS age, u.country_code, u.country_name, u.city, u.continent, u.bio, u.profession, u.is_verified, u.last_active_at, (SELECT url FROM user_photos WHERE user_id = u.id AND is_main = 1 LIMIT 1) AS main_photo FROM users u WHERE u.id != ? AND u.status = ? AND u.role = ?';
    const params = [userId, 'active', 'user'];
    if (q) { sql += ' AND (u.first_name LIKE ? OR u.city LIKE ? OR u.profession LIKE ?)'; params.push('%'+q+'%', '%'+q+'%', '%'+q+'%'); }
    if (gender) { sql += ' AND u.gender = ?'; params.push(gender); }
    if (continent) { sql += ' AND u.continent = ?'; params.push(continent); }
    sql += ' ORDER BY u.last_active_at DESC LIMIT 50';
    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch(err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getFeed = async (req, res) => {
  try {
    const profiles = await matchSvc.getFeed(req.user.id, req.query);
    res.json({ success: true, data: profiles, count: profiles.length });
  } catch (err) { handleError(res, err); }
};

exports.swipe = async (req, res) => {
  try {
    const { uuid, action } = req.body;
    if (!uuid || !['like','dislike','super_like'].includes(action)) {
      return res.status(400).json({ success: false, message: 'uuid et action requis (like/dislike/super_like)' });
    }
    const result = await matchSvc.swipe(req.user.id, uuid, action);
    res.json({ success: true, data: result });
  } catch (err) { handleError(res, err); }
};

exports.undoLastSwipe = async (req, res) => {
  try { res.json({ success: true, ...(await matchSvc.undoLastSwipe(req.user.id)) }); }
  catch (err) { handleError(res, err); }
};

exports.getMatches = async (req, res) => {
  try {
    const matches = await matchSvc.getMatches(req.user.id);
    res.json({ success: true, data: matches, count: matches.length });
  } catch (err) { handleError(res, err); }
};

exports.unmatch = async (req, res) => {
  try {
    await pool.query(
      'UPDATE matches SET is_active = FALSE, unmatched_at = NOW(), unmatched_by = ? WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
      [req.user.id, req.params.id, req.user.id, req.user.id]
    );
    res.json({ success: true, message: 'Match supprimé' });
  } catch (err) { handleError(res, err); }
};

// ─────────────────────────────────────────────────────────

// src/controllers/message.controller.js — inline ici pour compacité
const msgSvc = require('../services/message.service');

exports.getMessages = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const messages = await msgSvc.getMessages(req.params.id, req.user.id, +page, +limit);
    res.json({ success: true, data: messages, page: +page });
  } catch (err) { handleError(res, err); }
};

exports.sendMessage = async (req, res) => {
  try {
    const msg = await msgSvc.sendMessage(req.params.id, req.user.id, req.body);
    res.status(201).json({ success: true, data: msg });
  } catch (err) { handleError(res, err); }
};

exports.deleteMessage = async (req, res) => {
  try { res.json({ success: true, ...(await msgSvc.deleteMessage(req.params.id, req.user.id)) }); }
  catch (err) { handleError(res, err); }
};

exports.addReaction = async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ success: false, message: 'emoji requis' });
    res.json({ success: true, ...(await msgSvc.addReaction(req.params.id, req.user.id, emoji)) });
  } catch (err) { handleError(res, err); }
};

