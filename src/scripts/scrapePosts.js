const { v4: uuidv4 } = require('uuid');
const dbFactory = require('../modules/storage/dbFactory');
const campaignRepository = require('../modules/repositories/campaignRepository');
const platformManager = require('../modules/platforms/platformManager');
const snapshotMonitor = require('../modules/scraper/snapshotMonitor');
const logger = require('../utils/logger');

async function scrapePosts(campaignId, runId, specificPlatform = null) {
  let db;
  try {
    logger.setContext(campaignId, runId);
    logger.info('=== Starting Post Scraping ===', { campaignId, runId, specificPlatform });

    // Step 1: Connect to DB
    logger.info('Step 1: Connecting to Database...');
    db = await dbFactory.getDB();

    // Step 2: Fetch run document
    logger.info('Step 2: Fetching run document...');
    const run = await campaignRepository.getRun(runId);

    if (!run) {
      throw new Error(`Run document not found: ${runId}`);
    }

    // Step 3: Fetch campaign document
    logger.info('Step 3: Fetching campaign document...');
    const campaign = await campaignRepository.getById(campaignId);

    if (!campaign) {
      throw new Error(`Campaign document not found: ${campaignId}`);
    }

    // Determine which platform to scrape
    let platform;
    if (specificPlatform) {
      platform = specificPlatform;
    } else if (campaign.platforms) {
      throw new Error('Multi-platform campaign requires platform parameter');
    } else {
      platform = campaign.platform;
    }

    // Get URLs for this specific platform
    const urlsForPlatform = run.links_by_platform?.[platform] || run.links || [];

    logger.info('Documents loaded', {
      campaign: campaign.search_query,
      platform: platform,
      runNumber: run.run_number,
      urlCount: urlsForPlatform.length
    });

    if (urlsForPlatform.length === 0) {
      logger.warn(`No URLs to scrape for ${platform}`);
      return { success: true, postsScraped: 0, postsFailed: 0 };
    }

    // Step 4: Get platform-specific scraper
    if (!platformManager.isSupported(platform)) {
      throw new Error(`Platform '${platform}' is not supported yet`);
    }

    const scraper = platformManager.getScraper(platform);
    const collection = platformManager.getCollection(platform);

    // Step 5: Sanitize and validate URLs
    const urlSanitizer = require('../utils/urlSanitizer');
    const sanitizedUrls = urlSanitizer.sanitizeUrls(urlsForPlatform, platform);

    logger.info('URLs sanitized', {
      platform,
      original: urlsForPlatform.length,
      sanitized: sanitizedUrls.length,
      removed: urlsForPlatform.length - sanitizedUrls.length
    });

    if (sanitizedUrls.length === 0) {
      logger.warn(`No valid URLs to scrape for ${platform} after sanitization`);
      return { success: true, postsScraped: 0, postsFailed: 0 };
    }

    // Step 6: Trigger scraping
    // RESPECT LIMIT: Read from settings
    const platformLimit = campaign.settings?.[`${platform}_post_limit`] || campaign.settings?.generic_post_limit || 100;
    const urlsToScrape = sanitizedUrls.slice(0, platformLimit);

    if (sanitizedUrls.length > platformLimit) {
      logger.info(`Limiting scraping to ${platformLimit} posts per settings (originally ${sanitizedUrls.length} valid URLs)`);
    }

    logger.info(`Step 6: Triggering ${platform} scrape...`, {
      urlCount: urlsToScrape.length
    }); const snapshotId = await scraper.triggerScrape(urlsToScrape);

    // Update run document with snapshot ID
    if (!run.snapshot_ids) {
      run.snapshot_ids = {};
    }
    run.snapshot_ids[platform] = snapshotId;
    run.snapshot_status = 'running';
    run.updated_at = new Date().toISOString();
    await campaignRepository.updateRun(runId, run);

    logger.info('Snapshot triggered', { platform, snapshotId });

    // Step 6: Monitor snapshot
    logger.info('Step 6: Monitoring snapshot...');
    await snapshotMonitor.waitForCompletion(
      snapshotId,
      (id) => scraper.checkStatus(id),
      {
        pollInterval: 10000,
        timeout: 1800000,
        onProgress: (status) => {
          logger.debug('Progress update', { platform, status: status.status });
        }
      }
    );

    // Step 7: Download results
    logger.info('Step 7: Downloading snapshot...');
    let posts = [];
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        posts = await scraper.downloadSnapshot(snapshotId);
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

    logger.info(`Downloaded ${posts.length} posts for ${platform}`);

    // Step 8: Store posts with optional relevance filtering and deduplication
    logger.info('Step 8: Storing posts with filtering and deduplication...');

    const relevanceFilter = require('../modules/analysis/relevanceFilter');
    const postRepository = require('../modules/repositories/postRepository');

    // Ensure settings is an object (Postgres/CrateDB might return it as a string if double-serialized)
    let settings = campaign.settings || {};
    if (typeof settings === 'string') {
      try {
        settings = JSON.parse(settings);
      } catch (e) {
        logger.warn('Failed to parse campaign settings string', { error: e.message });
        settings = {};
      }
    }

    const enableRelevanceFilter = settings.enable_relevance_filter || false;
    const relevanceThreshold = settings.relevance_threshold || 0.7;

    const now = new Date().toISOString();
    let successCount = 0;
    let failCount = 0;
    let filteredCount = 0;
    let updatedCount = 0;
    let newCount = 0;

    const runNumber = run.run_number;

    logger.info('Processing settings', {
      relevanceFilterEnabled: enableRelevanceFilter,
      relevanceThreshold,
      totalPosts: posts.length
    });

    for (let rawPost of posts) {
      try {
        // Optional: Relevance filtering
        if (enableRelevanceFilter) {
          const relevanceCheck = await relevanceFilter.checkRelevance(
            rawPost,
            campaign.search_query,
            relevanceThreshold
          );

          if (!relevanceCheck.isRelevant) {
            logger.info('Post filtered out (not relevant)', {
              url: rawPost.url,
              score: relevanceCheck.score,
              reason: relevanceCheck.reason
            });
            filteredCount++;
            continue;
          }

          logger.debug('Post passed relevance filter', {
            url: rawPost.url,
            score: relevanceCheck.score
          });
        }

        // SAVE POST (Centralized Deduplication)
        const saveResult = await postRepository.saveScrapedPost(
          platform,
          rawPost,
          campaignId,
          runId,
          runNumber
        );

        if (saveResult.isNew) {
          newCount++;
        } else {
          updatedCount++;
        }

        successCount++;

        // Periodic heartbeat to prevent run from being marked as stuck
        if (successCount % 10 === 0) {
          try {
            const currentRun = await campaignRepository.getRun(runId);
            if (currentRun) {
              currentRun.updated_at = new Date().toISOString();
              await campaignRepository.updateRun(runId, currentRun);
            }
          } catch (e) {
            // Non-critical
          }
        }
      } catch (error) {
        logger.error('Failed to process post', {
          url: rawPost.url,
          error: error.message
        });
        failCount++;
      }
    }

    logger.info('Posts processed', {
      platform,
      total: posts.length,
      new: newCount,
      updated: updatedCount,
      filtered: filteredCount,
      failed: failCount,
      relevanceFilterEnabled: enableRelevanceFilter
    });

    // Step 9: Update run document with stats (per platform)
    logger.info('Step 9: Updating run document...');

    // CRITICAL: Reload run to avoid overwriting updates from parallel scrapers
    const finalRun = await campaignRepository.getRun(runId);
    if (!finalRun) throw new Error(`Final run document re-load failed: ${runId}`);

    if (!finalRun.stats.by_platform) {
      finalRun.stats.by_platform = {};
    }

    finalRun.stats.by_platform[platform] = {
      posts_scraped: successCount,
      posts_failed: failCount,
      posts_filtered: filteredCount,
      posts_new: newCount,
      posts_updated: updatedCount
    };

    // Update overall stats INCREMENTALLY
    finalRun.stats.posts_scraped = (finalRun.stats.posts_scraped || 0) + successCount;
    finalRun.stats.posts_failed = (finalRun.stats.posts_failed || 0) + failCount;
    finalRun.updated_at = now;

    await campaignRepository.updateRun(runId, finalRun);

    logger.info(`=== ${platform.toUpperCase()} Scraping Completed Successfully ===`, {
      campaignId,
      runId,
      platform,
      postsScraped: successCount,
      postsFiltered: filteredCount,
      postsFailed: failCount
    });

    return {
      success: true,
      postsScraped: successCount,
      postsFiltered: filteredCount,
      postsFailed: failCount
    };

  } catch (error) {
    logger.error('Scraping failed', {
      campaignId,
      runId,
      platform: specificPlatform,
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    logger.clearContext();
  }
}

// End of script


// Get parameters from command line
const campaignId = process.argv[2];
const runId = process.argv[3];
const specificPlatform = process.argv[4] || null;

if (!campaignId || !runId) {
  console.error('Usage: npm run scrape-posts <campaign-id> <run-id> [platform]');
  process.exit(1);
}

// Run the script
scrapePosts(campaignId, runId, specificPlatform)
  .then((result) => {
    logger.info('Script finished successfully', result);
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

