const axios = require('axios');
const logger = require('../../utils/logger');

class QueryParser {
  constructor() {
    this.endpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434';
    this.model = process.env.LLM_MODEL || 'llama3.2:1b';
  }

  /**
   * Parse natural language query into structured filters
   * @param {string} query - Natural language query
   * @returns {Promise<Object>} Parsed filters
   */
  async parseQuery(query) {
    try {
      logger.info('Parsing natural language query', { query });

      // 1. Deterministic Pre-processing (Regex)
      // Small models often hallucinate examples, so we trust explicit keywords first
      const deterministic = this.extractDeterministicFilters(query);

      // 2. LLM Parsing (for intent/semantic keywords)
      const prompt = this.buildParsingPrompt(query);
      let parsed = {};
      try {
        const response = await this.callOllama(prompt);
        parsed = this.parseResponse(response);
      } catch (llmError) {
        logger.warn('LLM parsing failed, using deterministic only', { error: llmError.message });
        parsed = {
          type: 'semantic',
          keywords: formattedQuery.split(' '),
          intent: query
        };
      }

      // 3. Merge: Deterministic overrides LLM for critical filters
      const finalResult = {
        ...parsed,
        sentiment: deterministic.sentiment || parsed.sentiment || 'all',
        platforms: deterministic.platforms.length > 0 ? deterministic.platforms : (parsed.platforms || ['all']),
        content_types: deterministic.content_types.length > 0 ? deterministic.content_types : (parsed.content_types || []),
        sort_by: deterministic.sort_by || parsed.sort_by || 'relevance'
      };

      // clean up all/null
      if (!finalResult.platforms) finalResult.platforms = ['all'];
      if (!finalResult.sentiment) finalResult.sentiment = 'all';

      logger.info('Query parsed (merged)', { finalResult });

      return finalResult;

    } catch (error) {
      logger.error('Failed to parse query', { error: error.message });
      // Fallback
      return {
        type: 'semantic',
        search_query: query,
        platforms: ['all'],
        sentiment: 'all',
        content_types: [],
        filters: {}
      };
    }
  }

  extractDeterministicFilters(query) {
    const q = query.toLowerCase();
    const result = {
      sentiment: null,
      platforms: [],
      sort_by: null
    };

    // Sentiment
    if (q.includes('negative') || q.includes('bad') || q.includes('risk') || q.includes('worst')) result.sentiment = 'negative';
    else if (q.includes('positive') || q.includes('good') || q.includes('best') || q.includes('great')) result.sentiment = 'positive';
    else if (q.includes('neutral')) result.sentiment = 'neutral';

    // Platforms
    const platforms = ['instagram', 'tiktok', 'youtube', 'twitter', 'reddit', 'facebook', 'linkedin'];
    platforms.forEach(p => {
      if (q.includes(p)) result.platforms.push(p);
    });
    if (q.includes('insta ')) result.platforms.push('instagram');

    // Content Types
    result.content_types = [];
    if (q.includes('reel')) result.content_types.push('reel');
    if (q.includes('short')) result.content_types.push('video'); // YouTube shorts are videos
    if (q.includes('video')) result.content_types.push('video');
    if (q.includes('photo') || q.includes('image')) result.content_types.push('image');
    if (q.includes('tweet')) result.content_types.push('post'); // Twitter posts
    if (q.includes('post') && !result.content_types.includes('reel') && !result.content_types.includes('video')) {
      // Only add 'post' generic type if no specific video type is found, or maybe just ignore it as default?
      // Let's keep it clean: if user says "posts", they usually mean anything. 
      // If they specific "reels", we curb. 
    }

    // Sort
    if (q.includes('recent') || q.includes('newest') || q.includes('latest')) result.sort_by = 'date';
    if (q.includes('popular') || q.includes('viral') || q.includes('trending') || q.includes('engagement')) result.sort_by = 'engagement';

    return result;
  }

  /**
   * Build parsing prompt
   */
  buildParsingPrompt(query) {
    return `You are a query parser for a social media search engine. Parse the following natural language query into structured filters.

USER QUERY: "${query}"

Extract the following information:
1. Search Type: "semantic" (find similar content) or "filter" (apply specific filters) or "aggregate" (statistics/comparison)
2. Keywords: Main search terms
3. Platforms: instagram, tiktok, twitter, reddit, facebook (or "all")
4. Sentiment: positive, neutral, negative (or "all")
5. Content Types: [reel, video, image, post, thread] (or empty array if not specified)
6. Sort By: sentiment, engagement, date (or "relevance")
7. Time Period: recent, week, month (or "all")
8. Intent: What is the user trying to find?

RESPONSE FORMAT (JSON only):
{"type": "semantic", "keywords": ["gun", "violence"], "platforms": ["all"], "sentiment": "all", "content_types": [], "sort_by": "relevance", "time_period": "all", "intent": "find posts about guns or violence"}

Examples:
- "find posts about guns" → {"type": "semantic", "keywords": ["guns"], "platforms": ["all"], "sentiment": "all", "content_types": [], "sort_by": "relevance", "time_period": "all", "intent": "semantic search for gun-related content"}
- "show negative reddit posts" → {"type": "filter", "keywords": [], "platforms": ["reddit"], "sentiment": "negative", "content_types": [], "sort_by": "date", "time_period": "all", "intent": "filter reddit posts by negative sentiment"}
- "find instagram reels about fashion" → {"type": "semantic", "keywords": ["fashion"], "platforms": ["instagram"], "sentiment": "all", "content_types": ["reel"], "sort_by": "relevance", "time_period": "all", "intent": "find instagram reels"}
- "compare instagram vs twitter" → {"type": "aggregate", "keywords": [], "platforms": ["instagram", "twitter"], "sentiment": "all", "content_types": [], "sort_by": "sentiment", "time_period": "all", "intent": "compare platforms"}
- "trending videos this week" → {"type": "filter", "keywords": ["trending"], "platforms": ["all"], "sentiment": "all", "content_types": ["video"], "sort_by": "engagement", "time_period": "week", "intent": "find high-engagement recent videos"}

Response must be ONLY valid JSON (no markdown, no explanations):`;
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
        num_predict: 300
      }
    };

    const response = await axios.post(url, payload, {
      timeout: 30000
    });

    return response.data.response;
  }

  /**
   * Parse LLM response
   */
  parseResponse(response) {
    try {
      // Clean response
      let cleaned = response.trim();
      cleaned = cleaned.replace(/```json\n?/g, '');
      cleaned = cleaned.replace(/```\n?/g, '');
      cleaned = cleaned.trim();

      // Find JSON
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      const parsed = JSON.parse(cleaned);

      return {
        type: parsed.type || 'semantic',
        keywords: parsed.keywords || [],
        platforms: parsed.platforms || ['all'],
        sentiment: parsed.sentiment || 'all',
        content_types: parsed.content_types || [],
        sort_by: parsed.sort_by || 'relevance',
        time_period: parsed.time_period || 'all',
        intent: parsed.intent || ''
      };

    } catch (error) {
      logger.error('Failed to parse query response', {
        response: response.substring(0, 200),
        error: error.message
      });

      // Fallback
      return {
        type: 'semantic',
        keywords: [],
        platforms: ['all'],
        sentiment: 'all',
        content_types: [],
        sort_by: 'relevance',
        time_period: 'all',
        intent: response.substring(0, 100)
      };
    }
  }
}

module.exports = new QueryParser();

