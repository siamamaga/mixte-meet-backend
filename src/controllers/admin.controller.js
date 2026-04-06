// src/controllers/admin.controller.js
const pool = require('../config/database');

function handleError(res, err) {
  return res.status(err.status || 500).json({ success: false, message: err.message || 'Erreur serveur' });
}

// ── Dashboard KPIs ────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const [[totalUsers]]   = await pool.query('SELECT COUNT(*) AS n FROM users WHERE status = "active"');
    const [[newToday]]     = await pool.query('SELECT COUNT(*) AS n FROM users WHERE DATE(created_at) = CURDATE()');
    const [[activeToday]]  = await pool.query('SELECT COUNT(*) AS n FROM users WHERE last_active_at >= NOW() - INTERVAL 24 HOUR');
    const [[totalMatches]] = await pool.query('SELECT COUNT(*) AS n FROM matches');
    const [[totalMsgs]]    = await pool.query('SELECT COUNT(*) AS n FROM messages');
    const [[premiums]]     = await pool.query('SELECT COUNT(*) AS n FROM users WHERE is_premium = TRUE');
    const [[pendingPhotos]]= await pool.query('SELECT COUNT(*) AS n FROM user_photos WHERE moderation_status = "pending"');
    const [[pendingReports]]= await pool.query('SELECT COUNT(*) AS n FROM reports WHERE status = "pending"');
    const [[revenueMonth]] = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status="success" AND MONTH(created_at)=MONTH(NOW()) AND currency="XOF"'
    );

    // Inscriptions 7 derniers jours
    const [signupsChart] = await pool.query(`
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM users WHERE created_at >= NOW() - INTERVAL 7 DAY
      GROUP BY DATE(created_at) ORDER BY date ASC
    `);

    // Top pays
    const [topCountries] = await pool.query(`
      SELECT country_name, country_code, COUNT(*) AS count
      FROM users WHERE status = "active" AND country_name IS NOT NULL
      GROUP BY country_code, country_name ORDER BY count DESC LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        kpis: {
          total_users:     totalUsers.n,
          new_today:       newToday.n,
          active_today:    activeToday.n,
          total_matches:   totalMatches.n,
          total_messages:  totalMsgs.n,
          premium_users:   premiums.n,
          pending_photos:  pendingPhotos.n,
          pending_reports: pendingReports.n,
          revenue_month_xof: revenueMonth.n,
        },
        signups_chart: signupsChart,
        top_countries:  topCountries,
      }
    });
  } catch (err) { handleError(res, err); }
};

// ── Liste des membres ─────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, country } = req.query;
    const offset     = (page - 1) * limit;
    const conditions = [];
    const params     = [];

    if (search) { conditions.push('(email LIKE ? OR first_name LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (status)  { conditions.push('status = ?');       params.push(status); }
    if (country) { conditions.push('country_code = ?'); params.push(country); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [users] = await pool.query(
      `SELECT id, uuid, email, first_name, gender, status, role, is_premium, is_verified,
              country_code, country_name, created_at, last_active_at
       FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, +limit, +offset]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users ${where}`, params);

    res.json({ success: true, data: users, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (err) { handleError(res, err); }
};

// ── Bannir un membre ──────────────────────────────────────
exports.banUser = async (req, res) => {
  try {
    const { reason, duration_days } = req.body;
    await pool.query('UPDATE users SET status = "banned" WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Compte suspendu' });
  } catch (err) { handleError(res, err); }
};

// ── Signalements ──────────────────────────────────────────
exports.getReports = async (req, res) => {
  try {
    const [reports] = await pool.query(`
      SELECT r.*, u1.email AS reporter_email, u2.email AS reported_email
      FROM reports r
      JOIN users u1 ON u1.id = r.reporter_id
      LEFT JOIN users u2 ON u2.id = r.reported_user_id
      WHERE r.status = 'pending'
      ORDER BY r.created_at ASC LIMIT 50
    `);
    res.json({ success: true, data: reports });
  } catch (err) { handleError(res, err); }
};

exports.handleReport = async (req, res) => {
  try {
    const { status, action_taken } = req.body;
    await pool.query(
      'UPDATE reports SET status = ?, action_taken = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      [status, action_taken, req.user.id, req.params.id]
    );
    res.json({ success: true, message: 'Signalement traité' });
  } catch (err) { handleError(res, err); }
};

// ── Modération photos ─────────────────────────────────────
exports.getPendingPhotos = async (req, res) => {
  try {
    const [photos] = await pool.query(`
      SELECT p.id, p.url, p.created_at, u.email, u.first_name
      FROM user_photos p JOIN users u ON u.id = p.user_id
      WHERE p.moderation_status = 'pending'
      ORDER BY p.created_at ASC LIMIT 30
    `);
    res.json({ success: true, data: photos });
  } catch (err) { handleError(res, err); }
};

exports.moderatePhoto = async (req, res) => {
  try {
    const { status, rejected_reason } = req.body;
    if (!['approved','rejected'].includes(status)) return res.status(400).json({ success: false, message: 'Status invalide' });
    await pool.query(
      'UPDATE user_photos SET moderation_status = ?, rejected_reason = ? WHERE id = ?',
      [status, rejected_reason || null, req.params.id]
    );
    res.json({ success: true, message: `Photo ${status === 'approved' ? 'approuvée' : 'rejetée'}` });
  } catch (err) { handleError(res, err); }
};
