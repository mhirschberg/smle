const axios = require('axios');
const https = require('https');
const config = require('../../config');
const logger = require('../../utils/logger');

// HTTPS agent for development
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production'
});

class YouTubeScraper {
  constructor() {
    this.apiKey = config.brightData.apiKey;
    this.datasetId = 'gd_lk56epmy2i5g7lzu0k'; // YouTube
    this.baseUrl = 'https://api.brightdata.com/datasets/v3';
  }
  
  /**
   * Trigger keyword-based discovery (YouTube-specific)
   * @param {string} keyword - Search keyword
   * @param {Object} options - Search options
   * @returns {Promise<string>} Snapshot ID
   */
  async triggerKeywordSearch(keyword, options = {}) {
    logger.info('Triggering YouTube keyword search', { keyword, options });
    
    const {
      num_of_posts = 100
    } = options;
    
    // Prepare payload - only keyword and country, NO date parameters
    const payload = [{
      keyword: keyword,
      country: ''
    }];
    
    // Only add num_of_posts if specified
    if (num_of_posts) {
      payload[0].num_of_posts = num_of_posts.toString();
    }
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
    
    const url = `${this.baseUrl}/trigger?dataset_id=${this.datasetId}&include_errors=true&type=discover_new&discover_by=keyword`;
    
    logger.info('YouTube API Request', { url, payload });
    
    try {
      const response = await axios.post(url, payload, { 
        headers,
        httpsAgent,
        timeout: 30000
      });
      
      const snapshotId = response.data.snapshot_id;
      
      if (!snapshotId) {
        throw new Error('No snapshot_id returned from API');
      }
      
      logger.info('Keyword search triggered successfully', { 
        snapshotId, 
        keyword, 
        num_of_posts
      });
      
      return snapshotId;
      
    } catch (error) {
      if (error.response) {
        logger.error('YouTube keyword search API error', {
          status: error.response.status,
          data: error.response.data
        });
      }
      throw error;
    }
  }
  
  /**
   * Trigger scraping for multiple URLs (fallback method)
   * @param {Array} urls - Array of YouTube URLs
   * @returns {Promise<string>} Snapshot ID
   */
  async triggerScrape(urls) {
    logger.info('Triggering YouTube scrape', { urlCount: urls.length });
    
    if (urls.length === 0) {
      throw new Error('No valid URLs to scrape');
    }
    
    const payload = urls.map(url => ({ url }));
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
    
    const url = `${this.baseUrl}/trigger?dataset_id=${this.datasetId}&include_errors=true`;
    
    try {
      const response = await axios.post(url, payload, { 
        headers,
        httpsAgent,
        timeout: 30000
      });
      
      const snapshotId = response.data.snapshot_id;
      
      if (!snapshotId) {
        throw new Error('No snapshot_id returned from API');
      }
      
      logger.info('Scrape triggered successfully', { snapshotId });
      
      return snapshotId;
      
    } catch (error) {
      if (error.response) {
        logger.error('YouTube scraper API error', {
          status: error.response.status,
          data: error.response.data
        });
      }
      throw error;
    }
  }
  
  /**
   * Check snapshot status
   * @param {string} snapshotId - Snapshot ID
   * @returns {Promise<Object>} Status object
   */
  async checkStatus(snapshotId) {
    const url = `${this.baseUrl}/progress/${snapshotId}`;
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`
    };
    
    try {
      const response = await axios.get(url, { 
        headers,
        httpsAgent,
        timeout: 10000
      });
      
      return response.data;
      
    } catch (error) {
      if (error.response) {
        logger.error('Status check error', {
          status: error.response.status,
          data: error.response.data
        });
      }
      throw error;
    }
  }
  
  /**
   * Download snapshot data
   * @param {string} snapshotId - Snapshot ID
   * @returns {Promise<Array>} Array of scraped posts
   */
  async downloadSnapshot(snapshotId) {
    logger.info('Downloading snapshot', { snapshotId });
    
    const url = `${this.baseUrl}/snapshot/${snapshotId}?format=json`;
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`
    };
    
    try {
      const response = await axios.get(url, { 
        headers,
        httpsAgent,
        timeout: 60000
      });
      
      if (response.status !== 200) {
        throw new Error(`Invalid response status: ${response.status}`);
      }
      
      const data = Array.isArray(response.data) ? response.data : [response.data];
      
      logger.info('Snapshot downloaded', { postCount: data.length });
      
      return data;
      
    } catch (error) {
      if (error.response) {
        logger.error('Download error', {
          status: error.response.status,
          statusText: error.response.statusText
        });
        
        if (error.response.status >= 400) {
          throw new Error('Snapshot not ready yet');
        }
      }
      throw error;
    }
  }
}

module.exports = new YouTubeScraper();

