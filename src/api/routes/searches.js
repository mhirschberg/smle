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
  const couchbaseClient = require('../../modules/storage/couchbaseClient');
  try {
    await couchbaseClient.connect();
    const post = await couchbaseClient.get('instagram_posts', req.params.postId);
    res.json({ post });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await couchbaseClient.disconnect();
  }
});

module.exports = router;

