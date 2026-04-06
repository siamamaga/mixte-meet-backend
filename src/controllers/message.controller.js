// src/controllers/message.controller.js
const msgSvc = require('../services/message.service');

function handleError(res, err) {
  return res.status(err.status || 500).json({ success: false, message: err.message || 'Erreur serveur' });
}

exports.getMessages = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const messages = await msgSvc.getMessages(req.params.id, req.user.id, +page, +limit);
    res.json({ success: true, data: messages, page: +page });
  } catch (err) { handleError(res, err); }
};

exports.sendMessage = async (req, res) => {
  try {
    const msg = await msgSvc.sendMessage(req.params.id, req.user.id, req.body);
    res.status(201).json({ success: true, data: msg });
  } catch (err) { handleError(res, err); }
};

exports.deleteMessage = async (req, res) => {
  try { res.json({ success: true, ...(await msgSvc.deleteMessage(req.params.id, req.user.id)) }); }
  catch (err) { handleError(res, err); }
};

exports.addReaction = async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ success: false, message: 'emoji requis' });
    res.json({ success: true, ...(await msgSvc.addReaction(req.params.id, req.user.id, emoji)) });
  } catch (err) { handleError(res, err); }
};
