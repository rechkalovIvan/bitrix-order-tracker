const config = require('../config/env');

function validateWebhookToken(token) {
  return token === config.bitrix.webhookToken;
}

function authenticateWebhook(req, res, next) {
  const providedToken = req.headers['x-webhook-token'] || req.query.token;
  
  if (!providedToken || !validateWebhookToken(providedToken)) {
    console.log('Unauthorized webhook access attempt from IP:', req.ip);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

module.exports = {
  authenticateWebhook,
  validateWebhookToken
};