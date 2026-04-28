// src/services/notification.service.js
const admin = require('firebase-admin');
const pool = require('../config/database');

// Initialiser Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('../../firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

async function sendPush(userId, title, body, data = {}) {
  try {
    const [tokens] = await pool.query(
      'SELECT token FROM push_tokens WHERE user_id = ? AND is_active = 1',
      [userId]
    );
    if (!tokens.length) return;
    const messages = tokens.map(t => ({
      token: t.token,
      notification: { title, body },
      data: { ...data },
      webpush: {
        notification: {
          title, body,
          icon: 'https://mixte-meet.fr/icons/icon-192.png',
          badge: 'https://mixte-meet.fr/icons/badge.png',
          vibrate: [200, 100, 200]
        },
        fcmOptions: { link: 'https://mixte-meet.fr' }
      }
    }));
    const results = await Promise.allSettled(
      messages.map(m => admin.messaging().send(m))
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        // Token invalide → désactiver
        pool.query('UPDATE push_tokens SET is_active = 0 WHERE token = ?', [tokens[i].token]);
      }
    });
  } catch(err) {
    console.error('Push error:', err.message);
  }
}

async function sendMatchNotif(userId, matchName) {
  await sendPush(userId, '💕 Nouveau Match !', matchName + ' a liké votre profil aussi !', { type: 'match' });
}

async function sendMessageNotif(userId, senderName, content) {
  const body = content.startsWith('[Message vocal]') ? '🎙️ Message vocal' : content.substring(0, 50);
  await sendPush(userId, '💬 ' + senderName, body, { type: 'message' });
}

async function sendLikeNotif(userId, likerName) {
  await sendPush(userId, '❤️ Quelqu\'un vous a liké !', likerName + ' a aimé votre profil', { type: 'like' });
}

module.exports = { sendPush, sendMatchNotif, sendMessageNotif, sendLikeNotif };
