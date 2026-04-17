// src/services/email.service.js — Mixte-Meet Email Service
const nodemailer = require('nodemailer');

// ── Transporteur SMTP Gmail ─────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

// ── Template de base ────────────────────────────────────
function baseTemplate(content) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mixte-Meet</title>
</head>
<body style="margin:0;padding:0;background:#0A080B;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A080B;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" style="max-width:560px;background:#140F17;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#E8317A,#C41F65);padding:32px;text-align:center;">
          <div style="font-size:36px;margin-bottom:8px;">🦋</div>
          <div style="font-size:22px;font-weight:700;color:white;letter-spacing:-0.5px;">Mixte-Meet</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:4px;">L'amour n'a pas de frontières</div>
        </td>
      </tr>

      <!-- Contenu -->
      <tr>
        <td style="padding:32px 32px 24px;">
          ${content}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);">
            © 2026 Mixte-Meet · L'amour sans frontières 🌍<br>
            <a href="https://mixte-meet-webapp.onrender.com" style="color:#E8317A;text-decoration:none;">mixte-meet-webapp.onrender.com</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Styles réutilisables ────────────────────────────────
const BTN = (text, url) => `
  <div style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#E8317A,#C41F65);color:white;text-decoration:none;padding:14px 32px;border-radius:50px;font-weight:700;font-size:15px;box-shadow:0 8px 24px rgba(232,49,122,0.35);">${text}</a>
  </div>`;

const H1 = (text) => `<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:white;">${text}</h1>`;
const P  = (text) => `<p style="margin:0 0 14px;font-size:15px;color:rgba(255,255,255,0.75);line-height:1.6;">${text}</p>`;

// ── Envoi générique ─────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  try {
    await transporter.sendMail({
      from: `"Mixte-Meet 🦋" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`✅ Email envoyé à ${to} — ${subject}`);
    return true;
  } catch (err) {
    console.error(`❌ Erreur email à ${to}:`, err.message);
    return false;
  }
}

// ══════════════════════════════════════════════════════════
//  EMAILS TRANSACTIONNELS
// ══════════════════════════════════════════════════════════

// 1. Bienvenue après inscription
async function sendWelcome({ to, firstName }) {
  const html = baseTemplate(`
    ${H1(`Bienvenue ${firstName} ! 🦋`)}
    ${P('Nous sommes ravis de t\'accueillir sur Mixte-Meet, la plateforme qui connecte les cœurs africains avec le reste du monde.')}
    ${P('Ton profil est créé. Complète-le pour augmenter tes chances de trouver l\'âme sœur !')}
    <div style="background:rgba(232,49,122,0.08);border:1px solid rgba(232,49,122,0.2);border-radius:12px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:white;">Pour bien démarrer :</p>
      <p style="margin:0 0 8px;font-size:14px;color:rgba(255,255,255,0.7);">📸 Ajoute une photo de profil</p>
      <p style="margin:0 0 8px;font-size:14px;color:rgba(255,255,255,0.7);">✍️ Complète ta bio</p>
      <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.7);">💞 Commence à swiper !</p>
    </div>
    ${BTN('Accéder à mon profil', 'https://mixte-meet-webapp.onrender.com')}
    ${P('L\'amour mérite une chance. 🌍❤️')}
  `);
  return sendEmail({ to, subject: `Bienvenue sur Mixte-Meet, ${firstName} ! 🦋`, html });
}

// 2. Nouveau match
async function sendNewMatch({ to, firstName, matchName, matchEmoji }) {
  const html = baseTemplate(`
    ${H1(`C\'est un match, ${firstName} ! 💞`)}
    ${P(`Bonne nouvelle ! <strong style="color:white;">${matchEmoji} ${matchName}</strong> et toi vous vous êtes likés mutuellement.`)}
    ${P('Vous pouvez maintenant vous envoyer des messages et vous connaître davantage.')}
    <div style="background:rgba(232,49,122,0.08);border:1px solid rgba(232,49,122,0.25);border-radius:50px;padding:16px 24px;margin:20px 0;text-align:center;">
      <span style="font-size:32px;">🦋</span>
      <span style="font-size:28px;margin:0 12px;">💞</span>
      <span style="font-size:32px;">🦋</span>
      <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.6);">Vous êtes maintenant connectés !</p>
    </div>
    ${BTN('Envoyer un message', 'https://mixte-meet-webapp.onrender.com')}
    ${P('Ne laisse pas passer cette chance — dis bonjour maintenant ! 😊')}
  `);
  return sendEmail({ to, subject: `💞 Match avec ${matchName} sur Mixte-Meet !`, html });
}

// 3. Nouveau message reçu
async function sendNewMessage({ to, firstName, senderName, senderEmoji, preview }) {
  const html = baseTemplate(`
    ${H1(`Nouveau message, ${firstName} ! 💬`)}
    ${P(`<strong style="color:white;">${senderEmoji} ${senderName}</strong> t\'a envoyé un message :`)}
    <div style="background:rgba(255,255,255,0.04);border-left:3px solid #E8317A;border-radius:0 8px 8px 0;padding:14px 18px;margin:16px 0;font-size:14px;color:rgba(255,255,255,0.65);font-style:italic;">
      "${preview}..."
    </div>
    ${BTN('Répondre maintenant', 'https://mixte-meet-webapp.onrender.com')}
    ${P('Ne laisse pas ce message sans réponse ! 🌍')}
  `);
  return sendEmail({ to, subject: `💬 ${senderName} vous a écrit sur Mixte-Meet`, html });
}

// 4. Confirmation Premium
async function sendPremiumActivated({ to, firstName, planName, expiresAt }) {
  const html = baseTemplate(`
    ${H1(`Premium activé, ${firstName} ! ⭐`)}
    ${P(`Félicitations ! Ton abonnement <strong style="color:#E8317A;">${planName}</strong> est maintenant actif.`)}
    <div style="background:linear-gradient(135deg,rgba(232,49,122,0.15),rgba(196,31,101,0.08));border:1px solid rgba(232,49,122,0.3);border-radius:12px;padding:20px;margin:20px 0;">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:white;">Tu as maintenant accès à :</p>
      <p style="margin:0 0 8px;font-size:14px;color:rgba(255,255,255,0.75);">✓ Super Likes illimités</p>
      <p style="margin:0 0 8px;font-size:14px;color:rgba(255,255,255,0.75);">✓ Appels vidéo HD</p>
      <p style="margin:0 0 8px;font-size:14px;color:rgba(255,255,255,0.75);">✓ Traduction automatique</p>
      <p style="margin:0 0 8px;font-size:14px;color:rgba(255,255,255,0.75);">✓ Mode Incognito</p>
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.4);margin-top:12px;">Expire le : ${expiresAt}</p>
    </div>
    ${BTN('Profiter de mon Premium', 'https://mixte-meet-webapp.onrender.com')}
  `);
  return sendEmail({ to, subject: `⭐ Premium activé sur Mixte-Meet !`, html });
}

// 5. Premium expire bientôt
async function sendPremiumExpiring({ to, firstName, daysLeft, planName }) {
  const html = baseTemplate(`
    ${H1(`Ton Premium expire dans ${daysLeft} jours ⏰`)}
    ${P(`Bonjour ${firstName}, ton abonnement <strong style="color:#E8317A;">${planName}</strong> arrive bientôt à expiration.`)}
    ${P('Renouvelle maintenant pour ne pas perdre l\'accès à toutes tes fonctionnalités Premium.')}
    <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:16px;margin:16px 0;text-align:center;">
      <p style="margin:0;font-size:36px;">⏰</p>
      <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,0.65);">Plus que <strong style="color:#F59E0B;">${daysLeft} jours</strong> de Premium</p>
    </div>
    ${BTN('Renouveler mon abonnement', 'https://mixte-meet-webapp.onrender.com')}
  `);
  return sendEmail({ to, subject: `⏰ Ton Premium Mixte-Meet expire dans ${daysLeft} jours`, html });
}

// 6. Reset mot de passe
async function sendPasswordReset({ to, firstName, resetToken }) {
  const resetUrl = `https://mixte-meet-webapp.onrender.com/reset-password.html?token=${resetToken}`;
  const html = baseTemplate(`
    ${H1(`Réinitialisation de mot de passe 🔐`)}
    ${P(`Bonjour ${firstName}, tu as demandé à réinitialiser ton mot de passe Mixte-Meet.`)}
    ${P('Clique sur le bouton ci-dessous pour créer un nouveau mot de passe. Ce lien expire dans <strong style="color:white;">1 heure</strong>.')}
    ${BTN('Réinitialiser mon mot de passe', resetUrl)}
    ${P('Si tu n\'as pas demandé cette réinitialisation, ignore cet email. Ton compte est en sécurité.')}
    <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:12px;margin-top:16px;">
      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);">Lien valable 1 heure · Ne partage jamais ce lien</p>
    </div>
  `);
  return sendEmail({ to, subject: `🔐 Réinitialisation de mot de passe Mixte-Meet`, html });
}

module.exports = {
  sendWelcome,
  sendNewMatch,
  sendNewMessage,
  sendPremiumActivated,
  sendPremiumExpiring,
  sendPasswordReset,
};


