const couchbaseClient = require('../modules/storage/couchbaseClient');
const logger = require('../utils/logger');

async function createIndexes() {
  try {
    logger.info('=== Creating Couchbase Indexes for All Platforms ===');
    
    await couchbaseClient.connect();
    
    const platforms = ['instagram', 'tiktok', 'twitter', 'reddit', 'facebook', 'youtube', 'linkedin'];
    
    const indexes = [
      // Searches collection indexes
      {
        name: 'idx_searches_platform_query',
        collection: 'searches',
        query: `
          CREATE INDEX idx_searches_platforms_query 
          ON SMLE._default.searches(platforms, search_query, created_at DESC)
        `
      },
      {
        name: 'idx_searches_status',
        collection: 'searches',
        query: `
          CREATE INDEX idx_searches_status 
          ON SMLE._default.searches(status, created_at DESC)
        `
      },
      {
        name: 'idx_searches_type',
        collection: 'searches',
        query: `
          CREATE INDEX idx_searches_type 
          ON SMLE._default.searches(type, status, created_at DESC)
        `
      },
      
      // Search runs indexes
      {
        name: 'idx_runs_campaign',
        collection: 'search_runs',
        query: `
          CREATE INDEX idx_runs_campaign 
          ON SMLE._default.search_runs(campaign_id, run_at DESC)
        `
      },
      {
        name: 'idx_runs_status',
        collection: 'search_runs',
        query: `
          CREATE INDEX idx_runs_status 
          ON SMLE._default.search_runs(campaign_id, status, run_at DESC)
        `
      },
      {
        name: 'idx_runs_number',
        collection: 'search_runs',
        query: `
          CREATE INDEX idx_runs_number 
          ON SMLE._default.search_runs(campaign_id, run_number)
        `
      }
    ];
    
    // Create indexes for each platform collection
    platforms.forEach(platform => {
      const collection = `${platform}_posts`;
      
      // Campaign and run index
      indexes.push({
        name: `idx_${collection}_campaign_run`,
        collection: collection,
        query: `
          CREATE INDEX idx_${collection}_campaign_run 
          ON SMLE._default.${collection}(campaign_id, run_id, created_at DESC)
        `
      });
      
      // Analysis status index
      indexes.push({
        name: `idx_${collection}_analysis_status`,
        collection: collection,
        query: `
          CREATE INDEX idx_${collection}_analysis_status 
          ON SMLE._default.${collection}(campaign_id, analysis_status, created_at DESC)
        `
      });
      
      // Sentiment score index
      indexes.push({
        name: `idx_${collection}_sentiment`,
        collection: collection,
        query: `
          CREATE INDEX idx_${collection}_sentiment 
          ON SMLE._default.${collection}(campaign_id, analysis.sentiment_score DESC, created_at DESC)
        `
      });
      
      // Platform URL index (for deduplication)
      indexes.push({
        name: `idx_${collection}_url_dedup`,
        collection: collection,
        query: `
          CREATE INDEX idx_${collection}_url_dedup 
          ON SMLE._default.${collection}(platform_url)
        `
      });
      
      // Appearances tracking index
      indexes.push({
        name: `idx_${collection}_appearances`,
        collection: collection,
        query: `
          CREATE INDEX idx_${collection}_appearances 
          ON SMLE._default.${collection}(total_appearances DESC, last_seen_run DESC)
        `
      });
      
      // Date posted index
      indexes.push({
        name: `idx_${collection}_date`,
        collection: collection,
        query: `
          CREATE INDEX idx_${collection}_date 
          ON SMLE._default.${collection}(campaign_id, raw_data.date_posted DESC)
        `
      });
    });
    
    // Analytics indexes
    indexes.push({
      name: 'idx_analytics_campaign',
      collection: 'analytics',
      query: `
        CREATE INDEX idx_analytics_campaign 
        ON SMLE._default.analytics(campaign_id, type, created_at DESC)
      `
    });
    
    indexes.push({
      name: 'idx_analytics_platforms',
      collection: 'analytics',
      query: `
        CREATE INDEX idx_analytics_platforms 
        ON SMLE._default.analytics(platforms, type, created_at DESC)
      `
    });
    
    let created = 0;
    let skipped = 0;
    let failed = 0;
    
    logger.info(`Creating ${indexes.length} indexes...`);
    
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
    
    logger.info('=== Index Creation Complete ===', {
      created,
      skipped,
      failed,
      total: indexes.length
    });
    
    console.log(`\n📊 Index Creation Summary:`);
    console.log(`  ✅ Created: ${created}`);
    console.log(`  ⚠️  Skipped (already exist): ${skipped}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  📝 Total: ${indexes.length}\n`);
    
  } catch (error) {
    logger.error('Failed to create indexes', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    await couchbaseClient.disconnect();
  }
}

createIndexes()
  .then(() => {
    logger.info('Script finished successfully');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

