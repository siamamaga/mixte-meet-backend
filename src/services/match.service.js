// src/services/match.service.js
const pool = require('../config/database');

// ── Profils à découvrir (feed) ────────────────────────────
async function getFeed(userId, filters = {}) {
  const user = await getUser(userId);

  // 1. Auto-reinitialiser si tous les profils ont ete vus
  const [available] = await pool.query(
    'SELECT COUNT(*) as cnt FROM users WHERE id != ? AND status = "active" AND role = "user"',
    [userId]
  );
  const [alreadySwiped] = await pool.query(
    'SELECT COUNT(*) as cnt FROM swipes WHERE swiper_id = ?',
    [userId]
  );
  if (available[0].cnt > 0 && alreadySwiped[0].cnt >= available[0].cnt) {
    await pool.query('DELETE FROM swipes WHERE swiper_id = ?', [userId]);
  }

  // 2. Sous-requête : déjà swipés ou bloqués (APRES le reset)
  const excluded = `
    SELECT swiped_id  FROM swipes  WHERE swiper_id = ${userId}
    UNION
    SELECT blocker_id FROM blocks  WHERE blocked_id = ${userId}
    UNION
    SELECT blocked_id FROM blocks  WHERE blocker_id = ${userId}
  `;

  // 3. Construire les filtres dynamiques
  const conditions = [`u.id != ${userId}`, `u.status = 'active'`, `u.role = 'user'`, `u.id NOT IN (${excluded})`];
  const params     = [];

  if (filters.continent)    { conditions.push('u.continent = ?');    params.push(filters.continent); }
  if (filters.country_code) { conditions.push('u.country_code = ?'); params.push(filters.country_code); }
  if (filters.age_min) { conditions.push('TIMESTAMPDIFF(YEAR, u.birthdate, CURDATE()) >= ?'); params.push(filters.age_min); }
  if (filters.age_max) { conditions.push('TIMESTAMPDIFF(YEAR, u.birthdate, CURDATE()) <= ?'); params.push(filters.age_max); }

  conditions.push(`(u.incognito_mode = FALSE OR u.is_premium = TRUE)`);

  // 4. Vrais membres
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

  // 5. Profils démo (toujours visibles)
  let demoConditions = ['d.is_active = TRUE'];
  const demoParams = [];
  if (filters.continent === 'AF') { demoConditions.push("d.country_code IN ('BJ','CI','SN','GH','CM','ML','GN','NG','TG')"); }
  if (filters.continent === 'EU') { demoConditions.push("d.country_code IN ('FR','BE','CH','DE','GB','ES','IT')"); }
  if (filters.continent === 'NA' || filters.continent === 'SA') { demoConditions.push("d.country_code IN ('US','CA','BR','CO')"); }

  const sqlDemo = `
    SELECT
      d.uuid, d.first_name, d.gender, d.age,
      d.country_code, d.country_name, d.city, d.continent,
      d.bio, d.profession, 0 AS is_verified, NULL AS last_active_at,
      d.photo_url AS main_photo, 1 AS photos_count,
      'demo' AS profile_type
    FROM demo_profiles d
    WHERE ${demoConditions.join(' AND ')}
    ORDER BY RAND()
    LIMIT 10
  `;

  const [[realProfiles], [demoProfiles]] = await Promise.all([
    pool.query(sqlReal, params),
    pool.query(sqlDemo, demoParams),
  ]);

  // Mélanger réels et démos
  const combined = [...realProfiles];
  if (combined.length < 5) combined.push(...demoProfiles);

  return combined;
}

async function getUser(userId) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  return rows[0] || null;
}

async function recordSwipe(swiperId, swipedUuid, action) {
  const [target] = await pool.query('SELECT id FROM users WHERE uuid = ?', [swipedUuid]);
  if (!target.length) throw { status: 404, message: 'Profil introuvable' };
  const swipedId = target[0].id;

  await pool.query(
    'INSERT INTO swipes (swiper_id, swiped_id, action) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE action = ?',
    [swiperId, swipedId, action, action]
  );

  if (action === 'like' || action === 'super_like') {
    const [mutual] = await pool.query(
      'SELECT id FROM swipes WHERE swiper_id = ? AND swiped_id = ? AND action IN ("like","super_like")',
      [swipedId, swiperId]
    );
    if (mutual.length) {
      const [u1, u2] = swiperId < swipedId ? [swiperId, swipedId] : [swipedId, swiperId];
      const [existing] = await pool.query('SELECT id FROM matches WHERE user1_id = ? AND user2_id = ?', [u1, u2]);
      if (!existing.length) {
        const [result] = await pool.query('INSERT INTO matches (user1_id, user2_id) VALUES (?, ?)', [u1, u2]);
        await pool.query('INSERT INTO conversations (match_id) VALUES (?)', [result.insertId]);
      }
      return { matched: true };
    }
  }
  return { matched: false };
}

async function getMatches(userId) {
  const [rows] = await pool.query(`
    SELECT
      m.id AS match_id,
      c.id AS conversation_id,
      CASE WHEN m.user1_id = ? THEN u2.uuid     ELSE u1.uuid     END AS uuid,
      CASE WHEN m.user1_id = ? THEN u2.first_name ELSE u1.first_name END AS first_name,
      CASE WHEN m.user1_id = ? THEN u2.country_code ELSE u1.country_code END AS country_code,
      CASE WHEN m.user1_id = ? THEN u2.last_active_at ELSE u1.last_active_at END AS last_active_at,
      (CASE WHEN m.user1_id = ?
        THEN (SELECT url FROM user_photos WHERE user_id = u2.id AND is_main = 1 LIMIT 1)
        ELSE (SELECT url FROM user_photos WHERE user_id = u1.id AND is_main = 1 LIMIT 1)
      END) AS main_photo,
      c.last_message_at,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND is_read = 0) AS unread_count,
      m.matched_at
    FROM matches m
    JOIN users u1 ON u1.id = m.user1_id
    JOIN users u2 ON u2.id = m.user2_id
    LEFT JOIN conversations c ON c.match_id = m.id
    WHERE (m.user1_id = ? OR m.user2_id = ?) AND m.is_active = TRUE
    ORDER BY COALESCE(c.last_message_at, m.matched_at) DESC
  `, [userId, userId, userId, userId, userId, userId, userId, userId]);
  return rows;
}

module.exports = { getFeed, recordSwipe, getMatches };