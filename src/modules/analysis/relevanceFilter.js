const axios = require('axios');
const logger = require('../../utils/logger');

class RelevanceFilter {
  constructor() {
    this.endpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434';
    this.model = process.env.LLM_MODEL || 'llama3.2:1b';
  }
  
  /**
   * Check if a post is relevant to the search query
   * @param {Object} post - Post data
   * @param {string} searchQuery - Original search query
   * @param {number} threshold - Relevance threshold (0-1)
   * @returns {Promise<Object>} { isRelevant: boolean, score: number, reason: string }
   */
  async checkRelevance(post, searchQuery, threshold = 0.7) {
    try {
      const content = this.extractContent(post);
      
      if (!content || content.length < 10) {
        logger.warn('Post has insufficient content for relevance check', { 
          postId: post.id || 'unknown' 
        });
        return { isRelevant: true, score: 1.0, reason: 'Insufficient content to filter' };
      }
      
      const prompt = this.buildRelevancePrompt(content, searchQuery);
      const response = await this.callOllama(prompt);
      const result = this.parseRelevanceResponse(response, threshold);
      
      logger.debug('Relevance check completed', {
        searchQuery,
        isRelevant: result.isRelevant,
        score: result.score
      });
      
      return result;
      
    } catch (error) {
      logger.error('Relevance check failed', { error: error.message });
      // On error, assume relevant (don't filter out)
      return { isRelevant: true, score: 1.0, reason: 'Error during check' };
    }
  }
  
  /**
   * Extract content from post based on platform
   */
  extractContent(post) {
    const platform = post.platform;
    const rawData = post.raw_data || post;
    
    switch (platform) {
      case 'instagram':
      case 'tiktok':
        return rawData.description || '';
      case 'twitter':
        return rawData.description || '';
      case 'reddit':
        return `${rawData.title || ''} ${rawData.description || ''}`.trim();
      case 'facebook':
        return rawData.content || '';
      case 'youtube':
        return `${rawData.title || ''} ${rawData.description || ''}`.substring(0, 500);
      default:
        return '';
    }
  }
  
  /**
   * Build relevance checking prompt
   */
  buildRelevancePrompt(content, searchQuery) {
    return `You are a content relevance checker. Determine if the following post is relevant to the search query.

SEARCH QUERY: "${searchQuery}"

POST CONTENT:
${content.substring(0, 500)}

TASK:
Rate the relevance from 0 (completely unrelated) to 1 (perfectly relevant).

Consider:
- Does the post actually discuss the search topic?
- Is it just mentioning keywords without context?
- Is it spam, promotional, or off-topic?

RESPONSE FORMAT (JSON only):
{"relevance_score": <0.0-1.0>, "is_relevant": <true|false>, "reason": "<brief explanation>"}

Example responses:
- Search "AI technology", Post about "New AI breakthrough in healthcare" → {"relevance_score": 0.9, "is_relevant": true, "reason": "Directly discusses AI technology"}
- Search "AI technology", Post about "I love my AI girlfriend" → {"relevance_score": 0.3, "is_relevant": false, "reason": "Mentions AI but not about technology"}

Respond with ONLY valid JSON:`;
  }
  
  /**
   * Call Ollama API
   */
  async callOllama(prompt) {
    const url = `${this.endpoint}/api/generate`;
    
    const payload = {
      model: this.model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: 200
      }
    };
    
    const response = await axios.post(url, payload, {
      timeout: 30000
    });
    
    return response.data.response;
  }
  
  /**
   * Parse relevance response
   */
  parseRelevanceResponse(response, threshold) {
    try {
      let cleaned = response.trim();
      cleaned = cleaned.replace(/```json\n?/g, '');
      cleaned = cleaned.replace(/```\n?/g, '');
      cleaned = cleaned.trim();
      
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }
      
      const parsed = JSON.parse(cleaned);
      
      const score = Math.max(0, Math.min(1, parseFloat(parsed.relevance_score) || 0));
      
      return {
        isRelevant: score >= threshold,
        score: score,
        reason: parsed.reason || 'No reason provided'
      };
      
    } catch (error) {
      logger.error('Failed to parse relevance response', { 
        response: response.substring(0, 200),
        error: error.message 
      });
      
      // Fallback: check for keywords in response
      const lower = response.toLowerCase();
      if (lower.includes('relevant') && !lower.includes('not relevant')) {
        return { isRelevant: true, score: 0.8, reason: 'Fallback: seems relevant' };
      }
      
      return { isRelevant: true, score: 0.5, reason: 'Fallback: uncertain' };
    }
  }
}

module.exports = new RelevanceFilter();

