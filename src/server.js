// src/server.js  — Point d'entrée Mixte-Meet Backend
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const routes          = require('./routes/index');
const { initSocket }  = require('./sockets/chat.socket');

const app    = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// ── Socket.io ─────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:  process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});
initSocket(io);

// ── Sécurité & Middlewares ────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      200,
  message:  { success: false, message: 'Trop de requêtes. Réessayez dans 15 minutes.' },
}));

// Rate limiting strict sur auth
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { success: false, message: 'Trop de tentatives de connexion.' },
}));

// ── Routes API ────────────────────────────────────────────
app.use('/api', routes);

// ── Gestion des erreurs globale ───────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route introuvable : ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error('💥 Erreur non gérée:', err);
  res.status(500).json({ success: false, message: 'Erreur serveur interne' });
});

// ── Démarrage ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('  🦋 ══════════════════════════════════════ 🦋');
  console.log('       MIXTE-MEET API — Démarrage réussi !');
  console.log(`       🌐 http://localhost:${PORT}`);
  console.log(`       🔧 Environnement : ${process.env.NODE_ENV || 'development'}`);
  console.log('  🦋 ══════════════════════════════════════ 🦋');
  console.log('');
});

module.exports = { app, server };



