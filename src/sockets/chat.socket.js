// src/sockets/chat.socket.js
const jwt     = require('jsonwebtoken');
const pool    = require('../config/database');
const msgSvc  = require('../services/message.service');

// Map userId → socketId pour savoir si un user est en ligne
const onlineUsers = new Map();

function initSocket(io) {

  // ── Authentification Socket ────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Token manquant'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const [rows]  = await pool.query('SELECT id, first_name, status FROM users WHERE id = ? AND status = "active"', [decoded.id]);
      if (!rows.length) return next(new Error('Utilisateur invalide'));

      socket.userId   = rows[0].id;
      socket.userName = rows[0].first_name;
      next();
    } catch {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    onlineUsers.set(userId, socket.id);

    console.log(`🟢 Connecté: ${socket.userName} (${userId})`);

    // Mettre à jour last_active_at
    pool.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [userId]);

    // Notifier ses matchs qu'il est en ligne
    notifyContactsOnlineStatus(io, userId, true);

    // ── Rejoindre les rooms de ses conversations ──────────
    socket.on('join_conversations', async () => {
      try {
        const [convs] = await pool.query(`
          SELECT c.id FROM conversations c
          JOIN matches m ON m.id = c.match_id
          WHERE (m.user1_id = ? OR m.user2_id = ?) AND m.is_active = TRUE
        `, [userId, userId]);
        convs.forEach(c => socket.join(`conv_${c.id}`));
      } catch (err) {
        socket.emit('error', { message: 'Erreur lors de la jonction aux conversations' });
      }
    });

    // ── Envoyer un message ────────────────────────────────
    socket.on('send_message', async (data) => {
      try {
        const { conversation_id, type, content, media_url, duration_sec, is_ephemeral } = data;
        const message = await msgSvc.sendMessage(conversation_id, userId, { type, content, media_url, duration_sec, is_ephemeral });

        // Diffuser à tous les membres de la conversation
        io.to(`conv_${conversation_id}`).emit('new_message', message);

      } catch (err) {
        socket.emit('error', { message: err.message || 'Erreur envoi message' });
      }
    });

    // ── Indicateur de frappe ──────────────────────────────
    socket.on('typing_start', ({ conversation_id }) => {
      socket.to(`conv_${conversation_id}`).emit('user_typing', { userId, conversation_id });
    });

    socket.on('typing_stop', ({ conversation_id }) => {
      socket.to(`conv_${conversation_id}`).emit('user_stopped_typing', { userId, conversation_id });
    });

    // ── Marquer comme lu ──────────────────────────────────
    socket.on('mark_read', async ({ conversation_id }) => {
      try {
        await pool.query(`
          UPDATE messages SET is_read = TRUE, read_at = NOW()
          WHERE conversation_id = ? AND sender_id != ? AND is_read = FALSE
        `, [conversation_id, userId]);
        socket.to(`conv_${conversation_id}`).emit('messages_read', { conversation_id, reader_id: userId });
      } catch {}
    });

    // ── Réaction ──────────────────────────────────────────
    socket.on('add_reaction', async ({ message_id, conversation_id, emoji }) => {
      try {
        await msgSvc.addReaction(message_id, userId, emoji);
        io.to(`conv_${conversation_id}`).emit('reaction_added', { message_id, user_id: userId, emoji });
      } catch {}
    });

    // ── Déconnexion ───────────────────────────────────────
    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      pool.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [userId]);
      notifyContactsOnlineStatus(io, userId, false);
      console.log(`🔴 Déconnecté: ${socket.userName}`);
    });
  });
}

// ── Notifier les contacts du statut en ligne ──────────────
async function notifyContactsOnlineStatus(io, userId, isOnline) {
  try {
    const [contacts] = await pool.query(`
      SELECT IF(m.user1_id = ?, m.user2_id, m.user1_id) AS contact_id
      FROM matches m
      WHERE (m.user1_id = ? OR m.user2_id = ?) AND m.is_active = TRUE
    `, [userId, userId, userId]);

    contacts.forEach(({ contact_id }) => {
      const socketId = onlineUsers.get(contact_id);
      if (socketId) {
        io.to(socketId).emit('contact_online_status', { userId, isOnline });
      }
    });
  } catch {}
}

// Vérifier si un utilisateur est en ligne
function isOnline(userId) {
  return onlineUsers.has(userId);
}

module.exports = { initSocket, isOnline };
