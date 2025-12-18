const { v4: uuidv4 } = require('uuid');
const couchbaseClient = require('../modules/storage/couchbaseClient');
const tiktokScraper = require('../modules/scraper/tiktokScraper');
const snapshotMonitor = require('../modules/scraper/snapshotMonitor');
const logger = require('../utils/logger');

async function searchTikTok(campaignId, runId) {
  try {
    logger.clearContext();
    logger.info('=== Starting TikTok Keyword Search ===', { campaignId, runId });
    
    // Step 1: Connect to Couchbase
    logger.info('Step 1: Connecting to Couchbase...');
    await couchbaseClient.connect();
    
    // Step 2: Load campaign
    logger.info('Step 2: Loading campaign...');
    const campaign = await couchbaseClient.get('searches', campaignId);
    
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }
    
    // Step 3: Load run
    logger.info('Step 3: Loading run...');
    const run = await couchbaseClient.get('search_runs', runId);
    
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    
    const searchQuery = campaign.search_query;
    const postLimit = campaign.settings?.tiktok_post_limit || 100;
    
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
    
    // Update run with snapshot ID
    run.snapshot_id = snapshotId;
    run.snapshot_status = 'running';
    run.updated_at = new Date().toISOString();
    await couchbaseClient.upsert('search_runs', runId, run);
    
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
    
    // Step 6: Download results (posts are already included!)
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
    
    // Step 7: Store posts directly
    logger.info('Step 7: Storing posts in database...');
    const now = new Date().toISOString();
    let successCount = 0;
    let failCount = 0;
    
    for (const rawPost of posts) {
      try {
        const postId = uuidv4();
        
        const postDocument = {
          id: postId,
          campaign_id: campaignId,
          run_id: runId,
          platform: 'tiktok',
          platform_url: rawPost.url,
          post_id: rawPost.post_id,
          shortcode: rawPost.shortcode,
          content_type: 'video',
          created_at: now,
          scraped_at: rawPost.timestamp || now,
          analysis_status: 'pending',
          
          raw_data: {
            user_posted: rawPost.profile_username,
            is_verified: rawPost.is_verified,
            profile_image_link: rawPost.profile_avatar,
            user_profile_url: rawPost.profile_url,
            profile_id: rawPost.profile_id,
            profile_followers: rawPost.profile_followers,
            
            description: rawPost.description,
            hashtags: rawPost.hashtags || [],
            
            date_posted: rawPost.create_time,
            
            engagement: {
              likes: rawPost.digg_count || 0,
              shares: rawPost.share_count || 0,
              comments: rawPost.comment_count || 0,
              views: rawPost.play_count || 0,
              collects: rawPost.collect_count || 0
            },
            
            media: {
              video_url: rawPost.video_url,
              preview_image: rawPost.preview_image,
              video_duration: rawPost.video_duration,
              cdn_url: rawPost.cdn_url,
              width: rawPost.width,
              ratio: rawPost.ratio
            },
            
            music: rawPost.music ? {
              id: rawPost.music.id,
              title: rawPost.music.title || rawPost.original_sound,
              author: rawPost.music.authorname,
              original: rawPost.music.original,
              cover: rawPost.music.covermedium,
              play_url: rawPost.music.playurl
            } : null,
            
            region: rawPost.region,
            post_type: rawPost.post_type
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
        
        await couchbaseClient.insert('tiktok_posts', postId, postDocument);
        successCount++;
        
      } catch (error) {
        logger.error('Failed to store post', { 
          url: rawPost.url, 
          error: error.message 
        });
        failCount++;
      }
    }
    
    logger.info('Posts stored', { success: successCount, failed: failCount });
    
    // Step 8: Update run with stats
    logger.info('Step 8: Updating run document...');
    run.snapshot_status = 'ready';
    run.stats.urls_found = posts.length;
    run.stats.posts_scraped = successCount;
    run.stats.posts_failed = failCount;
    run.updated_at = now;
    
    await couchbaseClient.upsert('search_runs', runId, run);
    
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
    await couchbaseClient.disconnect();
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

