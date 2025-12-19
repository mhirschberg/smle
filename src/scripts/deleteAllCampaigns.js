const campaignRepository = require('../modules/repositories/campaignRepository');
const postRepository = require('../modules/repositories/postRepository');
const analyticsRepository = require('../modules/repositories/analyticsRepository');
const logger = require('../utils/logger');

async function deleteAllCampaigns() {
  try {
    logger.info('=== Deleting All Campaigns and Data ===');

    // Step 1: Delete all searches
    logger.info('Step 1: Deleting all search documents...');
    const searchesDeleted = await campaignRepository.deleteAllCampaigns();
    logger.info(`Deleted ${searchesDeleted.length} search documents`);

    // Step 2: Delete all search runs
    logger.info('Step 2: Deleting all search runs...');
    const runsDeleted = await campaignRepository.deleteAllRuns();
    logger.info(`Deleted ${runsDeleted.length} run documents`);

    // Step 3: Delete all posts across platforms
    logger.info('Step 3: Deleting all posts...');
    const platformCollections = ['instagram_posts', 'tiktok_posts', 'twitter_posts', 'reddit_posts', 'facebook_posts', 'youtube_posts', 'linkedin_posts'];
    const postsDeleted = await postRepository.deleteAllPosts(platformCollections);
    logger.info(`Deleted ${postsDeleted} post documents`);

    // Step 4: Delete all analytics
    logger.info('Step 4: Deleting all analytics...');
    const analyticsDeleted = await analyticsRepository.deleteAllAnalytics();
    logger.info(`Deleted ${analyticsDeleted.length} analytics documents`);

    logger.info('=== Cleanup Completed ===', {
      searches: searchesDeleted.length,
      runs: runsDeleted.length,
      posts: postsDeleted,
      analytics: analyticsDeleted.length
    });

    console.log('\n✅ All data deleted successfully!\n');
    console.log('Summary:');
    console.log(`  - ${searchesDeleted.length} campaigns deleted`);
    console.log(`  - ${runsDeleted.length} runs deleted`);
    console.log(`  - ${postsDeleted} posts deleted`);
    console.log(`  - ${analyticsDeleted.length} analytics deleted\n`);

  } catch (error) {
    logger.error('Cleanup failed', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    // No explicit disconnect needed
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

