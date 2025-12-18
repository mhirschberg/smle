const { v4: uuidv4 } = require('uuid');
const couchbaseClient = require('../modules/storage/couchbaseClient');
const serpFetcher = require('../modules/serp/serpFetcher');
const urlExtractor = require('../modules/serp/urlExtractor');
const logger = require('../utils/logger');

async function runSerpSearch(campaignId, runId, specificPlatform = null) {
  try {
    logger.setContext(campaignId, runId);
    
    // Validate parameters
    if (!campaignId || !runId) {
      throw new Error('Campaign ID and Run ID are required. Usage: npm run serp <campaign-id> <run-id> [platform]');
    }

    // Step 1: Connect to Couchbase
    logger.info('Step 1: Connecting to Couchbase...');
    await couchbaseClient.connect();

    // Step 2: Load campaign
    logger.info('Step 2: Loading campaign...', { campaignId });
    const campaign = await couchbaseClient.get('searches', campaignId);
    
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    // Step 3: Load run
    logger.info('Step 3: Loading run...', { runId });
    const run = await couchbaseClient.get('search_runs', runId);
    
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const searchQuery = campaign.search_query;
    const googleDomain = campaign.google_domain || 'google.com';
    
    // Determine which platform(s) to search
    let platformsToSearch = [];
    if (specificPlatform) {
      platformsToSearch = [specificPlatform];
    } else if (campaign.platforms) {
      platformsToSearch = campaign.platforms;
    } else {
      platformsToSearch = [campaign.platform];
    }

    logger.info('=== Starting SERP Search ===', {
      campaignId,
      runId,
      runNumber: run.run_number,
      query: searchQuery,
      platforms: platformsToSearch
    });

    // Store results for THIS platform only (to avoid race conditions)
    const myPlatformUrls = {};
    const myGlobalUrls = [];

    // Step 4: Fetch SERP results for each platform
    for (const platform of platformsToSearch) {
      logger.info(`Step 4: Fetching SERP results for ${platform}...`);
      
      try {
        const serpResults = await serpFetcher.fetchResultsForPlatform(
          searchQuery, 
          platform, 
          googleDomain
        );
        logger.info(`Fetched ${serpResults.length} SERP results for ${platform}`);
        
        // Step 5: Extract platform URLs
        logger.info(`Step 5: Extracting ${platform} URLs...`);
        const platformUrls = urlExtractor.extractUrls(serpResults, platform);
        logger.info(`Extracted ${platformUrls.length} unique ${platform} URLs`);
        
        if (platformUrls.length === 0) {
          logger.warn(`No URLs found for ${platform}`);
          myPlatformUrls[platform] = [];
        } else {
          // Store in our local object
          myPlatformUrls[platform] = platformUrls;
          myGlobalUrls.push(...platformUrls);
          
          // Print sample URLs
          logger.info(`Sample ${platform} URLs found:`);
          platformUrls.slice(0, 3).forEach((url, idx) => {
            console.log(`    ${idx + 1}. ${url}`);
          });
          if (platformUrls.length > 3) {
            console.log(`    ... and ${platformUrls.length - 3} more`);
          }
        }
      } catch (error) {
        logger.error(`Failed to fetch ${platform} URLs`, { error: error.message });
        myPlatformUrls[platform] = [];
      }
    }
    
    // Step 6: Update run document (RELOAD FIRST to avoid race conditions)
    logger.info('Step 6: Updating run document...');
    const now = new Date().toISOString();
    
    // CRITICAL: Reload run to get latest state from parallel processes
    const latestRun = await couchbaseClient.get('search_runs', runId);
    
    if (!latestRun) {
      throw new Error(`Run not found after reload: ${runId}`);
    }
    
    // Initialize if needed
    if (!latestRun.links_by_platform) {
      latestRun.links_by_platform = {};
    }
    if (!latestRun.links) {
      latestRun.links = [];
    }
    
    // Merge OUR platform's URLs into the latest run
    Object.keys(myPlatformUrls).forEach(platform => {
      latestRun.links_by_platform[platform] = myPlatformUrls[platform];
      logger.info(`Stored ${myPlatformUrls[platform].length} URLs for ${platform}`);
    });
    
    // Add to global links (avoiding duplicates)
    const existingUrls = new Set(latestRun.links || []);
    myGlobalUrls.forEach(url => {
      if (!existingUrls.has(url)) {
        latestRun.links.push(url);
      }
    });
    
    latestRun.updated_at = now;
    latestRun.stats.urls_found = latestRun.links.length;
    
    // Save
    await couchbaseClient.upsert('search_runs', runId, latestRun);
    
    logger.info('=== SERP Search Completed Successfully ===', {
      campaignId,
      runId,
      totalUrls: myGlobalUrls.length,
      byPlatform: Object.entries(myPlatformUrls)
        .map(([p, urls]) => `${p}: ${urls.length}`)
        .join(', ')
    });
    
  } catch (error) {
    logger.error('SERP search failed', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    await couchbaseClient.disconnect();
    logger.clearContext();
  }
}

// Get parameters from command line
const campaignId = process.argv[2];
const runId = process.argv[3];
const specificPlatform = process.argv[4] || null;

// Run the script
runSerpSearch(campaignId, runId, specificPlatform)
  .then(() => {
    logger.info('Script finished successfully');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

