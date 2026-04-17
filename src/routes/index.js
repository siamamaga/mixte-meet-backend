// src/routes/index.js
const router = require('express').Router();
const { body } = require('express-validator');
const { authMiddleware, adminOnly, premiumOnly } = require('../middlewares/auth');
const multer = require('multer');

// Controllers
const authCtrl  = require('../controllers/auth.controller');
const userCtrl  = require('../controllers/user.controller');
const matchCtrl = require('../controllers/match.controller');
const msgCtrl   = require('../controllers/message.controller');
const adminCtrl = require('../controllers/admin.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ════════════════════════════════════════════════
// 🔐 AUTH
// ════════════════════════════════════════════════
const authValidators = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
];
const registerValidators = [
  ...authValidators,
  body('first_name').trim().notEmpty().isLength({ max: 80 }),
  body('birthdate').isDate(),
  body('gender').isIn(['man','woman','non_binary','other']),
  body('country_code').isLength({ min: 2, max: 2 }),
];

router.post('/auth/register',         registerValidators, authCtrl.register);
router.post('/auth/login',            authValidators,     authCtrl.login);
router.post('/auth/refresh',                              authCtrl.refresh);
router.post('/auth/logout',           authMiddleware,     authCtrl.logout);
router.put ('/auth/change-password',  authMiddleware,     authCtrl.changePassword);
router.post('/auth/forgot-password',                      authCtrl.forgotPassword);
router.post('/auth/reset-password',                       authCtrl.resetPassword);

// ════════════════════════════════════════════════
// 👤 PROFIL
// ════════════════════════════════════════════════
router.get ('/me',                   authMiddleware, userCtrl.getMyProfile);
router.get ('/me/stats',              authMiddleware, userCtrl.getStats);
router.put ('/me',                   authMiddleware, userCtrl.updateProfile);
router.get ('/users/:uuid',          authMiddleware, userCtrl.getProfile);

// Photos
router.get   ('/me/photos',          authMiddleware,                        userCtrl.getPhotos);
router.post  ('/me/photos',          authMiddleware, upload.single('photo'), userCtrl.uploadPhoto);
router.put   ('/me/photos/:id/main', authMiddleware,                        userCtrl.setMainPhoto);
router.delete('/me/photos/:id',      authMiddleware,                        userCtrl.deletePhoto);

// ════════════════════════════════════════════════
// 💘 MATCHING
// ════════════════════════════════════════════════
router.get   ('/feed',           authMiddleware,              matchCtrl.getFeed);
router.get ('/search', authMiddleware, matchCtrl.getSearch);
router.post  ('/swipe',          authMiddleware,              matchCtrl.swipe);
router.post  ('/undo',           authMiddleware, premiumOnly, matchCtrl.undoLastSwipe);
router.get   ('/matches',        authMiddleware,              matchCtrl.getMatches);
router.delete('/matches/:id',    authMiddleware,              matchCtrl.unmatch);

// ════════════════════════════════════════════════
// 💬 MESSAGERIE
// ════════════════════════════════════════════════
router.post  ('/conversations/find-or-create', authMiddleware, msgCtrl.findOrCreate);
router.get   ('/conversations/:id/messages', authMiddleware, msgCtrl.getMessages);
router.post  ('/conversations/:id/messages', authMiddleware, msgCtrl.sendMessage);
router.delete('/messages/:id',               authMiddleware, msgCtrl.deleteMessage);
router.put   ('/conversations/:id/read',     authMiddleware, msgCtrl.markAsRead);
router.post  ('/messages/:id/react',         authMiddleware, msgCtrl.addReaction);

// ════════════════════════════════════════════════
// 🛡️ SIGNALEMENT / BLOCAGE
// ════════════════════════════════════════════════
router.get   ('/me/blocked',   authMiddleware, userCtrl.getBlocked);
router.post  ('/me/verify',    authMiddleware, upload.single('selfie'), userCtrl.submitVerification);
router.get   ('/me/verify',    authMiddleware, userCtrl.getVerificationStatus);
router.post  ('/report',       authMiddleware, userCtrl.report);
router.post  ('/block',        authMiddleware, userCtrl.block);
router.delete('/block/:uuid',  authMiddleware, userCtrl.unblock);

// ════════════════════════════════════════════════
// ⚙️ ADMIN — Routes existantes
// ════════════════════════════════════════════════
router.get('/admin/dashboard',      authMiddleware, adminOnly, adminCtrl.getDashboard);
router.get('/admin/users',          authMiddleware, adminOnly, adminCtrl.getUsers);
router.put('/admin/users/:id/ban',  authMiddleware, adminOnly, adminCtrl.banUser);
router.get('/admin/reports',        authMiddleware, adminOnly, adminCtrl.getReports);
router.put('/admin/reports/:id',    authMiddleware, adminOnly, adminCtrl.handleReport);
router.get('/admin/photos/pending', authMiddleware, adminOnly, adminCtrl.getPendingPhotos);
router.put('/admin/photos/:id',     authMiddleware, adminOnly, adminCtrl.moderatePhoto);

// ════════════════════════════════════════════════
// ⚙️ ADMIN — Nouvelles routes
// ════════════════════════════════════════════════

// Membres
router.get('/admin/users/:id',          authMiddleware, adminOnly, adminCtrl.getUserById);
router.get('/admin/users/:id/photos',   authMiddleware, adminOnly, adminCtrl.getUserPhotos);
router.put('/admin/users/:id/premium',  authMiddleware, adminOnly, adminCtrl.grantPremium);
router.put('/admin/users/:id/unban',    authMiddleware, adminOnly, adminCtrl.unbanUser);
router.delete('/admin/users/:id',       authMiddleware, adminOnly, adminCtrl.deleteUser);

// Revenus & paiements
router.get('/admin/payments',           authMiddleware, adminOnly, adminCtrl.getPayments);
router.get('/admin/subscriptions',      authMiddleware, adminOnly, adminCtrl.getSubscriptions);

// Promotions
router.get   ('/admin/promotions',      authMiddleware, adminOnly, adminCtrl.getPromotions);
router.post  ('/admin/promotions',      authMiddleware, adminOnly, adminCtrl.createPromotion);
router.put   ('/admin/promotions/:id',  authMiddleware, adminOnly, adminCtrl.updatePromotion);
router.delete('/admin/promotions/:id',  authMiddleware, adminOnly, adminCtrl.deletePromotion);

// Commerciaux / Affiliés
router.get   ('/admin/affiliates',              authMiddleware, adminOnly, adminCtrl.getAffiliates);
router.post  ('/admin/affiliates',              authMiddleware, adminOnly, adminCtrl.createAffiliate);
router.put   ('/admin/affiliates/:id',          authMiddleware, adminOnly, adminCtrl.updateAffiliate);
router.get   ('/admin/affiliate-transactions',  authMiddleware, adminOnly, adminCtrl.getAffiliateTransactions);
router.put   ('/admin/affiliate-transactions/:id/pay', authMiddleware, adminOnly, adminCtrl.payCommission);

// Profils démo
router.get   ('/admin/demo-profiles',     authMiddleware, adminOnly, adminCtrl.getDemoProfiles);
router.post  ('/admin/demo-profiles',     authMiddleware, adminOnly, adminCtrl.createDemoProfile);
router.put   ('/admin/demo-profiles/:id', authMiddleware, adminOnly, adminCtrl.updateDemoProfile);
router.delete('/admin/demo-profiles/:id', authMiddleware, adminOnly, adminCtrl.deleteDemoProfile);

// Console SQL sécurisée
router.post('/admin/sql',               authMiddleware, adminOnly, adminCtrl.executeSQL);

// Broadcast
router.post('/admin/broadcast',         authMiddleware, adminOnly, adminCtrl.sendBroadcast);

// Stats
router.get('/admin/stats/registrations', authMiddleware, adminOnly, adminCtrl.getRegistrationStats);
router.get('/admin/stats/countries',     authMiddleware, adminOnly, adminCtrl.getCountryStats);
router.get('/admin/verifications',      authMiddleware, adminOnly, adminCtrl.getVerifications);
router.put('/admin/verifications/:id',  authMiddleware, adminOnly, adminCtrl.handleVerification);

// ════════════════════════════════════════════════
// 💓 HEALTH CHECK
// ════════════════════════════════════════════════
router.get('/ping', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const jwt = require('jsonwebtoken');
      const pool = require('../config/database');
      const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
      await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [decoded.id]);
    }
  } catch(e) {}
  res.send('ok');
});
router.delete('/swipes/reset', authMiddleware, async (req, res) => {
  try {
    const pool = require('../config/database');
    await pool.query('DELETE FROM swipes WHERE swiper_id = ?', [req.user.id]);
    res.json({ success: true, message: 'Swipes reinitialises' });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});
router.get('/notifications/unread', require('../middlewares/auth').authMiddleware, async (req, res) => {
  try {
    const pool = require('../config/database');
    const userId = req.user.id;
    const [[msgs]] = await pool.query(
      'SELECT COUNT(*) as new_messages FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN matches mt ON mt.id = c.match_id WHERE (mt.user1_id = ? OR mt.user2_id = ?) AND m.sender_id != ? AND m.is_read = 0',
      [userId, userId, userId]
    );
    const [[matchs]] = await pool.query(
      'SELECT COUNT(*) as new_matches FROM matches WHERE (user1_id = ? OR user2_id = ?) AND matched_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)',
      [userId, userId]
    );
    res.json({ success: true, data: { new_messages: msgs.new_messages, new_matches: matchs.new_matches } });
  } catch(e) { res.json({ success: true, data: { new_messages: 0, new_matches: 0 } }); }
});
router.get('/health', (req, res) => res.json({
  status: 'ok', app: 'Mixte-Meet API', version: '1.0.0'
}));

module.exports = router;

















