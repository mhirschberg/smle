const couchbaseClient = require('../modules/storage/couchbaseClient');
const platformManager = require('../modules/platforms/platformManager');
const embeddingGenerator = require('../modules/analysis/embeddingGenerator');
const logger = require('../utils/logger');

async function generateEmbeddings(campaignId = null, runId = null) {
  try {
    logger.info('=== Generating Embeddings for Existing Posts ===', { campaignId, runId });
    
    await couchbaseClient.connect();
    
    // Determine scope
    let whereClause = `p.analysis_status = 'analyzed' AND (p.analysis.embedding IS NULL OR p.analysis.embedding IS MISSING)`;
    
    if (campaignId && runId) {
      whereClause = `p.campaign_id = $campaignId AND p.run_id = $runId AND ${whereClause}`;
    } else if (campaignId) {
      whereClause = `p.campaign_id = $campaignId AND ${whereClause}`;
    }
    
    // Get all platform collections
    const platforms = ['instagram', 'tiktok', 'twitter', 'reddit', 'facebook'];
    
    logger.info('Finding posts without embeddings...', { scope: campaignId ? 'campaign' : 'all' });
    
    // Build UNION query for all platforms
    const unionQueries = platforms.map(platform => {
      const collection = platformManager.getCollection(platform);
      return `
        SELECT META().id as docId, p.*, '${collection}' as source_collection
        FROM SMLE._default.${collection} p
        WHERE ${whereClause}
      `;
    });

    const query = unionQueries.join(' UNION ALL ');
    
    const parameters = {};
    if (campaignId) {
      parameters.campaignId = campaignId;
    }
    if (runId) {
      parameters.runId = runId;
    }
    
    const results = await couchbaseClient.query(query, { parameters });
    
    logger.info(`Found ${results.length} posts needing embeddings`);
    
    if (results.length === 0) {
      logger.info('No posts need embeddings. All done!');
      return;
    }
    
    // Group by platform
    const byPlatform = {};
    results.forEach(r => {
      const platform = r.p?.platform || r.platform;
      byPlatform[platform] = (byPlatform[platform] || 0) + 1;
    });
    logger.info('Posts by platform', byPlatform);
    
    const CONCURRENCY = 10;
    let successCount = 0;
    let failCount = 0;
    
    // Process in batches
    for (let i = 0; i < results.length; i += CONCURRENCY) {
      const batch = results.slice(i, i + CONCURRENCY);
      
      logger.info(`Processing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(results.length / CONCURRENCY)}`, {
        posts: `${i + 1}-${Math.min(i + CONCURRENCY, results.length)} of ${results.length}`
      });
      
      const batchResults = await Promise.allSettled(
        batch.map(async (row) => {
          const { docId, source_collection, ...post } = row;
          
          try {
            const embedding = await embeddingGenerator.generateEmbedding(post);
            
            post.analysis.embedding = embedding;
            post.updated_at = new Date().toISOString();
            
            await couchbaseClient.upsert(source_collection, docId, post);
            
            logger.debug('Embedding generated', { 
              postId: docId,
              platform: post.platform,
              dimension: embedding?.length 
            });
            
            return { success: true };
          } catch (error) {
            logger.error('Failed to generate embedding', { 
              postId: docId,
              error: error.message 
            });
            return { success: false };
          }
        })
      );
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          failCount++;
        }
      });
      
      logger.info(`Batch completed`, { success: successCount, failed: failCount });
    }
    
    logger.info('=== Embeddings Generation Completed ===', {
      total: results.length,
      success: successCount,
      failed: failCount
    });
    
    console.log(`\n✅ Generated embeddings for ${successCount} posts`);
    if (failCount > 0) {
      console.log(`❌ Failed: ${failCount} posts\n`);
    }
    
  } catch (error) {
    logger.error('Failed to generate embeddings', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    await couchbaseClient.disconnect();
  }
}

// Get parameters from command line
const campaignId = process.argv[2] || null;
const runId = process.argv[3] || null;

// Run the script
generateEmbeddings(campaignId, runId)
  .then(() => {
    logger.info('Script finished successfully');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

