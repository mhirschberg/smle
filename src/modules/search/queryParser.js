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
      
      const prompt = this.buildParsingPrompt(query);
      const response = await this.callOllama(prompt);
      const parsed = this.parseResponse(response);
      
      logger.info('Query parsed', { parsed });
      
      return parsed;
      
    } catch (error) {
      logger.error('Failed to parse query', { error: error.message });
      
      // Fallback to simple keyword search
      return {
        type: 'semantic',
        search_query: query,
        filters: {}
      };
    }
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
5. Sort By: sentiment, engagement, date (or "relevance")
6. Time Period: recent, week, month (or "all")
7. Intent: What is the user trying to find?

RESPONSE FORMAT (JSON only):
{"type": "semantic", "keywords": ["gun", "violence"], "platforms": ["all"], "sentiment": "all", "sort_by": "relevance", "time_period": "all", "intent": "find posts about guns or violence"}

Examples:
- "find posts about guns" → {"type": "semantic", "keywords": ["guns"], "platforms": ["all"], "sentiment": "all", "sort_by": "relevance", "time_period": "all", "intent": "semantic search for gun-related content"}
- "show negative reddit posts" → {"type": "filter", "keywords": [], "platforms": ["reddit"], "sentiment": "negative", "sort_by": "date", "time_period": "all", "intent": "filter reddit posts by negative sentiment"}
- "compare instagram vs twitter" → {"type": "aggregate", "keywords": [], "platforms": ["instagram", "twitter"], "sentiment": "all", "sort_by": "sentiment", "time_period": "all", "intent": "compare platforms"}
- "trending posts this week" → {"type": "filter", "keywords": ["trending"], "platforms": ["all"], "sentiment": "all", "sort_by": "engagement", "time_period": "week", "intent": "find high-engagement recent posts"}

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
        sort_by: 'relevance',
        time_period: 'all',
        intent: response.substring(0, 100)
      };
    }
  }
}

module.exports = new QueryParser();

