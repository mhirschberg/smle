const { v4: uuidv4 } = require('uuid');
const dbFactory = require('../modules/storage/dbFactory');
const campaignRepository = require('../modules/repositories/campaignRepository');
const tiktokScraper = require('../modules/scraper/tiktokScraper');
const snapshotMonitor = require('../modules/scraper/snapshotMonitor');
const logger = require('../utils/logger');

async function searchTikTok(campaignId, runId) {
  let db;
  try {
    logger.setContext(campaignId, runId);
    logger.info('=== Starting TikTok Keyword Search ===', { campaignId, runId });

    // Step 1: Connect to DB
    logger.info('Step 1: Connecting to Database...');
    db = await dbFactory.getDB();

    // Step 2: Load campaign
    logger.info('Step 2: Loading campaign...');
    const campaign = await campaignRepository.getById(campaignId);

    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    // Step 3: Load run
    logger.info('Step 3: Loading run...');
    const run = await campaignRepository.getRun(runId);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const searchQuery = campaign.search_query;
    let settings = campaign.settings || {};
    if (typeof settings === 'string') {
      try {
        settings = JSON.parse(settings);
      } catch (e) {
        settings = {};
      }
    }
    const postLimit = settings.tiktok_post_limit || 100;

    logger.info('Campaign loaded', {
      campaignId,
      runId,
      runNumber: run.run_number,
      query: searchQuery,
      postLimit: postLimit
    });

    // Step 4: Trigger TikTok keyword search
    logger.info('Step 4: Triggering TikTok keyword search...');

    // Simplified options - only include what TikTok API actually accepts
    const searchOptions = {
      num_of_posts: postLimit
    };

    logger.info('Search options', searchOptions);

    const snapshotId = await tiktokScraper.triggerKeywordSearch(searchQuery, searchOptions);

    // CRITICAL: Reload run to avoid overwriting other scripts' updates (e.g. SERP found URLs)
    const currentRun = await campaignRepository.getRun(runId);
    if (!currentRun) throw new Error(`Run not found for update: ${runId}`);

    // Update run with snapshot ID
    currentRun.snapshot_id = snapshotId;
    currentRun.snapshot_status = 'running';
    currentRun.updated_at = new Date().toISOString();
    await campaignRepository.updateRun(runId, currentRun);

    logger.info('Keyword search triggered', { snapshotId });

    // Step 5: Monitor snapshot
    logger.info('Step 5: Monitoring snapshot...');
    await snapshotMonitor.waitForCompletion(
      snapshotId,
      (id) => tiktokScraper.checkStatus(id),
      {
        pollInterval: 10000,
        timeout: 1800000
      }
    );

    // Step 6: Download results
    logger.info('Step 6: Downloading results...');
    let posts = [];
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        posts = await tiktokScraper.downloadSnapshot(snapshotId);
        break;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          throw error;
        }
        logger.warn(`Download failed, retrying (${retries}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    logger.info(`Downloaded ${posts.length} TikTok posts`);

    const postRepository = require('../modules/repositories/postRepository');
    const runNumber = run.run_number;
    const now = new Date().toISOString();
    let newCount = 0;
    let updatedCount = 0;
    let successCount = 0;
    let failCount = 0;

    for (const rawPost of posts) {
      try {
        const result = await postRepository.saveScrapedPost(
          'tiktok',
          rawPost,
          campaignId,
          runId,
          runNumber
        );

        if (result.isNew) {
          newCount++;
        } else {
          updatedCount++;
        }
        successCount++;
      } catch (error) {
        logger.error('Failed to store post', {
          url: rawPost.url,
          error: error.message
        });
        failCount++;
      }
    }

    logger.info('Posts stored', { success: successCount, new: newCount, updated: updatedCount, failed: failCount });

    // Step 8: Update run with stats
    logger.info('Step 8: Updating run document...');

    // CRITICAL: Reload run to get latest updates from all other scripts
    const finalRun = await campaignRepository.getRun(runId);
    if (!finalRun) throw new Error(`Final run document re-load failed: ${runId}`);

    finalRun.snapshot_status = 'ready';

    // Update THIS platform's stats specifically
    if (!finalRun.stats.by_platform) finalRun.stats.by_platform = {};
    finalRun.stats.by_platform.tiktok = {
      posts_found: successCount,
      posts_failed: failCount
    };

    // INCREMENT global counts instead of overwriting
    finalRun.stats.urls_found = (finalRun.stats.urls_found || 0) + posts.length;
    finalRun.stats.posts_scraped = (finalRun.stats.posts_scraped || 0) + successCount;
    finalRun.stats.posts_failed = (finalRun.stats.posts_failed || 0) + failCount;
    finalRun.stats.posts_new = (finalRun.stats.posts_new || 0) + newCount;
    finalRun.stats.posts_updated = (finalRun.stats.posts_updated || 0) + updatedCount;
    finalRun.updated_at = now;

    await campaignRepository.updateRun(runId, finalRun);

    logger.info('=== TikTok Search Completed Successfully ===', {
      campaignId,
      runId,
      postsFound: successCount,
      postsFailed: failCount
    });

    return {
      success: true,
      postsFound: successCount,
      postsFailed: failCount
    };

  } catch (error) {
    logger.error('TikTok search failed', {
      campaignId,
      runId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    if (db) await db.disconnect();
    logger.clearContext();
  }
}

// Get parameters from command line
const campaignId = process.argv[2];
const runId = process.argv[3];

if (!campaignId || !runId) {
  console.error('Usage: node src/scripts/searchTikTok.js <campaign-id> <run-id>');
  process.exit(1);
}

// Run the script
searchTikTok(campaignId, runId)
  .then((result) => {
    logger.info('Script finished successfully', result);
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

