// src/controllers/admin.controller.js
const pool = require('../config/database');

function handleError(res, err) {
  console.error('Admin error:', err);
  return res.status(err.status || 500).json({ success: false, message: err.message || 'Erreur serveur' });
}

// ── DASHBOARD ─────────────────────────────────────────────
async function getDashboard(req, res) {
  try {
    res.set('Cache-Control', 'no-store');
    const [[users]]    = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE deleted_at IS NULL');
    const [[premium]]  = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE is_premium=1');
    const [[matches]]  = await pool.query('SELECT COUNT(*) as cnt FROM matches');
    const [[reports]]  = await pool.query('SELECT COUNT(*) as cnt FROM reports WHERE status="pending"');
    const [[photos]]   = await pool.query('SELECT COUNT(*) as cnt FROM user_photos WHERE is_verified=0').catch(()=>[[{cnt:0}]]);

    // Top pays
    const [countries] = await pool.query(
      'SELECT country_code, country_name, COUNT(*) as cnt FROM users WHERE deleted_at IS NULL GROUP BY country_code, country_name ORDER BY cnt DESC LIMIT 5'
    );

    // Membres récents
    const [recent] = await pool.query(
      'SELECT id, uuid, email, first_name, gender, country_code, country_name, status, role, is_premium, created_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10'
    );

    // Inscriptions 7 derniers jours
    const [reg7d] = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    return res.json({
      success: true,
      data: {
        total_users:    users.cnt,
        premium_users:  premium.cnt,
        total_matches:  matches.cnt,
        revenue_month:  0,
        alerts: { pending_reports: reports.cnt, pending_photos: photos.cnt },
        top_countries:  countries,
        recent_users:   recent,
        registrations_7d: reg7d,
        activity: { online: 0, messages: 0, matches: matches.cnt, swipes: 0, photos: 0 },
      }
    });
  } catch(err) { handleError(res, err); }
}

// ── MEMBRES ───────────────────────────────────────────────
async function getUsers(req, res) {
  try {
    const limit  = parseInt(req.query.limit)  || 20;
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;
    const role   = req.query.role   || null;
    const search = req.query.search || null;

    let where = 'WHERE deleted_at IS NULL';
    const params = [];
    if (status) { where += ' AND status = ?'; params.push(status); }
    if (role)   { where += ' AND role = ?';   params.push(role); }
    if (search) { where += ' AND (email LIKE ? OR first_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const [[{total}]] = await pool.query(`SELECT COUNT(*) as total FROM users ${where}`, params);
    const [users]     = await pool.query(
      `SELECT id, uuid, email, first_name, gender, country_code, country_name, city, status, role, is_premium, premium_expires_at, coins, created_at, last_login_at
       FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({ success: true, data: { users, total, limit, offset } });
  } catch(err) { handleError(res, err); }
}

async function getUserById(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT id, uuid, email, first_name, last_name, gender, country_code, country_name, city, bio, profession, status, role, is_premium, premium_expires_at, coins, created_at, last_login_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    return res.json({ success: true, data: rows[0] });
  } catch(err) { handleError(res, err); }
}

async function banUser(req, res) {
  try {
    await pool.query('UPDATE users SET status = "banned" WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'Utilisateur banni' });
  } catch(err) { handleError(res, err); }
}

async function unbanUser(req, res) {
  try {
    await pool.query('UPDATE users SET status = "active" WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'Utilisateur réactivé' });
  } catch(err) { handleError(res, err); }
}

async function deleteUser(req, res) {
  try {
    await pool.query('UPDATE users SET deleted_at = NOW(), status = "deleted" WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'Utilisateur supprimé' });
  } catch(err) { handleError(res, err); }
}

async function grantPremium(req, res) {
  try {
    const days = parseInt(req.body.days) || 30;
    await pool.query(
      'UPDATE users SET is_premium = 1, premium_expires_at = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?',
      [days, req.params.id]
    );
    return res.json({ success: true, message: `Premium activé pour ${days} jours` });
  } catch(err) { handleError(res, err); }
}

// ── SIGNALEMENTS ──────────────────────────────────────────
async function getReports(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, 
        u1.first_name as reporter_name, u1.email as reporter_email,
        u2.first_name as reported_name, u2.email as reported_email
      FROM reports r
      LEFT JOIN users u1 ON r.reporter_id = u1.id
      LEFT JOIN users u2 ON r.reported_user_id = u2.id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC LIMIT 50
    `);
    return res.json({ success: true, data: rows });
  } catch(err) { handleError(res, err); }
}

async function handleReport(req, res) {
  try {
    const { action } = req.body;
    await pool.query('UPDATE reports SET status = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?',
      [action === 'ban' ? 'resolved' : 'rejected', req.user.id, req.params.id]);
    return res.json({ success: true, message: 'Signalement traité' });
  } catch(err) { handleError(res, err); }
}

// ── PHOTOS ────────────────────────────────────────────────
async function getPendingPhotos(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, u.first_name as user_name, u.email
      FROM user_photos p
      JOIN users u ON p.user_id = u.id
      WHERE p.is_verified = 0
      ORDER BY p.created_at DESC LIMIT 50
    `).catch(() => [[]]);
    return res.json({ success: true, data: rows });
  } catch(err) { return res.json({ success: true, data: [] }); }
}

async function moderatePhoto(req, res) {
  try {
    const { approved } = req.body;
    await pool.query('UPDATE user_photos SET is_verified = ? WHERE id = ?', [approved ? 1 : 0, req.params.id]);
    return res.json({ success: true, message: approved ? 'Photo approuvée' : 'Photo rejetée' });
  } catch(err) { handleError(res, err); }
}

// ── PHOTOS D'UN USER ─────────────────────────────────────
async function getUserPhotos(req, res) {
  try {
    // Désactiver le cache pour toujours avoir les vraies photos
    res.set('Cache-Control', 'no-store');
    const [rows] = await pool.query(
      'SELECT id, url, url_thumb, is_main, is_verified, created_at FROM user_photos WHERE user_id = ? ORDER BY is_main DESC, created_at ASC',
      [req.params.id]
    ).catch(() => [[]]);
    return res.json({ success: true, data: rows });
  } catch(err) { return res.json({ success: true, data: [] }); }
}

// ── PAIEMENTS ─────────────────────────────────────────────
async function getPayments(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, u.first_name as user_name, u.email
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC LIMIT 100
    `).catch(() => [[]]);
    return res.json({ success: true, data: rows });
  } catch(err) { return res.json({ success: true, data: [] }); }
}

async function getSubscriptions(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT id, first_name, email, is_premium, premium_expires_at, country_code, created_at
      FROM users
      WHERE is_premium = 1 AND deleted_at IS NULL
      ORDER BY premium_expires_at ASC
    `);
    return res.json({ success: true, data: rows });
  } catch(err) { handleError(res, err); }
}

// ── PROMOTIONS ────────────────────────────────────────────
async function getPromotions(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM promotions ORDER BY created_at DESC');
    return res.json({ success: true, data: rows });
  } catch(err) { return res.json({ success: true, data: [] }); }
}

async function createPromotion(req, res) {
  try {
    const { name, label, plan_id, discount_pct, price_xof, price_eur, expires_at, max_uses, is_active, show_countdown, color } = req.body;
    const [result] = await pool.query(
      'INSERT INTO promotions (name, label, plan_id, discount_pct, price_xof, price_eur, expires_at, max_uses, is_active, show_countdown, color, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [name, label, plan_id, discount_pct, price_xof||0, price_eur||0, expires_at||null, max_uses||null, is_active!==false?1:0, show_countdown?1:0, color||'gold', req.user.id]
    );
    return res.json({ success: true, data: { id: result.insertId }, message: 'Promotion créée' });
  } catch(err) { handleError(res, err); }
}

async function updatePromotion(req, res) {
  try {
    const { is_active, label, discount_pct, expires_at } = req.body;
    await pool.query(
      'UPDATE promotions SET is_active=?, label=?, discount_pct=?, expires_at=?, updated_at=NOW() WHERE id=?',
      [is_active?1:0, label, discount_pct, expires_at||null, req.params.id]
    );
    return res.json({ success: true, message: 'Promotion mise à jour' });
  } catch(err) { handleError(res, err); }
}

async function deletePromotion(req, res) {
  try {
    await pool.query('DELETE FROM promotions WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'Promotion supprimée' });
  } catch(err) { handleError(res, err); }
}

// ── COMMERCIAUX ───────────────────────────────────────────
async function getAffiliates(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM affiliates ORDER BY total_earned_xof DESC');
    // Calculer le montant à payer
    const result = rows.map(a => ({
      ...a,
      topay: (a.total_earned_xof || 0) - (a.total_paid_xof || 0)
    }));
    return res.json({ success: true, data: result });
  } catch(err) { return res.json({ success: true, data: [] }); }
}

async function createAffiliate(req, res) {
  try {
    const { first_name, last_name, email, phone, country_code, city, promo_code, commission_pct, client_discount_pct, payment_method, payment_details } = req.body;
    await pool.query(
      'INSERT INTO affiliates (first_name, last_name, email, phone, country_code, city, promo_code, commission_pct, client_discount_pct, payment_method, payment_details) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [first_name, last_name, email, phone||null, country_code||'BJ', city||null, promo_code?.toUpperCase(), commission_pct||10, client_discount_pct||20, payment_method||'mobile_money', payment_details||null]
    );
    return res.json({ success: true, message: 'Commercial créé' });
  } catch(err) { handleError(res, err); }
}

async function updateAffiliate(req, res) {
  try {
    const { commission_pct, client_discount_pct, status } = req.body;
    await pool.query(
      'UPDATE affiliates SET commission_pct=?, client_discount_pct=?, status=?, updated_at=NOW() WHERE id=?',
      [commission_pct, client_discount_pct, status, req.params.id]
    );
    return res.json({ success: true, message: 'Commercial mis à jour' });
  } catch(err) { handleError(res, err); }
}

async function getAffiliateTransactions(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT at.*, a.first_name as affiliate_name, a.promo_code
      FROM affiliate_transactions at
      JOIN affiliates a ON at.affiliate_id = a.id
      ORDER BY at.created_at DESC LIMIT 100
    `);
    return res.json({ success: true, data: rows });
  } catch(err) { return res.json({ success: true, data: [] }); }
}

async function payCommission(req, res) {
  try {
    await pool.query(
      'UPDATE affiliate_transactions SET commission_status="paid", paid_at=NOW(), paid_by=? WHERE id=?',
      [req.user.id, req.params.id]
    );
    return res.json({ success: true, message: 'Commission marquée comme payée' });
  } catch(err) { handleError(res, err); }
}

// ── PROFILS DEMO ──────────────────────────────────────────
async function getDemoProfiles(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM demo_profiles ORDER BY id ASC');
    return res.json({ success: true, data: rows });
  } catch(err) { return res.json({ success: true, data: [] }); }
}

async function createDemoProfile(req, res) {
  try {
    const { first_name, age, gender, country_code, country_name, city, bio, profession, emoji, looking_for } = req.body;
    await pool.query(
      'INSERT INTO demo_profiles (first_name, age, gender, country_code, country_name, city, bio, profession, emoji, looking_for) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [first_name, age||25, gender||'woman', country_code||'BJ', country_name||'Bénin', city||null, bio||null, profession||null, emoji||'👤', looking_for||'both']
    );
    return res.json({ success: true, message: 'Profil démo créé' });
  } catch(err) { handleError(res, err); }
}

async function updateDemoProfile(req, res) {
  try {
    const { first_name, age, bio, profession, emoji, is_active, city } = req.body;
    await pool.query(
      'UPDATE demo_profiles SET first_name=?, age=?, bio=?, profession=?, emoji=?, is_active=?, city=? WHERE id=?',
      [first_name, age, bio, profession, emoji, is_active?1:0, city, req.params.id]
    );
    return res.json({ success: true, message: 'Profil démo mis à jour' });
  } catch(err) { handleError(res, err); }
}

async function deleteDemoProfile(req, res) {
  try {
    await pool.query('DELETE FROM demo_profiles WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'Profil démo supprimé' });
  } catch(err) { handleError(res, err); }
}

// ── CONSOLE SQL ───────────────────────────────────────────
async function executeSQL(req, res) {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, message: 'Requête requise' });

    // Sécurité : bloquer les requêtes dangereuses
    const forbidden = /^\s*(DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE\s+users|ALTER\s+TABLE\s+users\s+DROP)/i;
    if (forbidden.test(query)) {
      return res.status(403).json({ success: false, message: 'Requête interdite pour des raisons de sécurité' });
    }

    const [result] = await pool.query(query);
    return res.json({ success: true, data: Array.isArray(result) ? result : { affectedRows: result.affectedRows } });
  } catch(err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

// ── BROADCAST ─────────────────────────────────────────────
async function sendBroadcast(req, res) {
  try {
    const { title, message, target } = req.body;
    // En production: envoyer via email/push notifications
    // Pour l'instant on log juste
    console.log(`📣 Broadcast: [${target}] ${title} — ${message}`);
    return res.json({ success: true, message: `Notification envoyée à ${target}` });
  } catch(err) { handleError(res, err); }
}

// ── STATS ─────────────────────────────────────────────────
async function getRegistrationStats(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    return res.json({ success: true, data: rows });
  } catch(err) { handleError(res, err); }
}

async function getCountryStats(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT country_code, country_name, COUNT(*) as cnt
      FROM users WHERE deleted_at IS NULL
      GROUP BY country_code, country_name
      ORDER BY cnt DESC LIMIT 10
    `);
    return res.json({ success: true, data: rows });
  } catch(err) { handleError(res, err); }
}

exports.getVerifications = async (req, res) => {
  try {
    const pool = require('../config/database');
    const [rows] = await pool.query(
      `SELECT av.*, u.first_name, u.email, u.id as user_id
      FROM admin_verifications av
      JOIN users u ON u.id = av.user_id
      WHERE av.status = 'pending'
      ORDER BY av.created_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch(err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.handleVerification = async (req, res) => {
  try {
    const pool = require('../config/database');
    const { action } = req.body;
    const [verif] = await pool.query('SELECT * FROM admin_verifications WHERE id = ?', [req.params.id]);
    if (!verif.length) return res.status(404).json({ success: false, message: 'Introuvable' });
    
    if (action === 'approve') {
      await pool.query('UPDATE users SET is_verified = 1 WHERE id = ?', [verif[0].user_id]);
      await pool.query('UPDATE admin_verifications SET status = ? WHERE id = ?', ['approved', req.params.id]);
      await pool.query('UPDATE users SET verification_status = ? WHERE id = ?', ['approved', verif[0].user_id]);
    } else {
      await pool.query('UPDATE admin_verifications SET status = ? WHERE id = ?', ['rejected', req.params.id]);
      await pool.query('UPDATE users SET verification_status = ? WHERE id = ?', ['rejected', verif[0].user_id]);
    }
    res.json({ success: true, message: action === 'approve' ? 'Profil verifie' : 'Verification refusee' });
  } catch(err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = {
  getDashboard, getUsers, getUserById, getUserPhotos, banUser, unbanUser, deleteUser, grantPremium,
  getReports, handleReport,
  getPendingPhotos, moderatePhoto,
  getPayments, getSubscriptions,
  getPromotions, createPromotion, updatePromotion, deletePromotion,
  getAffiliates, createAffiliate, updateAffiliate, getAffiliateTransactions, payCommission,
  getDemoProfiles, createDemoProfile, updateDemoProfile, deleteDemoProfile,
  executeSQL, sendBroadcast,
  getRegistrationStats, getCountryStats,
};

