const dbFactory = require('../storage/dbFactory');
const embeddingGenerator = require('../analysis/embeddingGenerator');
const campaignRepository = require('../repositories/campaignRepository');
const logger = require('../../utils/logger');

class SemanticSearch {
  /**
   * Search posts by semantic similarity
   * @param {string} campaignId - Campaign ID
   * @param {string} query - Natural language query
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Array of matching posts with similarity scores
   */
  async searchPosts(campaignId, query, options = {}) {
    try {
      const {
        limit = 20,
        minSimilarity = 0.3,  // LOWERED from 0.5 to 0.3 (more permissive)
        platforms = null,
        sentiment = null
      } = options;

      logger.info('Starting semantic search', { campaignId, query, options });

      // Step 1: Generate embedding for the query
      const queryEmbedding = await this.generateQueryEmbedding(query);

      if (!queryEmbedding) {
        throw new Error('Failed to generate query embedding');
      }

      // Step 2: Get campaign to determine platforms
      // Use Repository instead of direct DB access
      const campaign = await campaignRepository.getById(campaignId);
      if (!campaign) {
        throw new Error(`Campaign not found: ${campaignId}`);
      }

      const campaignPlatforms = platforms || campaign.platforms || [campaign.platform];
      const platformManager = require('../platforms/platformManager');

      // Step 3: Search all platforms using cosine similarity
      const allResults = [];
      const db = await dbFactory.getDB();

      for (const platform of campaignPlatforms) {
        try {
          const collection = platformManager.getCollection(platform);
          const platformResults = await this.fallbackSearch(
            db,
            collection,
            campaignId,
            queryEmbedding,
            sentiment,
            limit
          );

          allResults.push(...platformResults);
        } catch (err) {
          logger.warn(`Failed to search ${platform}`, { error: err.message });
        }
      }

      logger.info('All results before filtering', {
        total: allResults.length,
        topScores: allResults.slice(0, 5).map(r => r.similarity_score)
      });

      // Step 4: Sort by similarity and apply limit
      const sortedResults = allResults
        .filter(p => p.similarity_score >= minSimilarity)
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .slice(0, limit);

      logger.info('Semantic search completed', {
        totalResults: allResults.length,
        matchingResults: sortedResults.length,
        topScore: sortedResults[0]?.similarity_score,
        minSimilarity: minSimilarity
      });

      return sortedResults;

    } catch (error) {
      logger.error('Semantic search failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Fallback to in-memory cosine similarity search
   */
  async fallbackSearch(db, collection, campaignId, queryEmbedding, sentiment, limit) {
    logger.info('Using cosine similarity search', { collection });

    const dbType = (process.env.DB_TYPE || require('../../config').db.type).toLowerCase();
    let query;
    let parameters;

    if (dbType === 'postgres' || dbType === 'cratedb') {
      let whereClause = `doc->>'campaign_id' = $1 AND doc->>'analysis_status' = 'analyzed' AND doc->'analysis'->>'embedding' IS NOT NULL`;

      if (sentiment === 'positive') {
        whereClause += " AND (doc->'analysis'->>'sentiment_score')::float >= 8";
      } else if (sentiment === 'neutral') {
        whereClause += " AND (doc->'analysis'->>'sentiment_score')::float >= 4 AND (doc->'analysis'->>'sentiment_score')::float < 8";
      } else if (sentiment === 'negative') {
        whereClause += " AND (doc->'analysis'->>'sentiment_score')::float < 4";
      }

      query = `
        SELECT id, doc
        FROM ${collection}
        WHERE ${whereClause}
        LIMIT 500
      `;
      parameters = [campaignId];
    } else {
      // Couchbase N1QL
      let whereClause = `p.campaign_id = $campaignId AND p.analysis_status = 'analyzed' AND p.analysis.embedding IS NOT MISSING AND p.analysis.embedding IS NOT NULL`;

      if (sentiment === 'positive') {
        whereClause += ' AND p.analysis.sentiment_score >= 8';
      } else if (sentiment === 'neutral') {
        whereClause += ' AND p.analysis.sentiment_score >= 4 AND p.analysis.sentiment_score < 8';
      } else if (sentiment === 'negative') {
        whereClause += ' AND p.analysis.sentiment_score < 4';
      }

      query = `
        SELECT META().id as id, p.*
        FROM SMLE._default.${collection} p
        WHERE ${whereClause}
        LIMIT 500
      `;
      parameters = { campaignId };
    }

    const results = await db.query(query, {
      parameters: parameters
    });

    const posts = results.map(r => {
      if (dbType === 'postgres' || dbType === 'cratedb') {
        return { id: r.id, ...r.doc };
      }
      return { id: r.id, ...(r.p || r) };
    });

    logger.info(`Found ${posts.length} posts with embeddings in ${collection}`);

    if (posts.length === 0) {
      return [];
    }

    // Calculate similarity scores
    const postsWithScores = posts.map(post => {
      const similarity = this.cosineSimilarity(queryEmbedding, post.analysis.embedding);
      return {
        ...post,
        similarity_score: similarity
      };
    });

    // Log score distribution
    const scores = postsWithScores.map(p => p.similarity_score).sort((a, b) => b - a);
    logger.info(`${collection} similarity scores`, {
      highest: scores[0]?.toFixed(3),
      median: scores[Math.floor(scores.length / 2)]?.toFixed(3),
      lowest: scores[scores.length - 1]?.toFixed(3),
      count: scores.length
    });

    return postsWithScores
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, limit);
  }

  /**
   * Generate embedding for search query
   */
  async generateQueryEmbedding(query) {
    try {
      const axios = require('axios');
      const endpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434';
      const model = process.env.EMBEDDING_MODEL || 'nomic-embed-text';

      logger.info('Generating query embedding', { query, model });

      const response = await axios.post(`${endpoint}/api/embeddings`, {
        model: model,
        prompt: query
      }, {
        timeout: 30000
      });

      logger.info('Query embedding generated', { dimension: response.data.embedding?.length });

      return response.data.embedding;
    } catch (error) {
      logger.error('Failed to generate query embedding', { error: error.message });
      return null;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      logger.warn('Invalid vectors for similarity calculation', {
        vecALength: vecA?.length,
        vecBLength: vecB?.length
      });
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    const similarity = dotProduct / (normA * normB);

    return similarity;
  }
}

module.exports = new SemanticSearch();
