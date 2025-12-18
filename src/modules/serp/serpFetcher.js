const axios = require('axios');
const https = require('https');
const config = require('../../config');
const logger = require('../../utils/logger');

// HTTPS agent for development
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production'
});

class SerpFetcher {
  constructor() {
    this.apiUrl = config.brightData.apiUrl;
    this.apiKey = config.brightData.apiKey;
    this.serpZone = config.brightData.serpZone;
  }
  
  /**
   * Fetch SERP results for a specific platform
   * @param {string} query - Search query
   * @param {string} platform - Platform name (instagram, twitter, etc.)
   * @param {string} googleDomain - Google domain
   * @param {number} maxResults - Maximum results per content type
   * @returns {Promise<Array>} Array of search results
   */
  async fetchResultsForPlatform(query, platform, googleDomain = config.serp.googleDomain, maxResults = config.serp.maxResults) {
    logger.info('Starting platform-specific SERP fetch', { query, platform, maxResults });
    
    const platformConfig = config.platforms[platform];
    if (!platformConfig) {
      throw new Error(`Platform '${platform}' not configured`);
    }
    
    // Build site-specific search queries based on platform
    const searchQueries = this.buildPlatformSearchQueries(query, platform);
    
    logger.info('Generated search queries', { queries: searchQueries });
    
    // Fetch results for each query
    const allResults = [];
    
    for (const searchQuery of searchQueries) {
      try {
        logger.info(`Fetching results for: "${searchQuery}"`);
        const results = await this.fetchResults(searchQuery, googleDomain, maxResults);
        allResults.push(...results);
        
        // Small delay between different search queries
        if (searchQueries.indexOf(searchQuery) < searchQueries.length - 1) {
          await this.sleep(1000);
        }
      } catch (error) {
        logger.error('Failed to fetch for query', { searchQuery, error: error.message });
        // Continue with other queries
      }
    }
    
    logger.info('Platform SERP fetch completed', { totalResults: allResults.length });
    return allResults;
  }
  
  /**
   * Build platform-specific search queries with + between keywords
   * Format: "site:domain keyword1+keyword2+keyword3"
   * @param {string} query - User's search query
   * @param {string} platform - Platform name
   * @returns {Array<string>} Array of search queries
   */
  buildPlatformSearchQueries(query, platform) {
    const queries = [];
    
    // Convert spaces to + for AND search (all keywords required)
    const keywords = query.trim().split(/\s+/).join('+');
    
    switch (platform) {
      case 'instagram':
        queries.push(`site:instagram.com/p/ ${keywords}`);
        queries.push(`site:instagram.com/reel/ ${keywords}`);
        break;
        
      case 'tiktok':
        queries.push(`site:tiktok.com ${keywords}`);
        break;
        
      case 'twitter':
        queries.push(`site:x.com ${keywords}`);
        queries.push(`site:twitter.com ${keywords}`);
        break;
        
      case 'reddit':
        queries.push(`site:reddit.com/r/ ${keywords}`);
        break;
        
      case 'facebook':
        queries.push(`site:facebook.com ${keywords}`);
        break;
        
      case 'youtube':
        queries.push(`site:youtube.com ${keywords}`);
        break;
        
      case 'linkedin':
        // LinkedIn - broad site search, filter by URL pattern later
        queries.push(`site:linkedin.com ${keywords}`);
        break;
        
      default:
        const domains = config.platforms[platform]?.domains || [];
        if (domains.length > 0) {
          queries.push(`site:${domains[0]} ${keywords}`);
        } else {
          queries.push(keywords);
        }
    }
    
    return queries;
  }
  
  /**
   * Fetch SERP results with pagination
   * @param {string} query - Search query (may contain + symbols)
   * @param {string} googleDomain - Google domain (e.g., google.com)
   * @param {number} maxResults - Maximum number of results to fetch
   * @returns {Promise<Array>} Array of search results
   */
  async fetchResults(query, googleDomain = config.serp.googleDomain, maxResults = config.serp.maxResults) {
    logger.info('Starting SERP fetch', { query, googleDomain, maxResults });
    
    const allResults = [];
    const resultsPerPage = config.serp.resultsPerPage;
    const maxPages = Math.ceil(maxResults / resultsPerPage);
    
    for (let page = 0; page < maxPages; page++) {
      const start = page * resultsPerPage;
      
      try {
        logger.debug(`Fetching SERP page ${page + 1}/${maxPages}`, { start });
        
        const results = await this.fetchPage(query, googleDomain, start);
        
        if (!results || results.length === 0) {
          logger.info('No more results found, stopping pagination', { page: page + 1 });
          break;
        }
        
        allResults.push(...results);
        
        // Stop if we've reached the desired number of results
        if (allResults.length >= maxResults) {
          logger.info('Reached max results limit', { count: allResults.length });
          break;
        }
        
        // Rate limiting - wait between requests
        if (page < maxPages - 1) {
          await this.sleep(config.serp.retryDelay);
        }
        
      } catch (error) {
        logger.error(`Failed to fetch SERP page ${page + 1}`, { error: error.message });
        
        // Continue to next page on error (don't fail the entire operation)
        if (allResults.length > 0) {
          logger.warn('Continuing with partial results');
          break;
        } else {
          throw error;
        }
      }
    }
    
    logger.info('SERP fetch completed', { totalResults: allResults.length });
    return allResults.slice(0, maxResults);
  }
  
  /**
   * Fetch a single SERP page
   * @param {string} query - Search query (with + symbols between keywords)
   * @param {string} googleDomain - Google domain
   * @param {number} start - Starting position
   * @returns {Promise<Array>} Array of results from this page
   */
  async fetchPage(query, googleDomain, start) {
    // Build URL - encodeURIComponent will convert + to %2B which Google interprets as AND
    const url = `https://www.${googleDomain}/search?q=${encodeURIComponent(query)}&start=${start}&brd_json=1`;
    
    logger.debug('SERP request URL', { url });
    
    const payload = {
      zone: this.serpZone,
      url: url,
      format: 'raw',
      method: 'GET'
    };
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
    
    try {
      const response = await axios.post(this.apiUrl, payload, { 
        headers, 
        timeout: 90000,
        httpsAgent: httpsAgent
      });
      
      // Parse the response
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      
      // Extract organic results
      const organicResults = data.organic || data.results || [];
      
      logger.debug('SERP page results', { count: organicResults.length });
      
      return organicResults;
      
    } catch (error) {
      if (error.response) {
        logger.error('SERP API error', {
          status: error.response.status,
          data: error.response.data
        });
      }
      throw error;
    }
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new SerpFetcher();
