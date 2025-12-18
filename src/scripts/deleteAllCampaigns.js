const couchbaseClient = require('../modules/storage/couchbaseClient');
const logger = require('../utils/logger');

async function deleteAllCampaigns() {
  try {
    logger.info('=== Deleting All Campaigns and Data ===');
    
    await couchbaseClient.connect();
    
    // Step 1: Delete all searches (both old and new)
    logger.info('Step 1: Deleting all search documents...');
    const deleteSearchesQuery = `
      DELETE FROM SMLE._default.searches
      RETURNING META().id
    `;
    
    const searchesDeleted = await couchbaseClient.query(deleteSearchesQuery);
    logger.info(`Deleted ${searchesDeleted.length} search documents`);
    
    // Step 2: Delete all search runs
    logger.info('Step 2: Deleting all search runs...');
    const deleteRunsQuery = `
      DELETE FROM SMLE._default.search_runs
      RETURNING META().id
    `;
    
    const runsDeleted = await couchbaseClient.query(deleteRunsQuery);
    logger.info(`Deleted ${runsDeleted.length} run documents`);
    
    // Step 3: Delete all posts
    logger.info('Step 3: Deleting all posts...');
    const deletePostsQuery = `
      DELETE FROM SMLE._default.instagram_posts
      RETURNING META().id
    `;
    
    const postsDeleted = await couchbaseClient.query(deletePostsQuery);
    logger.info(`Deleted ${postsDeleted.length} post documents`);
    
    // Step 4: Delete all analytics
    logger.info('Step 4: Deleting all analytics...');
    const deleteAnalyticsQuery = `
      DELETE FROM SMLE._default.analytics
      RETURNING META().id
    `;
    
    const analyticsDeleted = await couchbaseClient.query(deleteAnalyticsQuery);
    logger.info(`Deleted ${analyticsDeleted.length} analytics documents`);
    
    logger.info('=== Cleanup Completed ===', {
      searches: searchesDeleted.length,
      runs: runsDeleted.length,
      posts: postsDeleted.length,
      analytics: analyticsDeleted.length
    });
    
    console.log('\n✅ All data deleted successfully!\n');
    console.log('Summary:');
    console.log(`  - ${searchesDeleted.length} campaigns deleted`);
    console.log(`  - ${runsDeleted.length} runs deleted`);
    console.log(`  - ${postsDeleted.length} posts deleted`);
    console.log(`  - ${analyticsDeleted.length} analytics deleted\n`);
    
  } catch (error) {
    logger.error('Cleanup failed', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    await couchbaseClient.disconnect();
  }
}

deleteAllCampaigns()
  .then(() => {
    logger.info('Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

