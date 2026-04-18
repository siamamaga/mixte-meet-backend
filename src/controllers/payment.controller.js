// src/controllers/payment.controller.js
const paymentService = require('../services/payment.service');
const pool = require('../config/database');

exports.getPlans = (req, res) => {
  res.json({ success: true, data: paymentService.PLANS });
};

exports.createPayment = async (req, res) => {
  try {
    const { planId, phone } = req.body;
    const user = req.user;
    const [rows] = await pool.query('SELECT email, first_name FROM users WHERE id = ?', [user.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
    const result = await paymentService.createTransaction({
      userId: user.id,
      planId,
      userEmail: rows[0].email,
      userName: rows[0].first_name,
      phone,
    });
    res.json({ success: true, data: result });
  } catch(err) {
    console.error('PAYMENT ERROR:', JSON.stringify(err));
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.webhook = async (req, res) => {
  try {
    await paymentService.handleWebhook(req.body);
    res.json({ success: true });
  } catch(err) {
    console.error('Webhook error:', err);
    res.status(500).json({ success: false });
  }
};

