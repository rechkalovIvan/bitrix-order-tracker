const express = require('express');
const leadController = require('../controllers/leadController');
const { authenticateWebhook } = require('../middleware/auth');

const router = express.Router();

// GET /api/leads/:key - получить лид по ключу
router.get('/:key', leadController.getLeadByKey);

// POST /api/leads/:id/confirm - подтвердить лид
router.post('/:id/confirm', authenticateWebhook, leadController.confirmLead);

module.exports = router;