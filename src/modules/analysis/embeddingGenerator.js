const embeddingProvider = require('./embeddingProvider');
const logger = require('../../utils/logger');

class EmbeddingGenerator {
  /**
   * Generate embedding for a post
   * @param {Object} post - Post document
   * @returns {Promise<Array>} Embedding vector
   */
  async generateEmbedding(post) {
    try {
      const rawData = post.raw_data;
      
      // Combine relevant text based on platform
      let text = '';
      
      switch (post.platform) {
        case 'instagram':
        case 'tiktok':
          text = [
            rawData.description || '',
            (rawData.hashtags || []).join(' '),
            (rawData.top_comments || []).slice(0, 5).map(c => c.comment).join(' ')
          ].filter(Boolean).join(' ');
          break;
          
        case 'twitter':
          text = [
            rawData.description || '',
            (rawData.hashtags || []).join(' ')
          ].filter(Boolean).join(' ');
          break;
          
        case 'reddit':
          text = [
            rawData.title || '',
            rawData.description || ''
          ].filter(Boolean).join(' ');
          break;
          
        case 'facebook':
          text = rawData.content || '';
          break;
          
        case 'youtube':
          text = [
            rawData.title || '',
            (rawData.description || '').substring(0, 500)
          ].filter(Boolean).join(' ');
          break;
          
        case 'linkedin':
          text = [
            rawData.post_text || '',
            rawData.headline || ''
          ].filter(Boolean).join(' ');
          break;
          
        default:
          text = '';
      }
      
      // Limit text length
      text = text.substring(0, 1000).trim();
      
      if (!text) {
        logger.warn('No text to embed', { postId: post.id, platform: post.platform });
        return null;
      }
      
      // Generate embedding using configured provider
      const embedding = await embeddingProvider.generate(text);
      
      logger.debug('Embedding generated', { 
        postId: post.id,
        platform: post.platform,
        dimension: embedding?.length 
      });
      
      return embedding;
      
    } catch (error) {
      logger.error('Failed to generate embedding', { 
        postId: post.id,
        platform: post.platform,
        error: error.message 
      });
      return null;
    }
  }
}

module.exports = new EmbeddingGenerator();
