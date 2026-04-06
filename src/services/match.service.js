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
  const conditions = [`u.id != ${userId}`, `u.status = 'active'`, `u.id NOT IN (${excluded})`];
  const params     = [];

  // Filtre sur le genre recherché
  if (user.looking_for) {
    const lf = JSON.parse(user.looking_for);
    if (lf.length) {
      conditions.push(`u.gender IN (${lf.map(() => '?').join(',')})`);
      params.push(...lf);
    }
  }

  // Filtre continent
  if (filters.continent) {
    conditions.push('u.continent = ?');
    params.push(filters.continent);
  }

  // Filtre pays
  if (filters.country_code) {
    conditions.push('u.country_code = ?');
    params.push(filters.country_code);
  }

  // Filtre âge
  if (filters.age_min) {
    conditions.push('TIMESTAMPDIFF(YEAR, u.birthdate, CURDATE()) >= ?');
    params.push(filters.age_min);
  }
  if (filters.age_max) {
    conditions.push('TIMESTAMPDIFF(YEAR, u.birthdate, CURDATE()) <= ?');
    params.push(filters.age_max);
  }

  // Mode incognito : exclure les profils incognito (sauf Premium)
  conditions.push(`(u.incognito_mode = FALSE OR u.is_premium = TRUE)`);

  const sql = `
    SELECT
      u.uuid, u.first_name, u.gender,
      TIMESTAMPDIFF(YEAR, u.birthdate, CURDATE()) AS age,
      u.country_code, u.country_name, u.city, u.continent,
      u.bio, u.profession, u.is_verified, u.last_active_at,
      (SELECT url FROM user_photos WHERE user_id = u.id AND is_main = TRUE AND moderation_status = 'approved' LIMIT 1) AS main_photo,
      (SELECT COUNT(*) FROM user_photos WHERE user_id = u.id AND moderation_status = 'approved') AS photos_count
    FROM users u
    WHERE ${conditions.join(' AND ')}
    ORDER BY
      u.is_premium DESC,
      (SELECT COUNT(*) FROM profile_boosts WHERE user_id = u.id AND is_active = TRUE AND expires_at > NOW()) DESC,
      u.last_active_at DESC
    LIMIT 20
  `;

  const [profiles] = await pool.query(sql, params);
  return profiles;
}

// ── Swiper un profil ──────────────────────────────────────
async function swipe(swiperId, swipedUuid, action) {
  // Récupérer l'id cible
  const [target] = await pool.query('SELECT id FROM users WHERE uuid = ? AND status = "active"', [swipedUuid]);
  if (!target.length) throw { status: 404, message: 'Profil introuvable' };

  const swipedId = target[0].id;

  // Empêcher de se swiper soi-même
  if (swiperId === swipedId) throw { status: 400, message: 'Action invalide' };

  // Vérifier le quota Super Like (1/jour gratuit)
  if (action === 'super_like') {
    const [user] = await pool.query('SELECT is_premium FROM users WHERE id = ?', [swiperId]);
    if (!user[0].is_premium) {
      const [todaySL] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM swipes
         WHERE swiper_id = ? AND action = 'super_like' AND DATE(created_at) = CURDATE()`,
        [swiperId]
      );
      if (todaySL[0].cnt >= 1) throw { status: 403, message: 'Super Like limité à 1/jour (Premium = illimité)', code: 'SUPER_LIKE_LIMIT' };
    }
  }

  // Insérer ou mettre à jour le swipe
  await pool.query(
    `INSERT INTO swipes (swiper_id, swiped_id, action)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE action = VALUES(action), created_at = NOW()`,
    [swiperId, swipedId, action]
  );

  // Vérifier si c'est un match (l'autre a liké aussi)
  if (action === 'like' || action === 'super_like') {
    const [otherLike] = await pool.query(
      `SELECT id FROM swipes WHERE swiper_id = ? AND swiped_id = ? AND action IN ('like','super_like')`,
      [swipedId, swiperId]
    );

    if (otherLike.length) {
      // Créer le match (user1_id = le plus petit id pour éviter les doublons)
      const [u1, u2] = swiperId < swipedId ? [swiperId, swipedId] : [swipedId, swiperId];
      const [matchResult] = await pool.query(
        `INSERT IGNORE INTO matches (user1_id, user2_id) VALUES (?, ?)`,
        [u1, u2]
      );

      if (matchResult.affectedRows > 0) {
        // Créer la conversation associée
        await pool.query('INSERT INTO conversations (match_id) VALUES (?)', [matchResult.insertId]);
        return { matched: true, matchId: matchResult.insertId };
      }
    }
  }

  return { matched: false };
}

// ── Annuler le dernier swipe (Premium) ────────────────────
async function undoLastSwipe(userId) {
  const [last] = await pool.query(
    `SELECT id, swiped_id FROM swipes WHERE swiper_id = ? ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (!last.length) throw { status: 404, message: 'Aucun swipe à annuler' };

  // Supprimer le swipe et le match potentiel
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
      (SELECT url FROM user_photos WHERE user_id = u.id AND is_main = TRUE AND moderation_status = 'approved' LIMIT 1) AS main_photo,
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

// ── Récupérer un utilisateur ──────────────────────────────
async function getUser(userId) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  if (!rows.length) throw { status: 404, message: 'Utilisateur introuvable' };
  return rows[0];
}

module.exports = { getFeed, swipe, undoLastSwipe, getMatches };
