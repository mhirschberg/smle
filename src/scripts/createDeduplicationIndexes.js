const couchbaseClient = require('../modules/storage/couchbaseClient');
const logger = require('../utils/logger');

async function createDeduplicationIndexes() {
  try {
    logger.info('=== Creating Deduplication Indexes ===');
    
    await couchbaseClient.connect();
    
    const platforms = ['instagram_posts', 'tiktok_posts', 'twitter_posts', 'reddit_posts', 'facebook_posts'];
    
    const indexes = [];
    
    // Create platform_url index for each collection (for deduplication)
    platforms.forEach(collection => {
      indexes.push({
        name: `idx_${collection}_url_dedup`,
        collection: collection,
        query: `
          CREATE INDEX idx_${collection}_url_dedup 
          ON SMLE._default.${collection}(platform_url)
        `
      });
      
      // Index for tracking appearances
      indexes.push({
        name: `idx_${collection}_appearances`,
        collection: collection,
        query: `
          CREATE INDEX idx_${collection}_appearances 
          ON SMLE._default.${collection}(total_appearances DESC, last_seen_run DESC)
        `
      });
    });
    
    let created = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const index of indexes) {
      try {
        logger.info(`Creating index: ${index.name}...`);
        await couchbaseClient.query(index.query);
        logger.info(`✅ Created: ${index.name}`);
        created++;
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          logger.warn(`⚠️  Already exists: ${index.name}`);
          skipped++;
        } else {
          logger.error(`❌ Failed: ${index.name}`, { error: error.message });
          failed++;
        }
      }
    }
    
    logger.info('=== Deduplication Index Creation Complete ===', {
      created,
      skipped,
      failed,
      total: indexes.length
    });
    
  } catch (error) {
    logger.error('Failed to create indexes', { error: error.message });
    throw error;
  } finally {
    await couchbaseClient.disconnect();
  }
}

createDeduplicationIndexes()
  .then(() => {
    logger.info('Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

