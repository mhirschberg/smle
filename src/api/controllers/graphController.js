const graphRepository = require('../../modules/repositories/graphRepository');
const logger = require('../../utils/logger');

class GraphController {
    /**
     * Get influence discovery data (Authors and their reach)
     */
    async getInfluence(req, res) {
        const { campaignId } = req.params;
        try {
            const data = await graphRepository.getInfluenceMap(campaignId);
            res.json(data);
        } catch (error) {
            logger.error('Failed to get influence map', { campaignId, error: error.message });
            res.status(500).json({ error: 'Failed to fetch graph data' });
        }
    }

    /**
     * Get topic co-occurrence network
     */
    async getTopics(req, res) {
        const { campaignId } = req.params;
        try {
            const data = await graphRepository.getTopicMap(campaignId);
            res.json(data);
        } catch (error) {
            logger.error('Failed to get topic map', { campaignId, error: error.message });
            res.status(500).json({ error: 'Failed to fetch topic network' });
        }
    }

    /**
     * Get post similarity cluster
     */
    async getSimilar(req, res) {
        const { postId } = req.params;
        try {
            const data = await graphRepository.findSimilarPosts(postId);
            res.json(data);
        } catch (error) {
            logger.error('Failed to get similar posts', { postId, error: error.message });
            res.status(500).json({ error: 'Failed to fetch similarity data' });
        }
    }

    /**
     * Get community clusters
     */
    async getCommunities(req, res) {
        const { campaignId } = req.params;
        try {
            const data = await graphRepository.getCommunities(campaignId);
            res.json(data);
        } catch (error) {
            logger.error('Failed to get communities', { campaignId, error: error.message });
            res.status(500).json({ error: 'Failed to fetch community data' });
        }
    }

    /**
     * Find path between two nodes
     */
    async getPath(req, res) {
        const { startId, endId } = req.params;
        try {
            const data = await graphRepository.getPathBetween(startId, endId);
            res.json(data);
        } catch (error) {
            logger.error('Failed to find path', { startId, endId, error: error.message });
            res.status(500).json({ error: 'Failed to fetch path data' });
        }
    }

    /**
     * Get a suggested path pair
     */
    async getSuggestedPath(req, res) {
        const { campaignId } = req.params;
        try {
            const data = await graphRepository.getSuggestedPath(campaignId);
            res.json(data || {});
        } catch (error) {
            logger.error('Failed to get suggested path', { campaignId, error: error.message });
            res.status(500).json({ error: 'Failed to fetch suggestion' });
        }
    }
}

module.exports = new GraphController();
