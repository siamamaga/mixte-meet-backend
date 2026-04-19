// src/services/message.service.js
const pool = require('../config/database');

// ── Vérifier l'accès à une conversation ──────────────────
async function checkAccess(conversationId, userId) {
  const [rows] = await pool.query(`
    SELECT c.id FROM conversations c
    JOIN matches m ON m.id = c.match_id
    WHERE c.id = ? AND (m.user1_id = ? OR m.user2_id = ?) AND m.is_active = TRUE
  `, [conversationId, userId, userId]);
  if (!rows.length) throw { status: 403, message: 'Accès refusé à cette conversation' };
}

// ── Historique des messages ───────────────────────────────
async function getMessages(conversationId, userId, page = 1, limit = 30) {
  await checkAccess(conversationId, userId);

  const offset = (page - 1) * limit;
  const [messages] = await pool.query(`
    SELECT
      m.id, m.type, m.content, m.media_url, m.duration_sec,
      m.is_ephemeral, m.expires_at, m.is_read, m.read_at,
      m.created_at,
      u.uuid AS sender_uuid, u.first_name AS sender_name,
      (SELECT url FROM user_photos WHERE user_id = u.id AND is_main = TRUE AND moderation_status = 'approved' LIMIT 1) AS sender_photo
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ?
      AND (m.is_deleted_sender = FALSE OR m.sender_id != ?)
      AND (m.is_deleted_receiver = FALSE OR m.sender_id = ?)
      AND (m.expires_at IS NULL OR m.expires_at > NOW())
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `, [conversationId, userId, userId, limit, offset]);

  // Marquer les messages reçus comme lus
  await pool.query(`
    UPDATE messages SET is_read = TRUE, read_at = NOW()
    WHERE conversation_id = ? AND sender_id != ? AND is_read = FALSE
  `, [conversationId, userId]);

  return messages.reverse();
}

// ── Envoyer un message (texte / média) ───────────────────
async function sendMessage(conversationId, senderId, { type = 'text', content, media_url, duration_sec, is_ephemeral = false }) {
  await checkAccess(conversationId, senderId);

  if (!content && !media_url) throw { status: 400, message: 'Contenu ou média requis' };

  const expires_at = is_ephemeral ? new Date(Date.now() + 24 * 3600 * 1000) : null;

  const [result] = await pool.query(`
    INSERT INTO messages (conversation_id, sender_id, type, content, media_url, duration_sec, is_ephemeral, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [conversationId, senderId, type, content || null, media_url || null, duration_sec || null, is_ephemeral, expires_at]);

  // Mettre à jour last_message_at de la conversation
  await pool.query('UPDATE conversations SET last_message_at = NOW() WHERE id = ?', [conversationId]);

  const [msg] = await pool.query(`
    SELECT m.*, u.first_name AS sender_name, u.uuid AS sender_uuid
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.id = ?
  `, [result.insertId]);

  return msg[0];
}

// ── Supprimer un message ──────────────────────────────────
async function deleteMessage(messageId, userId) {
  const [rows] = await pool.query('SELECT sender_id, conversation_id FROM messages WHERE id = ?', [messageId]);
  if (!rows.length) throw { status: 404, message: 'Message introuvable' };

  const msg = rows[0];
  if (msg.sender_id === userId) {
    await pool.query('UPDATE messages SET is_deleted_sender = TRUE WHERE id = ?', [messageId]);
  } else {
    await checkAccess(msg.conversation_id, userId);
    await pool.query('UPDATE messages SET is_deleted_receiver = TRUE WHERE id = ?', [messageId]);
  }
  return { message: 'Message supprimé' };
}

// ── Ajouter une réaction ──────────────────────────────────
async function addReaction(messageId, userId, emoji) {
  await pool.query(`
    INSERT INTO message_reactions (message_id, user_id, emoji)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE emoji = VALUES(emoji)
  `, [messageId, userId, emoji]);
  return { message: 'Réaction ajoutée' };
}

module.exports = { getMessages, sendMessage, deleteMessage, addReaction };

