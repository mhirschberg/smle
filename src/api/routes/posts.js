const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { authenticateToken } = require('../middleware/auth');

// All post routes are protected
router.use(authenticateToken);

/**
 * @route POST /api/posts/analyze-video-batch
 * @desc Start batch video analysis with smle vision
 */
router.post('/analyze-video-batch', (req, res) => postController.analyzeVideoBatch(req, res));

module.exports = router;
