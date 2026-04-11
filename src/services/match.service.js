// src/services/match.service.js
const pool = require('../config/database');

// ── Profils à découvrir (feed) ────────────────────────────
async function getFeed(userId, filters = {}) {
  const user = await getUser(userId);

  // Sous-requête : déjà swipés ou bloqués
  const excluded = `
    SELECT swiped_id  FROM swipes  WHERE swiper_id = ${userId}
    UNION
    SELECT blocker_id FROM blocks  WHERE blocked_id = ${userId}
    UNION
    SELECT blocked_id FROM blocks  WHERE blocker_id = ${userId}
  `;

  // Construire les filtres dynamiques
  const conditions = [`u.id != ${userId}`, `u.status = 'active'`, `u.role = 'user'`, `u.id NOT IN (${excluded})`];
  const params     = [];

  // Filtre continent
  if (filters.continent) { conditions.push('u.continent = ?'); params.push(filters.continent); }
  if (filters.country_code) { conditions.push('u.country_code = ?'); params.push(filters.country_code); }
  if (filters.age_min) { conditions.push('TIMESTAMPDIFF(YEAR, u.birthdate, CURDATE()) >= ?'); params.push(filters.age_min); }
  if (filters.age_max) { conditions.push('TIMESTAMPDIFF(YEAR, u.birthdate, CURDATE()) <= ?'); params.push(filters.age_max); }

  conditions.push(`(u.incognito_mode = FALSE OR u.is_premium = TRUE)`);

  // 1. Vrais membres
  const sqlReal = `
    SELECT
      u.uuid, u.first_name, u.gender,
      TIMESTAMPDIFF(YEAR, u.birthdate, CURDATE()) AS age,
      u.country_code, u.country_name, u.city, u.continent,
      u.bio, u.profession, u.is_verified, u.last_active_at,
      (SELECT url FROM user_photos WHERE user_id = u.id AND is_main = 1 LIMIT 1) AS main_photo,
      (SELECT COUNT(*) FROM user_photos WHERE user_id = u.id) AS photos_count,
      'real' AS profile_type
    FROM users u
    WHERE ${conditions.join(' AND ')}
    ORDER BY u.is_premium DESC, u.last_active_at DESC
    LIMIT 20
  `;

  // 2. Profils démo (toujours visibles)
  let demoConditions = ['d.is_active = TRUE'];
  const demoParams = [];
  if (filters.continent === 'AF') { demoConditions.push("d.country_code IN ('BJ','CI','SN','GH','CM','ML','GN','NG','TG')"); }
  if (filters.continent === 'EU') { demoConditions.push("d.country_code IN ('FR','BE','CH','DE','GB','ES','IT')"); }
  if (filters.continent === 'NA' || filters.continent === 'SA') { demoConditions.push("d.country_code IN ('US','CA','BR','CO')"); }

  const sqlDemo = `
    SELECT
      CONCAT('demo-', d.id) AS uuid,
      d.first_name, d.gender, d.age,
      d.country_code, d.country_name, d.city,
      NULL AS continent,
      d.bio, d.profession,
      1 AS is_verified, NOW() AS last_active_at,
      NULL AS main_photo,
      0 AS photos_count,
      'demo' AS profile_type,
      d.emoji
    FROM demo_profiles d
    WHERE ${demoConditions.join(' AND ')}
    ORDER BY RAND()
    LIMIT 10
  `;

  const [realProfiles] = await pool.query(sqlReal, params);
  const [demoProfiles] = await pool.query(sqlDemo, demoParams).catch(() => [[]]);

  // Mélanger les profils réels et démo
  const combined = [...realProfiles, ...demoProfiles];

  // Mélanger aléatoirement
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined;
}

// ── Swiper un profil ──────────────────────────────────────
async function swipe(swiperId, swipedUuid, action) {
  // Si c'est un profil démo (uuid commence par 'demo-')
  if (swipedUuid.startsWith('demo-')) {
    // Simuler un match si c'est un like
    if (action === 'like' || action === 'super_like') {
      const demoId = swipedUuid.replace('demo-', '');
      const [demo] = await pool.query('SELECT * FROM demo_profiles WHERE id = ?', [demoId]).catch(() => [[]]);
      if (demo.length && Math.random() > 0.3) { // 70% de chance de match avec un profil démo
        return { matched: true, matchId: null, isDemo: true, demoProfile: demo[0] };
      }
    }
    return { matched: false };
  }

  // Profil réel
  const [target] = await pool.query('SELECT id FROM users WHERE uuid = ? AND status = "active"', [swipedUuid]);
  if (!target.length) throw { status: 404, message: 'Profil introuvable' };

  const swipedId = target[0].id;
  if (swiperId === swipedId) throw { status: 400, message: 'Action invalide' };

  // Vérifier quota Super Like
  if (action === 'super_like') {
    const [user] = await pool.query('SELECT is_premium FROM users WHERE id = ?', [swiperId]);
    if (!user[0].is_premium) {
      const [todaySL] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM swipes WHERE swiper_id = ? AND action = 'super_like' AND DATE(created_at) = CURDATE()`,
        [swiperId]
      );
      if (todaySL[0].cnt >= 1) throw { status: 403, message: 'Super Like limité à 1/jour (Premium = illimité)', code: 'SUPER_LIKE_LIMIT' };
    }
  }

  await pool.query(
    `INSERT INTO swipes (swiper_id, swiped_id, action) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE action = VALUES(action), created_at = NOW()`,
    [swiperId, swipedId, action]
  );

  if (action === 'like' || action === 'super_like') {
    const [otherLike] = await pool.query(
      `SELECT id FROM swipes WHERE swiper_id = ? AND swiped_id = ? AND action IN ('like','super_like')`,
      [swipedId, swiperId]
    );

    if (otherLike.length) {
      const [u1, u2] = swiperId < swipedId ? [swiperId, swipedId] : [swipedId, swiperId];
      const [matchResult] = await pool.query(
        `INSERT IGNORE INTO matches (user1_id, user2_id) VALUES (?, ?)`, [u1, u2]
      );
      if (matchResult.affectedRows > 0) {
        await pool.query('INSERT INTO conversations (match_id) VALUES (?)', [matchResult.insertId]);
        return { matched: true, matchId: matchResult.insertId };
      }
    }
  }

  return { matched: false };
}

// ── Annuler le dernier swipe ──────────────────────────────
async function undoLastSwipe(userId) {
  const [last] = await pool.query(
    `SELECT id FROM swipes WHERE swiper_id = ? ORDER BY created_at DESC LIMIT 1`, [userId]
  );
  if (!last.length) throw { status: 404, message: 'Aucun swipe à annuler' };
  await pool.query('DELETE FROM swipes WHERE id = ?', [last[0].id]);
  return { message: 'Dernier swipe annulé' };
}

// ── Liste des matchs ──────────────────────────────────────
async function getMatches(userId) {
  const [matches] = await pool.query(`
    SELECT
      m.id AS match_id, m.matched_at,
      u.uuid, u.first_name, u.is_verified, u.last_active_at,
      TIMESTAMPDIFF(YEAR, u.birthdate, CURDATE()) AS age,
      u.country_code, u.city,
      (SELECT url FROM user_photos WHERE user_id = u.id AND is_main = 1 LIMIT 1) AS main_photo,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND is_read = FALSE) AS unread_count,
      c.id AS conversation_id
    FROM matches m
    JOIN conversations c ON c.match_id = m.id
    JOIN users u ON u.id = IF(m.user1_id = ?, m.user2_id, m.user1_id)
    WHERE (m.user1_id = ? OR m.user2_id = ?) AND m.is_active = TRUE
    ORDER BY last_message_at DESC, m.matched_at DESC
  `, [userId, userId, userId, userId]);

  return matches;
}

async function getUser(userId) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  if (!rows.length) throw { status: 404, message: 'Utilisateur introuvable' };
  return rows[0];
}

module.exports = { getFeed, swipe, undoLastSwipe, getMatches };


