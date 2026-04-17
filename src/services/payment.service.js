// src/services/payment.service.js
const FedaPay = require('fedapay');

FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY);
FedaPay.setEnvironment('live');

const PLANS = {
  premium_monthly:     { amount: 2500,  currency: 'XOF', label: 'Premium Mensuel',      days: 30  },
  premium_quarterly:   { amount: 6500,  currency: 'XOF', label: 'Premium Trimestriel',  days: 90  },
  premium_yearly:      { amount: 20000, currency: 'XOF', label: 'Premium Annuel',        days: 365 },
  coins_100:           { amount: 1000,  currency: 'XOF', label: '100 Coins',             coins: 100 },
  coins_500:           { amount: 4000,  currency: 'XOF', label: '500 Coins',             coins: 500 },
  coins_1000:          { amount: 7000,  currency: 'XOF', label: '1000 Coins',            coins: 1000 },
};

async function createTransaction({ userId, planId, userEmail, userName, phone }) {
  const plan = PLANS[planId];
  if (!plan) throw { status: 400, message: 'Plan invalide' };
  const transaction = await FedaPay.Transaction.create({
    description: `Mixte-Meet - ${plan.label}`,
    amount: plan.amount,
    currency: { iso: plan.currency },
    callback_url: `${process.env.FRONTEND_URL}/payment-success.html`,
    customer: {
      email: userEmail,
      firstname: userName,
      phone_number: { number: phone || '', country: 'BJ' },
    },
    metadata: { userId, planId },
  });
  const token = await transaction.generateToken();
  return { token: token.token, url: token.url, transactionId: transaction.id };
}

async function handleWebhook(payload) {
  const pool = require('../config/database');
  const { transaction } = payload;
  if (!transaction || transaction.status !== 'approved') return;
  const meta = transaction.metadata || {};
  const { userId, planId } = meta;
  if (!userId || !planId) return;
  const plan = PLANS[planId];
  if (!plan) return;
  if (plan.days) {
    await pool.query(
      `UPDATE users SET is_premium = 1,
       premium_expires_at = DATE_ADD(IFNULL(premium_expires_at, NOW()), INTERVAL ? DAY)
       WHERE id = ?`,
      [plan.days, userId]
    );
  } else if (plan.coins) {
    await pool.query('UPDATE users SET coins = coins + ? WHERE id = ?', [plan.coins, userId]);
  }
  await pool.query(
    `INSERT INTO payments (user_id, plan_id, amount, currency, status, fedapay_id, created_at)
     VALUES (?, ?, ?, ?, 'success', ?, NOW())`,
    [userId, planId, plan.amount, plan.currency, transaction.id]
  );
}

module.exports = { createTransaction, handleWebhook, PLANS };
