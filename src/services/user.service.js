// src/services/user.service.js
const pool       = require('../config/database');
const cloudinary = require('../config/cloudinary');

// ── Champs publics d'un profil ────────────────────────────
const PUBLIC_FIELDS = `
  u.uuid, u.first_name, u.gender, u.birthdate, u.bio, u.profession,
  u.education, u.height_cm, u.body_type, u.country_code, u.country_name,
  u.city, u.continent, u.ethnicity, u.religion, u.languages,
  u.open_to_interracial, u.diaspora, u.is_verified, u.is_premium,
  u.last_active_at, u.show_online_status,
  TIMESTAMPDIFF(YEAR, u.birthdate, CURDATE()) AS age
`;

// ── Récupérer son propre profil ───────────────────────────
async function getMyProfile(userId) {
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS}, u.email, u.phone, u.coins, u.premium_expires_at,
            u.ui_language, u.dark_mode, u.notifications_enabled,
            u.incognito_mode, u.looking_for, u.two_fa_enabled
     FROM users u WHERE u.id = ?`,
    [userId]
  );
  if (!rows.length) throw { status: 404, message: 'Profil introuvable' };
  const user   = rows[0];
  user.photos  = await getPhotos(userId);
  return user;
}

// ── Récupérer un profil public ────────────────────────────
async function getProfile(uuid, viewerId) {
  const [rows] = await pool.query(
    `SELECT ${PUBLIC_FIELDS}, u.id FROM users u WHERE u.uuid = ? AND u.status = 'active'`,
    [uuid]
  );
  if (!rows.length) throw { status: 404, message: 'Profil introuvable' };

  const user = rows[0];

  // Enregistrer la vue profil
  if (viewerId && viewerId !== user.id) {
    await pool.query(
      'INSERT INTO profile_views (viewer_id, viewed_id) VALUES (?, ?)',
      [viewerId, user.id]
    );
  }

  user.photos = await getPhotos(user.id);
  delete user.id; // Ne pas exposer l'id interne
  return user;
}

// ── Mettre à jour le profil ───────────────────────────────
async function updateProfile(userId, data) {
  const allowed = [
    'first_name','bio','profession','education','height_cm','body_type',
    'country_code','country_name','city','ethnicity','religion','languages',
    'open_to_interracial','diaspora','looking_for','smoking','drinking',
    'children','ui_language','dark_mode','notifications_enabled',
    'show_online_status','incognito_mode'
  ];

  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key]);
    }
  }

  if (!fields.length) throw { status: 400, message: 'Aucun champ à mettre à jour' };

  values.push(userId);
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  return getMyProfile(userId);
}

// ── Photos du profil ──────────────────────────────────────
async function getPhotos(userId) {
  const [photos] = await pool.query(
    `SELECT id, url, url_thumb, is_main, sort_order
     FROM user_photos WHERE user_id = ? AND moderation_status = 'approved'
     ORDER BY is_main DESC, sort_order ASC`,
    [userId]
  );
  return photos;
}

// ── Uploader une photo ────────────────────────────────────
async function uploadPhoto(userId, fileBuffer, mimetype) {
  // Compter les photos existantes (max 6)
  const [count] = await pool.query(
    'SELECT COUNT(*) AS total FROM user_photos WHERE user_id = ?', [userId]
  );
  if (count[0].total >= 6) throw { status: 400, message: 'Maximum 6 photos autorisées' };

  // Upload vers Cloudinary
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'mixte-meet/profiles', transformation: [{ width: 800, crop: 'limit' }] },
      (err, res) => err ? reject(err) : resolve(res)
    );
    stream.end(fileBuffer);
  });

  const isFirst = count[0].total === 0;

  const [insert] = await pool.query(
    `INSERT INTO user_photos (user_id, cloudinary_id, url, url_thumb, is_main, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, result.public_id, result.secure_url,
     result.secure_url.replace('/upload/', '/upload/w_200,h_200,c_fill/'),
     isFirst, count[0].total]
  );

  return { id: insert.insertId, url: result.secure_url, is_main: isFirst };
}

// ── Définir la photo principale ───────────────────────────
async function setMainPhoto(userId, photoId) {
  await pool.query('UPDATE user_photos SET is_main = FALSE WHERE user_id = ?', [userId]);
  await pool.query('UPDATE user_photos SET is_main = TRUE  WHERE id = ? AND user_id = ?', [photoId, userId]);
  return { message: 'Photo principale mise à jour' };
}

// ── Supprimer une photo ───────────────────────────────────
async function deletePhoto(userId, photoId) {
  const [rows] = await pool.query(
    'SELECT cloudinary_id FROM user_photos WHERE id = ? AND user_id = ?', [photoId, userId]
  );
  if (!rows.length) throw { status: 404, message: 'Photo introuvable' };

  await cloudinary.uploader.destroy(rows[0].cloudinary_id);
  await pool.query('DELETE FROM user_photos WHERE id = ?', [photoId]);
  return { message: 'Photo supprimée' };
}

module.exports = { getMyProfile, getProfile, updateProfile, uploadPhoto, setMainPhoto, deletePhoto };
