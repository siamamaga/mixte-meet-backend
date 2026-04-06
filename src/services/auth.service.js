// src/services/auth.service.js
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool   = require('../config/database');

// ── Génère une paire de tokens JWT ────────────────────────
function generateTokens(userId) {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  const refreshToken = jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
  return { accessToken, refreshToken };
}

// ── INSCRIPTION ───────────────────────────────────────────
async function register({ email, password, first_name, birthdate, gender, country_code, country_name }) {

  // Vérifier si l'email existe déjà
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) throw { status: 409, message: 'Cet email est déjà utilisé' };

  // Calcul âge minimum (18 ans)
  const birth = new Date(birthdate);
  const age   = Math.floor((Date.now() - birth) / (365.25 * 24 * 3600 * 1000));
  if (age < 18) throw { status: 400, message: 'Vous devez avoir au moins 18 ans' };

  // Hash du mot de passe
  const password_hash = await bcrypt.hash(password, 12);
  const userUuid      = uuidv4();

  // Déterminer le continent à partir du pays
  const continentMap = {
    'BJ':'AF','CI':'AF','SN':'AF','NG':'AF','GH':'AF','CM':'AF','ML':'AF','BF':'AF',
    'TG':'AF','NE':'AF','CD':'AF','GA':'AF','CG':'AF','MA':'AF','TN':'AF','DZ':'AF',
    'EG':'AF','ET':'AF','KE':'AF','TZ':'AF','ZA':'AF','RW':'AF','UG':'AF',
    'FR':'EU','BE':'EU','CH':'EU','LU':'EU','DE':'EU','GB':'EU','ES':'EU','IT':'EU',
    'PT':'EU','NL':'EU','SE':'EU','NO':'EU','DK':'EU','FI':'EU',
    'US':'NA','CA':'NA','MX':'NA',
    'BR':'SA','CO':'SA','AR':'SA','PE':'SA','VE':'SA','CL':'SA',
    'CN':'AS','JP':'AS','IN':'AS','KR':'AS','TH':'AS','SG':'AS','AE':'AS',
    'AU':'OC','NZ':'OC',
  };
  const continent = continentMap[country_code] || null;

  const [result] = await pool.query(
    `INSERT INTO users (uuid, email, password_hash, first_name, birthdate, gender, country_code, country_name, continent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userUuid, email, password_hash, first_name, birthdate, gender, country_code, country_name, continent]
  );

  const userId = result.insertId;
  const tokens = generateTokens(userId);

  return {
    user: { id: userId, uuid: userUuid, email, first_name, gender, country_code },
    ...tokens
  };
}

// ── CONNEXION ─────────────────────────────────────────────
async function login({ email, password }) {
  const [rows] = await pool.query(
    `SELECT id, uuid, email, password_hash, first_name, status, role,
            is_premium, coins, two_fa_enabled, last_active_at
     FROM users WHERE email = ?`,
    [email]
  );

  if (!rows.length) throw { status: 401, message: 'Email ou mot de passe incorrect' };

  const user = rows[0];
  if (user.status === 'banned')     throw { status: 403, message: 'Compte suspendu. Contactez le support.' };
  if (user.status === 'deleted')    throw { status: 404, message: 'Compte introuvable' };

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw { status: 401, message: 'Email ou mot de passe incorrect' };

  // Si 2FA activé → demander le code
  if (user.two_fa_enabled) {
    return { requires2FA: true, userId: user.id };
  }

  // Mettre à jour last_login_at
  await pool.query('UPDATE users SET last_login_at = NOW(), last_active_at = NOW() WHERE id = ?', [user.id]);

  const tokens = generateTokens(user.id);
  delete user.password_hash;

  return { user, ...tokens };
}

// ── REFRESH TOKEN ─────────────────────────────────────────
async function refreshToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const [rows]  = await pool.query('SELECT id, status FROM users WHERE id = ?', [decoded.id]);
    if (!rows.length || rows[0].status !== 'active') throw new Error('Utilisateur invalide');
    return generateTokens(rows[0].id);
  } catch {
    throw { status: 401, message: 'Refresh token invalide ou expiré' };
  }
}

// ── CHANGEMENT MOT DE PASSE ───────────────────────────────
async function changePassword(userId, { oldPassword, newPassword }) {
  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
  const valid  = await bcrypt.compare(oldPassword, rows[0].password_hash);
  if (!valid) throw { status: 401, message: 'Ancien mot de passe incorrect' };

  const newHash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
  return { message: 'Mot de passe mis à jour' };
}

module.exports = { register, login, refreshToken, changePassword };
