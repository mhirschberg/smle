const logger = require('../../utils/logger');

// Load scrapers with error handling
let instagramScraper = null;
let tiktokScraper = null;
let twitterScraper = null;
let redditScraper = null;
let facebookScraper = null;
let youtubeScraper = null;
let linkedinScraper = null;

try {
  logger.info('Loading Instagram scraper...');
  instagramScraper = require('../scraper/instagramScraper');
  logger.info('Instagram scraper loaded');
} catch (error) {
  logger.error('Failed to load Instagram scraper', { error: error.message });
}

try {
  logger.info('Loading TikTok scraper...');
  tiktokScraper = require('../scraper/tiktokScraper');
  logger.info('TikTok scraper loaded');
} catch (error) {
  logger.error('Failed to load TikTok scraper', { error: error.message });
}

try {
  logger.info('Loading Twitter scraper...');
  twitterScraper = require('../scraper/twitterScraper');
  logger.info('Twitter scraper loaded');
} catch (error) {
  logger.error('Failed to load Twitter scraper', { error: error.message });
}

try {
  logger.info('Loading Reddit scraper...');
  redditScraper = require('../scraper/redditScraper');
  logger.info('Reddit scraper loaded');
} catch (error) {
  logger.error('Failed to load Reddit scraper', { error: error.message });
}

try {
  logger.info('Loading Facebook scraper...');
  facebookScraper = require('../scraper/facebookScraper');
  logger.info('Facebook scraper loaded');
} catch (error) {
  logger.error('Failed to load Facebook scraper', { error: error.message });
}

try {
  logger.info('Loading YouTube scraper...');
  youtubeScraper = require('../scraper/youtubeScraper');
  logger.info('YouTube scraper loaded');
} catch (error) {
  logger.error('Failed to load YouTube scraper', { error: error.message });
}

try {
  logger.info('Loading LinkedIn scraper...');
  linkedinScraper = require('../scraper/linkedinScraper');
  logger.info('LinkedIn scraper loaded');
} catch (error) {
  logger.error('Failed to load LinkedIn scraper', { error: error.message });
}

class PlatformManager {
  constructor() {
    this.scrapers = {
      instagram: instagramScraper,
      tiktok: tiktokScraper,
      twitter: twitterScraper,
      reddit: redditScraper,
      facebook: facebookScraper,
      youtube: youtubeScraper,
      linkedin: linkedinScraper
    };
    
    this.collections = {
      instagram: 'instagram_posts',
      tiktok: 'tiktok_posts',
      twitter: 'twitter_posts',
      reddit: 'reddit_posts',
      facebook: 'facebook_posts',
      youtube: 'youtube_posts',
      linkedin: 'linkedin_posts'
    };
    
    logger.info('Platform Manager initialized', { 
      supported: this.getSupportedPlatforms() 
    });
  }
  
  getScraper(platform) {
    const scraper = this.scrapers[platform];
    if (!scraper) {
      throw new Error(`Platform '${platform}' not supported yet`);
    }
    return scraper;
  }
  
  getCollection(platform) {
    return this.collections[platform];
  }
  
  isSupported(platform) {
    return this.scrapers[platform] !== null;
  }
  
  getSupportedPlatforms() {
    return Object.keys(this.scrapers).filter(p => this.scrapers[p] !== null);
  }
}

module.exports = new PlatformManager();

