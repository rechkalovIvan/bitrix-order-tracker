const express = require('express');
const leadController = require('../controllers/leadController');

const router = express.Router();

// GET /api/leads/:key - получить лид по ключу
router.get('/:key', leadController.getLeadByKey);

// POST /api/leads/:id/confirm - подтвердить лид
router.post('/:id/confirm', leadController.confirmLead);

module.exports = router;