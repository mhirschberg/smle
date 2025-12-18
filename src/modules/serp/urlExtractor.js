const config = require('../../config');
const logger = require('../../utils/logger');

class URLExtractor {
  /**
   * Extract platform-specific URLs from SERP results
   * @param {Array} serpResults - Array of SERP results
   * @param {string} platform - Platform name (instagram, twitter, etc.)
   * @returns {Array} Array of unique platform URLs
   */
  extractUrls(serpResults, platform) {
    logger.info(`Extracting ${platform} URLs from SERP results`, { 
      totalResults: serpResults.length 
    });
    
    const platformConfig = config.platforms[platform];
    if (!platformConfig) {
      throw new Error(`Platform '${platform}' not configured`);
    }
    
    const urls = new Set();
    
    serpResults.forEach(result => {
      // Check URL field
      if (result.url) {
        if (this.isPlatformUrl(result.url, platformConfig)) {
          const normalized = this.normalizeUrl(result.url);
          urls.add(normalized);
        }
      }
      
      // Check link field (alternative field name)
      if (result.link) {
        if (this.isPlatformUrl(result.link, platformConfig)) {
          const normalized = this.normalizeUrl(result.link);
          urls.add(normalized);
        }
      }
      
      // Check in snippet or description for embedded URLs
      const text = [result.snippet, result.description, result.title].filter(Boolean).join(' ');
      const extractedUrls = this.extractUrlsFromText(text, platformConfig);
      extractedUrls.forEach(url => urls.add(url));
    });
    
    const uniqueUrls = Array.from(urls);
    logger.info(`Extracted unique ${platform} URLs`, { count: uniqueUrls.length });
    
    return uniqueUrls;
  }
  
  /**
   * Check if URL belongs to the specified platform
   * @param {string} url - URL to check
   * @param {Object} platformConfig - Platform configuration
   * @returns {boolean}
   */
  isPlatformUrl(url, platformConfig) {
    // Check domain
    const domainMatch = platformConfig.domains.some(domain => 
      url.includes(domain)
    );
    
    if (!domainMatch) return false;
    
    // Check patterns
    return platformConfig.patterns.some(pattern => pattern.test(url));
  }
  
  /**
   * Extract URLs from text using regex patterns
   * @param {string} text - Text to search
   * @param {Object} platformConfig - Platform configuration
   * @returns {Array} Array of extracted URLs
   */
  extractUrlsFromText(text, platformConfig) {
    const urls = [];
    
    platformConfig.patterns.forEach(pattern => {
      const matches = text.match(new RegExp(pattern.source, 'g'));
      if (matches) {
        matches.forEach(match => {
          const normalized = this.normalizeUrl(match);
          urls.push(normalized);
        });
      }
    });
    
    return urls;
  }
  
  /**
   * Normalize URL (remove tracking params, ensure https, etc.)
   * @param {string} url - URL to normalize
   * @returns {string} Normalized URL
   */
  normalizeUrl(url) {
    try {
      // Ensure https
      if (url.startsWith('http://')) {
        url = url.replace('http://', 'https://');
      }
      
      if (!url.startsWith('https://')) {
        url = 'https://' + url;
      }
      
      const urlObj = new URL(url);
      
      // Remove common tracking parameters
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'fbclid'];
      trackingParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });
      
      // Remove trailing slash
      let normalized = urlObj.toString();
      if (normalized.endsWith('/') && !normalized.match(/\/$\/$/)) {
        normalized = normalized.slice(0, -1);
      }
      
      return normalized;
    } catch (error) {
      logger.warn('Failed to normalize URL', { url, error: error.message });
      return url;
    }
  }
}

module.exports = new URLExtractor();

