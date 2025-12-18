const axios = require('axios');
const https = require('https');
const config = require('../../config');
const logger = require('../../utils/logger');

// HTTPS agent for development
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production'
});

class TwitterScraper {
  constructor() {
    this.apiKey = config.brightData.apiKey;
    this.datasetId = 'gd_lwxkxvnf1cynvib9co'; // Twitter/X
    this.baseUrl = 'https://api.brightdata.com/datasets/v3';
  }
  
  /**
   * Trigger scraping for multiple URLs
   * @param {Array} urls - Array of Twitter URLs
   * @returns {Promise<string>} Snapshot ID
   */
  async triggerScrape(urls) {
    logger.info('Triggering Twitter scrape', { urlCount: urls.length });
    
    if (urls.length === 0) {
      throw new Error('No valid URLs to scrape');
    }
    
    // Prepare payload
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
        logger.error('Twitter scraper API error', {
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

module.exports = new TwitterScraper();

