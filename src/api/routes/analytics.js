const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

// Get analytics for a search
router.get('/search/:searchId', (req, res) => analyticsController.getAnalytics(req, res));

// Get all analytics
router.get('/', (req, res) => analyticsController.getAllAnalytics(req, res));

module.exports = router;

