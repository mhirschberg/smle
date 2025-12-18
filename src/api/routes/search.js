const express = require('express');
const router = express.Router();
const semanticSearch = require('../../modules/search/semanticSearch');
const queryParser = require('../../modules/search/queryParser');
const logger = require('../../utils/logger');

/**
 * Natural language search endpoint
 */
router.post('/:campaignId/nl-search', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { query, limit = 50 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    logger.info('Natural language search request', { campaignId, query });
    
    // Parse the natural language query
    const parsedQuery = await queryParser.parseQuery(query);
    
    logger.info('Parsed query', { parsedQuery });
    
    // Perform semantic search
    const results = await semanticSearch.searchPosts(campaignId, query, {
      limit: parseInt(limit),
      minSimilarity: 0.3,  // Lower threshold for more results
      platforms: parsedQuery.platforms.includes('all') ? null : parsedQuery.platforms,
      sentiment: parsedQuery.sentiment === 'all' ? null : parsedQuery.sentiment
    });
    
    logger.info('Search completed, returning results', {
      query,
      resultsCount: results.length,
      topScore: results[0]?.similarity_score
    });
    
    res.json({
      success: true,
      query: query,
      parsed: parsedQuery,
      results: results,
      count: results.length
    });
    
  } catch (error) {
    logger.error('Natural language search failed', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

