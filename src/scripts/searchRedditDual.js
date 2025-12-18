const { v4: uuidv4 } = require('uuid');
const couchbaseClient = require('../modules/storage/couchbaseClient');
const redditScraper = require('../modules/scraper/redditScraper');
const serpFetcher = require('../modules/serp/serpFetcher');
const urlExtractor = require('../modules/serp/urlExtractor');
const snapshotMonitor = require('../modules/scraper/snapshotMonitor');
const logger = require('../utils/logger');

async function searchRedditDual(campaignId, runId) {
  try {
    logger.setContext(campaignId, runId);
    
    logger.info('=== Starting Reddit DUAL Search (SERP + Keyword) ===', { campaignId, runId });
    
    await couchbaseClient.connect();
    
    const campaign = await couchbaseClient.get('searches', campaignId);
    const run = await couchbaseClient.get('search_runs', runId);
    
    if (!campaign || !run) {
      throw new Error('Campaign or run not found');
    }
    
    const searchQuery = campaign.search_query;
    const googleDomain = campaign.google_domain || 'google.com';
    const postLimit = campaign.settings?.reddit_post_limit || 100;
    
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
    const latestRun = await couchbaseClient.get('search_runs', runId);
    
    latestRun.snapshot_id = snapshotId;
    latestRun.snapshot_status = 'running';
    await couchbaseClient.upsert('search_runs', runId, latestRun);
    
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
    const finalRun = await couchbaseClient.get('search_runs', runId);
    
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
    
    // Store keyword posts directly (they're already scraped)
    logger.info('Storing keyword posts directly...');
    
    const now = new Date().toISOString();
    let keywordStored = 0;
    const keywordUrls = new Set();
    
    for (const rawPost of keywordPosts) {
      try {
        keywordUrls.add(rawPost.url);
        
        const postId = uuidv4();
        const postDocument = {
          id: postId,
          campaign_id: campaignId,
          run_id: runId,
          platform: 'reddit',
          platform_url: rawPost.url,
          post_id: rawPost.post_id,
          content_type: 'post',
          created_at: now,
          scraped_at: rawPost.timestamp || now,
          analysis_status: 'pending',
          source: 'keyword_search',
          
          raw_data: {
            user_posted: rawPost.user_posted,
            title: rawPost.title,
            description: rawPost.description,
            description_markdown: rawPost.description_markdown,
            community_name: rawPost.community_name,
            community_url: rawPost.community_url,
            community_description: rawPost.community_description,
            community_members_num: rawPost.community_members_num,
            subreddit_icon_image: rawPost.subreddit_icon_image,
            date_posted: rawPost.date_posted,
            engagement: {
              upvotes: rawPost.num_upvotes || 0,
              comments: rawPost.num_comments || 0,
              post_karma: rawPost.post_karma || 0
            },
            media: {
              photos: rawPost.photos || [],
              videos: rawPost.videos || [],
              embedded_links: rawPost.embedded_links || []
            },
            tag: rawPost.tag,
            related_posts: rawPost.related_posts || [],
            comments: rawPost.comments || [],
            community_rank: rawPost.community_rank,
            bio_description: rawPost.bio_description
          },
          
          analysis: {
            sentiment_score: null,
            sentiment_label: null,
            key_topics: [],
            brand_mentioned: null,
            summary: null,
            language: null,
            embedding: null,
            analyzed_at: null,
            llm_model: null,
            error: null
          }
        };
        
        await couchbaseClient.insert('reddit_posts', postId, postDocument);
        keywordStored++;
        
      } catch (error) {
        logger.error('Failed to store keyword post', { url: rawPost.url, error: error.message });
      }
    }
    
    logger.info('Keyword posts stored', { count: keywordStored });
    
    // Filter SERP URLs to avoid duplicates with keyword results
    const uniqueSerpUrls = serpUrls.filter(url => !keywordUrls.has(url));
    
    logger.info('URL deduplication', {
      serpUrls: serpUrls.length,
      keywordUrls: keywordUrls.size,
      uniqueSerpUrls: uniqueSerpUrls.length
    });
    
    // Update run with combined stats
    finalRun.stats.urls_found = finalRun.links.length; // Total across ALL platforms
    finalRun.dual_search_stats = {
      serp_urls: uniqueSerpUrls.length,
      keyword_posts: keywordStored,
      duplicates_removed: serpUrls.length - uniqueSerpUrls.length
    };
    finalRun.updated_at = now;
    
    await couchbaseClient.upsert('search_runs', runId, finalRun);
    
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
    await couchbaseClient.disconnect();
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

