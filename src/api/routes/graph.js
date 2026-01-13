const express = require('express');
const router = express.Router();
const graphController = require('../controllers/graphController');

// Influence and author discovery
router.get('/influence/:campaignId', graphController.getInfluence);

// Topic network
router.get('/topics/:campaignId', graphController.getTopics);

// Post similarity
router.get('/similar/:postId', graphController.getSimilar);

// Communities
router.get('/communities/:campaignId', graphController.getCommunities);

// Pathfinding
router.get('/path/:startId/:endId', graphController.getPath);
router.get('/suggest/:campaignId', graphController.getSuggestedPath);

module.exports = router;
