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

// ════════════════════════════════════════════════
// 👤 PROFIL
// ════════════════════════════════════════════════
router.get ('/me',                  authMiddleware, userCtrl.getMyProfile);
router.put ('/me',                  authMiddleware, userCtrl.updateProfile);
router.get ('/users/:uuid',         authMiddleware, userCtrl.getProfile);

// Photos
router.get   ('/me/photos',         authMiddleware,                      userCtrl.getPhotos);
router.post  ('/me/photos',         authMiddleware, upload.single('photo'), userCtrl.uploadPhoto);
router.put   ('/me/photos/:id/main',authMiddleware,                      userCtrl.setMainPhoto);
router.delete('/me/photos/:id',     authMiddleware,                      userCtrl.deletePhoto);

// ════════════════════════════════════════════════
// 💘 MATCHING
// ════════════════════════════════════════════════
router.get('/feed',             authMiddleware, matchCtrl.getFeed);
router.post('/swipe',           authMiddleware, matchCtrl.swipe);
router.post('/undo',            authMiddleware, premiumOnly, matchCtrl.undoLastSwipe);
router.get ('/matches',         authMiddleware, matchCtrl.getMatches);
router.delete('/matches/:id',   authMiddleware, matchCtrl.unmatch);

// ════════════════════════════════════════════════
// 💬 MESSAGERIE
// ════════════════════════════════════════════════
router.get   ('/conversations/:id/messages', authMiddleware, msgCtrl.getMessages);
router.post  ('/conversations/:id/messages', authMiddleware, msgCtrl.sendMessage);
router.delete('/messages/:id',               authMiddleware, msgCtrl.deleteMessage);
router.post  ('/messages/:id/react',         authMiddleware, msgCtrl.addReaction);

// ════════════════════════════════════════════════
// 🛡️ SIGNALEMENT / BLOCAGE
// ════════════════════════════════════════════════
router.post('/report', authMiddleware, userCtrl.report);
router.post('/block',  authMiddleware, userCtrl.block);
router.delete('/block/:uuid', authMiddleware, userCtrl.unblock);

// ════════════════════════════════════════════════
// ⚙️ ADMIN
// ════════════════════════════════════════════════
router.get   ('/admin/dashboard',     authMiddleware, adminOnly, adminCtrl.getDashboard);
router.get   ('/admin/users',         authMiddleware, adminOnly, adminCtrl.getUsers);
router.put   ('/admin/users/:id/ban', authMiddleware, adminOnly, adminCtrl.banUser);
router.get   ('/admin/reports',       authMiddleware, adminOnly, adminCtrl.getReports);
router.put   ('/admin/reports/:id',   authMiddleware, adminOnly, adminCtrl.handleReport);
router.get   ('/admin/photos/pending',authMiddleware, adminOnly, adminCtrl.getPendingPhotos);
router.put   ('/admin/photos/:id',    authMiddleware, adminOnly, adminCtrl.moderatePhoto);

// Health check
router.get('/health', (req, res) => res.json({ status: 'ok', app: 'Mixte-Meet API', version: '1.0.0' }));

module.exports = router;
