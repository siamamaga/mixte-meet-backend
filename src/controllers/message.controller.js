// src/controllers/message.controller.js
const pool = require('../config/database');
const msgSvc = require('../services/message.service');

function handleError(res, err) {
  return res.status(err.status || 500).json({ success: false, message: err.message || 'Erreur serveur' });
}

exports.findOrCreate = async (req, res) => {
  try {
    const { user_uuid } = req.body;
    if (!user_uuid) return res.status(400).json({ success: false, message: 'user_uuid requis' });
    const [target] = await pool.query('SELECT id FROM users WHERE uuid = ?', [user_uuid]);
    if (!target.length) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    const targetId = target[0].id;
    const myId = req.user.id;
    const [u1, u2] = myId < targetId ? [myId, targetId] : [targetId, myId];
    // Chercher match existant
    let [match] = await pool.query('SELECT id FROM matches WHERE user1_id = ? AND user2_id = ? AND is_active = TRUE', [u1, u2]);
    if (!match.length) {
      // Créer le match
      const [result] = await pool.query('INSERT IGNORE INTO matches (user1_id, user2_id) VALUES (?, ?)', [u1, u2]);
      const matchId = result.insertId;
      await pool.query('INSERT INTO conversations (match_id) VALUES (?)', [matchId]);
      const [conv] = await pool.query('SELECT id FROM conversations WHERE match_id = ?', [matchId]);
      return res.json({ success: true, data: { conversation_id: conv[0].id } });
    }
    // Chercher conversation existante
    const [conv] = await pool.query('SELECT id FROM conversations WHERE match_id = ?', [match[0].id]);
    if (!conv.length) {
      await pool.query('INSERT INTO conversations (match_id) VALUES (?)', [match[0].id]);
      const [newConv] = await pool.query('SELECT id FROM conversations WHERE match_id = ?', [match[0].id]);
      return res.json({ success: true, data: { conversation_id: newConv[0].id } });
    }
    res.json({ success: true, data: { conversation_id: conv[0].id } });
  } catch(err) { handleError(res, err); }
};

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

exports.markAsRead = async (req, res) => {
  try {
    const pool = require('../config/database');
    await pool.query(
      'UPDATE messages SET is_read = 1, read_at = NOW() WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch(err) { handleError(res, err); }
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



