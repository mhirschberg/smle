const logger = require('./logger');

class URLSanitizer {
  /**
   * Clean and validate URLs for platform-specific scraping
   * @param {Array} urls - Array of URLs
   * @param {string} platform - Platform name
   * @returns {Array} Cleaned and valid URLs
   */
  sanitizeUrls(urls, platform) {
    const cleanedUrls = urls
      .map(url => this.cleanUrl(url, platform))
      .filter(url => this.validateUrl(url, platform));
    
    const removed = urls.length - cleanedUrls.length;
    
    if (removed > 0) {
      logger.info('URL sanitization', {
        platform,
        original: urls.length,
        cleaned: cleanedUrls.length,
        removed: removed,
        sampleRejected: urls.find((u, i) => !cleanedUrls.includes(this.cleanUrl(u, platform)))
      });
    }
    
    return cleanedUrls;
  }
  
  /**
   * Clean URL for specific platform
   */
  cleanUrl(url, platform) {
    try {
      const urlObj = new URL(url);
      
      switch (platform) {
        case 'reddit':
          // Remove ALL query parameters (especially language parameters like ?tl=)
          urlObj.search = '';
          urlObj.hash = '';
          break;
          
        case 'linkedin':
          // Remove tracking parameters but keep the URL structure
          urlObj.searchParams.delete('trk');
          urlObj.searchParams.delete('trackingId');
          urlObj.hash = '';
          break;
          
        case 'twitter':
          // Remove tracking parameters
          urlObj.searchParams.delete('s');
          urlObj.searchParams.delete('t');
          break;
          
        case 'facebook':
          // Remove tracking parameters
          urlObj.searchParams.delete('rdid');
          urlObj.searchParams.delete('share_url');
          break;
          
        default:
          // Remove common tracking params
          urlObj.searchParams.delete('utm_source');
          urlObj.searchParams.delete('utm_medium');
          urlObj.searchParams.delete('utm_campaign');
      }
      
      // Remove trailing slash for consistency
      let cleaned = urlObj.toString();
      if (cleaned.endsWith('/')) {
        cleaned = cleaned.slice(0, -1);
      }
      
      return cleaned;
    } catch (error) {
      logger.warn('Failed to clean URL', { url, error: error.message });
      return url;
    }
  }
  
  /**
   * Validate URL matches platform requirements
   */
  validateUrl(url, platform) {
    if (!url) return false;
    
    try {
      switch (platform) {
        case 'reddit':
          // Reddit: Must be /r/ or /user/ format without query params
          return /^https:\/\/(www\.)?reddit\.com\/(r|user)\/[a-zA-Z0-9_\/-]+\/?$/.test(url);
          
        case 'linkedin':
          // LinkedIn: Match actual format from Google
          // Format: /posts/username_slug-activity-123456-hash
          // Also accept: /pulse/article-slug
          return /^https:\/\/([\w]+\.)?linkedin\.com\/(posts\/[\w-]+-activity-\d+|pulse\/[\w-]+)/.test(url);
          
        case 'twitter':
          // Twitter: Must be status URL
          return /^https:\/\/(www\.)?(twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url);
          
        case 'facebook':
        case 'instagram':
        case 'tiktok':
        case 'youtube':
          // Basic validation
          return url.startsWith('https://');
          
        default:
          return true;
      }
    } catch (error) {
      logger.warn('URL validation failed', { url, error: error.message });
      return false;
    }
  }
}

module.exports = new URLSanitizer();

