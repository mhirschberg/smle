const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');

// Get all campaigns
router.get('/', (req, res) => searchController.getAllSearches(req, res));

// Get single campaign
router.get('/:id', (req, res) => searchController.getSearchById(req, res));

// Get runs for a campaign
router.get('/:id/runs', (req, res) => searchController.getCampaignRuns(req, res));

// Get posts for a campaign
router.get('/:id/posts', (req, res) => searchController.getSearchPosts(req, res));

// Get stats for a campaign
router.get('/:id/stats', (req, res) => searchController.getSearchStats(req, res));

// Get sentiment trend for a campaign
router.get('/:id/trend', (req, res) => searchController.getSentimentTrend(req, res));

// Create new campaign
router.post('/', (req, res) => searchController.createSearch(req, res));

// Trigger manual run
router.post('/:id/run', (req, res) => searchController.triggerManualRun(req, res));

// Pause/Resume campaign
router.patch('/:id/status', (req, res) => searchController.toggleCampaignStatus(req, res));

// Delete campaign
router.delete('/:id', (req, res) => searchController.deleteCampaign(req, res));

// Delete all campaigns (admin)
router.delete('/', (req, res) => searchController.deleteAllCampaigns(req, res));

// Debug: Get single post
router.get('/debug/post/:postId', async (req, res) => {
  const postRepository = require('../../modules/repositories/postRepository');
  const platformManager = require('../../modules/platforms/platformManager');

  try {
    const { postId } = req.params;
    const platforms = platformManager.getSupportedPlatforms();

    // Attempt to find the post in any of the platform collections
    // In a real debug scenario, you might want to know the platform, but for a general "get by ID" search:
    let foundPost = null;

    for (const platform of platforms) {
      const db = await postRepository.getDB();
      const collection = platformManager.getCollection(platform);
      foundPost = await db.get(collection, postId);
      if (foundPost) break;
    }

    if (!foundPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ post: foundPost });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

