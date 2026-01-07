const { v4: uuidv4 } = require('uuid');
const dbFactory = require('../modules/storage/dbFactory');
const campaignRepository = require('../modules/repositories/campaignRepository');
const redditScraper = require('../modules/scraper/redditScraper');
const serpFetcher = require('../modules/serp/serpFetcher');
const urlExtractor = require('../modules/serp/urlExtractor');
const snapshotMonitor = require('../modules/scraper/snapshotMonitor');
const relevanceFilter = require('../modules/analysis/relevanceFilter');
const logger = require('../utils/logger');

async function searchRedditDual(campaignId, runId) {
  let db;
  try {
    logger.setContext(campaignId, runId);

    logger.info('=== Starting Reddit DUAL Search (SERP + Keyword) ===', { campaignId, runId });

    // Step 1: Connect to DB
    logger.info('Step 1: Connecting to Database...');
    db = await dbFactory.getDB();

    // Step 2: Load campaign and run
    logger.info('Step 2: Loading campaign and run...');
    const campaign = await campaignRepository.getById(campaignId);
    const run = await campaignRepository.getRun(runId);

    if (!campaign || !run) {
      throw new Error('Campaign or run not found');
    }

    const searchQuery = campaign.search_query;
    const googleDomain = campaign.google_domain || 'google.com';
    let settings = campaign.settings || {};
    if (typeof settings === 'string') {
      try {
        settings = JSON.parse(settings);
      } catch (e) {
        settings = {};
      }
    }
    const postLimit = settings.reddit_post_limit || settings.generic_post_limit || 100;
    const enableRelevanceFilter = settings.enable_relevance_filter || false;
    const relevanceThreshold = settings.relevance_threshold || 0.7;

    logger.info('Starting dual search', {
      query: searchQuery,
      postLimit,
      runNumber: run.run_number
    });

    // PART 1: SERP Search for Reddit URLs
    logger.info('Part 1/2: Fetching Reddit URLs via Google SERP...');

    let serpUrls = [];
    try {
      const serpResults = await serpFetcher.fetchResultsForPlatform(
        searchQuery,
        'reddit',
        googleDomain
      );

      logger.info(`Fetched ${serpResults.length} SERP results`);

      serpUrls = urlExtractor.extractUrls(serpResults, 'reddit');
      logger.info(`Extracted ${serpUrls.length} Reddit URLs from SERP`);
    } catch (error) {
      logger.error('SERP search failed', { error: error.message });
    }

    // PART 2: Keyword Search for Reddit Posts
    logger.info('Part 2/2: Fetching Reddit posts via keyword search...');

    const keywordOptions = {
      date: 'Past month',
      num_of_posts: postLimit,
      sort_by: 'Hot'
    };

    const snapshotId = await redditScraper.triggerKeywordSearch(searchQuery, keywordOptions);

    // RELOAD run to get latest state from parallel processes
    const latestRun = await campaignRepository.getRun(runId);

    if (!latestRun) {
      throw new Error(`Run document re-load failed: ${runId}`);
    }

    latestRun.snapshot_id = snapshotId;
    latestRun.snapshot_status = 'running';
    latestRun.updated_at = new Date().toISOString();
    await campaignRepository.updateRun(runId, latestRun);

    logger.info('Keyword search triggered', { snapshotId });

    // Monitor snapshot
    await snapshotMonitor.waitForCompletion(
      snapshotId,
      (id) => redditScraper.checkStatus(id),
      {
        pollInterval: 10000,
        timeout: 1800000
      }
    );

    // Download keyword results
    let keywordPosts = [];
    let retries = 0;

    while (retries < 3) {
      try {
        keywordPosts = await redditScraper.downloadSnapshot(snapshotId);
        break;
      } catch (error) {
        retries++;
        if (retries >= 3) throw error;
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    logger.info(`Downloaded ${keywordPosts.length} Reddit posts from keyword search`);

    // RELOAD run again to get latest state
    const finalRun = await campaignRepository.getRun(runId);

    if (!finalRun) {
      throw new Error(`Final run document re-load failed: ${runId}`);
    }

    // Initialize if needed
    if (!finalRun.links_by_platform) {
      finalRun.links_by_platform = {};
    }
    if (!finalRun.links) {
      finalRun.links = [];
    }

    // Store SERP URLs for Reddit
    finalRun.links_by_platform.reddit = serpUrls;

    // APPEND Reddit URLs to global links (don't replace!)
    const existingUrls = new Set(finalRun.links);
    serpUrls.forEach(url => {
      if (!existingUrls.has(url)) {
        finalRun.links.push(url);
      }
    });

    const postRepository = require('../modules/repositories/postRepository');
    const now = new Date().toISOString();
    let keywordNew = 0;
    let keywordUpdated = 0;
    let keywordStored = 0;
    const runNumber = finalRun.run_number;
    const keywordUrls = new Set();
    let filteredCount = 0;

    for (const rawPost of keywordPosts) {
      try {
        if (enableRelevanceFilter) {
          const relevanceCheck = await relevanceFilter.checkRelevance(
            rawPost,
            searchQuery,
            relevanceThreshold
          );

          if (!relevanceCheck.isRelevant) {
            logger.info('Post filtered out by relevance', {
              url: rawPost.url,
              score: relevanceCheck.score,
              reason: relevanceCheck.reason
            });
            filteredCount++;
            continue;
          }
        }

        keywordUrls.add(rawPost.url);

        const result = await postRepository.saveScrapedPost(
          'reddit',
          rawPost,
          campaignId,
          runId,
          runNumber
        );

        if (result.isNew) {
          keywordNew++;
        } else {
          keywordUpdated++;
        }
        keywordStored++;

        // Periodic heartbeat
        if (keywordStored % 10 === 0) {
          try {
            const currentRun = await campaignRepository.getRun(runId);
            if (currentRun) {
              currentRun.updated_at = new Date().toISOString();
              await campaignRepository.updateRun(runId, currentRun);
            }
          } catch (e) { }
        }
      } catch (error) {
        logger.error('Failed to store keyword post', { url: rawPost.url, error: error.message });
      }
    }

    logger.info('Keyword posts stored', { total: keywordStored, new: keywordNew, updated: keywordUpdated, filtered: filteredCount });

    // Filter SERP URLs to avoid duplicates with keyword results
    const uniqueSerpUrls = serpUrls.filter(url => !keywordUrls.has(url));

    logger.info('URL deduplication', {
      serpUrls: serpUrls.length,
      keywordUrls: keywordUrls.size,
      uniqueSerpUrls: uniqueSerpUrls.length
    });

    // Update run with combined stats
    // CRITICAL: Increment global urls_found by the amount of unique SERP URLs we found
    finalRun.stats.urls_found = (finalRun.stats.urls_found || 0) + uniqueSerpUrls.length;

    // Add keyword posts to posts_scraped (since they are already scraped)
    finalRun.stats.posts_scraped = (finalRun.stats.posts_scraped || 0) + keywordStored;
    finalRun.stats.posts_new = (finalRun.stats.posts_new || 0) + keywordNew;
    finalRun.stats.posts_updated = (finalRun.stats.posts_updated || 0) + keywordUpdated;

    if (!finalRun.stats.by_platform) finalRun.stats.by_platform = {};
    finalRun.stats.by_platform.reddit = {
      serp_urls: uniqueSerpUrls.length,
      keyword_posts: keywordStored,
      posts_new: keywordNew,
      posts_updated: keywordUpdated
    };

    finalRun.dual_search_stats = {
      serp_urls: uniqueSerpUrls.length,
      keyword_posts: keywordStored,
      duplicates_removed: serpUrls.length - uniqueSerpUrls.length
    };
    finalRun.updated_at = now;

    await campaignRepository.updateRun(runId, finalRun);

    logger.info('=== Reddit Dual Search Completed ===', {
      campaignId,
      runId,
      serpUrls: uniqueSerpUrls.length,
      keywordPosts: keywordStored,
      total: uniqueSerpUrls.length + keywordStored
    });

    return {
      success: true,
      serpUrls: uniqueSerpUrls.length,
      keywordPosts: keywordStored
    };

  } catch (error) {
    logger.error('Dual search failed', {
      campaignId,
      runId,
      error: error.message
    });
    throw error;
  } finally {
    if (db) await db.disconnect();
    logger.clearContext();
  }
}

const campaignId = process.argv[2];
const runId = process.argv[3];

if (!campaignId || !runId) {
  console.error('Usage: node src/scripts/searchRedditDual.js <campaign-id> <run-id>');
  process.exit(1);
}

searchRedditDual(campaignId, runId)
  .then((result) => {
    logger.info('Script finished successfully', result);
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

