const couchbaseClient = require('./couchbaseClient');
const logger = require('../../utils/logger');

class PostDeduplicator {
  /**
   * Check if a post already exists and return it
   * @param {string} platformUrl - Unique URL of the post
   * @param {string} collection - Collection name
   * @returns {Promise<Object|null>} Existing post or null
   */
  async findExistingPost(platformUrl, collection) {
    try {
      const query = `
        SELECT META().id as docId, p.*
        FROM SMLE._default.${collection} p
        WHERE p.platform_url = $platformUrl
        LIMIT 1
      `;
      
      const results = await couchbaseClient.query(query, {
        parameters: { platformUrl }
      });
      
      if (results.length > 0) {
        return {
          docId: results[0].docId,
          post: results[0].p || results[0]
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to check for existing post', { 
        platformUrl, 
        error: error.message 
      });
      return null;
    }
  }
  
  /**
   * Update existing post with new engagement data
   * @param {string} docId - Document ID
   * @param {Object} existingPost - Existing post document
   * @param {Object} newRawData - New scraped data
   * @param {number} runNumber - Current run number
   * @param {string} runId - Current run ID
   * @param {string} collection - Collection name
   */
  async updateExistingPost(docId, existingPost, newRawData, runNumber, runId, collection) {
    try {
      const now = new Date().toISOString();
      
      // Initialize tracking fields if they don't exist
      if (!existingPost.first_seen_run) {
        existingPost.first_seen_run = existingPost.run_id ? 1 : runNumber;
      }
      
      existingPost.last_seen_run = runNumber;
      existingPost.total_appearances = (existingPost.total_appearances || 1) + 1;
      existingPost.updated_at = now;
      
      // Add to engagement history
      if (!existingPost.engagement_history) {
        existingPost.engagement_history = [];
      }
      
      const newEngagement = newRawData.engagement || {};
      existingPost.engagement_history.push({
        run_number: runNumber,
        run_id: runId,
        date: now,
        likes: newEngagement.likes || newEngagement.upvotes || 0,
        comments: newEngagement.num_comments || newEngagement.comments || 0,
        shares: newEngagement.shares || newEngagement.reposts || 0,
        views: newEngagement.views || newEngagement.play_count || 0
      });
      
      // Update current engagement to latest
      existingPost.raw_data.engagement = newEngagement;
      
      // Keep latest scraped data
      existingPost.scraped_at = newRawData.timestamp || now;
      
      // Update the document
      await couchbaseClient.upsert(collection, docId, existingPost);
      
      logger.debug('Post updated with new engagement data', { 
        docId, 
        runNumber,
        appearances: existingPost.total_appearances 
      });
      
      return { updated: true, docId };
      
    } catch (error) {
      logger.error('Failed to update existing post', { 
        docId, 
        error: error.message 
      });
      throw error;
    }
  }
  
  /**
   * Create new post document with tracking fields
   */
  createNewPost(postId, rawPost, platform, campaignId, runId, runNumber, timestamp) {
    const baseDocument = {
      id: postId,
      campaign_id: campaignId,
      run_id: runId,
      platform: platform,
      platform_url: rawPost.url,
      post_id: rawPost.post_id || rawPost.id,
      created_at: timestamp,
      scraped_at: rawPost.timestamp || timestamp,
      analysis_status: 'pending',
      
      // Deduplication tracking
      first_seen_run: runNumber,
      last_seen_run: runNumber,
      total_appearances: 1,
      engagement_history: [],
      
      analysis: {
        sentiment_score: null,
        sentiment_label: null,
        key_topics: [],
        brand_mentioned: null,
        summary: null,
        language: null,
        embedding: null,
        analyzed_at: null,
        llm_model: null,
        error: null
      }
    };
    
    return baseDocument;
  }
}

module.exports = new PostDeduplicator();

