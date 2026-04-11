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

exports.getStats = async (req, res) => {
  try {
    const id = req.user.id;
    const [[likes]]   = await pool.query('SELECT COUNT(*) as cnt FROM swipes WHERE swiped_id = ? AND action IN (\'like\',\'super_like\')', [id]);
    const [[matches]] = await pool.query('SELECT COUNT(*) as cnt FROM matches WHERE (user1_id = ? OR user2_id = ?) AND is_active = TRUE', [id, id]);
    const [[views]]   = await pool.query('SELECT COUNT(*) as cnt FROM profile_views WHERE viewed_id = ?', [id]);
    res.json({ success: true, data: {
      likes_received: likes.cnt,
      matches_count: matches.cnt,
      profile_views: views.cnt,
    }});
  } catch(err) { handleError(res, err); }
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

exports.getVerificationStatus = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT verification_status, verification_submitted_at FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, data: rows[0] || { verification_status: 'none' } });
  } catch(err) { handleError(res, err); }
};

exports.submitVerification = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Selfie requis' });
    const { gesture } = req.body;

    // Upload selfie sur Cloudinary
    const cloudinary = require('../config/cloudinary');
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'mixte-meet/verifications', resource_type: 'image' },
        (err, r) => err ? reject(err) : resolve(r)
      );
      stream.end(req.file.buffer);
    });

    // Sauvegarder en base
    await pool.query(`
      UPDATE users SET
        verification_status = 'pending',
        verification_selfie_url = ?,
        verification_gesture = ?,
        verification_submitted_at = NOW()
      WHERE id = ?
    `, [result.secure_url, gesture, req.user.id]);

    // Créer un signalement admin pour review
    await pool.query(`
      INSERT INTO admin_verifications (user_id, selfie_url, gesture, status, created_at)
      VALUES (?, ?, ?, 'pending', NOW())
      ON DUPLICATE KEY UPDATE selfie_url=VALUES(selfie_url), gesture=VALUES(gesture), status='pending', created_at=NOW()
    `, [req.user.id, result.secure_url, gesture]);

    res.json({ success: true, message: 'Selfie envoyé — en cours de vérification' });
  } catch(err) { handleError(res, err); }
};

exports.getBlocked = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.uuid, u.first_name, u.country_code, u.country_name,
             p.url AS main_photo
      FROM blocks b
      JOIN users u ON u.id = b.blocked_id
      LEFT JOIN user_photos p ON p.user_id = u.id AND p.is_main = 1
      WHERE b.blocker_id = ?
      ORDER BY b.created_at DESC`
    , [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
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




