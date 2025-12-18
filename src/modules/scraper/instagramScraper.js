const axios = require('axios');
const https = require('https');
const config = require('../../config');
const logger = require('../../utils/logger');

// HTTPS agent for development
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production'
});

class InstagramScraper {
  constructor() {
    this.apiKey = config.brightData.apiKey;
    this.datasetId = 'gd_lk5ns7kz21pck8jpis'; // Instagram posts
    this.reelsDatasetId = 'gd_lyclm20il4r5helnj'; // Instagram reels
    this.baseUrl = 'https://api.brightdata.com/datasets/v3';
  }
  
  /**
   * Trigger scraping for multiple URLs
   * @param {Array} urls - Array of Instagram URLs
   * @returns {Promise<string>} Snapshot ID
   */
  async triggerScrape(urls) {
    logger.info('Triggering Instagram scrape', { urlCount: urls.length });
    
    // Separate posts and reels
    const posts = urls.filter(url => url.includes('/p/'));
    const reels = urls.filter(url => url.includes('/reel/'));
    
    logger.info('URL breakdown', { posts: posts.length, reels: reels.length });
    
    // For now, let's combine them and use the posts dataset
    const allUrls = [...posts, ...reels];
    
    if (allUrls.length === 0) {
      throw new Error('No valid URLs to scrape');
    }
    
    // Prepare payload
    const payload = allUrls.map(url => ({ url }));
    
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
    
    // Use posts dataset for all (it works for both posts and reels)
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
        logger.error('Instagram scraper API error', {
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
      
      // Check if response is valid
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
        
        // If we get a 4xx/5xx error, it might still be building
        if (error.response.status >= 400) {
          throw new Error('Snapshot not ready yet');
        }
      }
      throw error;
    }
  }
}

module.exports = new InstagramScraper();

