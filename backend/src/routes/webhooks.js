const express = require('express');
const webhookController = require('../controllers/webhookController');
const { authenticateWebhook } = require('../middleware/auth');

const router = express.Router();

// POST /api/webhooks/update - обновление приложения
router.post('/update', authenticateWebhook, webhookController.updateApp);

module.exports = router;