const { v4: uuidv4 } = require('uuid');
const campaignRepository = require('../modules/repositories/campaignRepository');
const redditScraper = require('../modules/scraper/redditScraper');
const snapshotMonitor = require('../modules/scraper/snapshotMonitor');
const logger = require('../utils/logger');

async function searchReddit(campaignId, runId) {
  try {
    logger.setContext(campaignId, runId);
    logger.info('=== Starting Reddit Keyword Search ===', { campaignId, runId });

    // Step 1: Connect to DB (implicitly done by repos)

    // Step 2: Load campaign
    logger.info('Step 2: Loading campaign...');
    const campaign = await campaignRepository.getById(campaignId);

    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    // Step 3: Load run
    logger.info('Step 3: Loading run...');
    const run = await campaignRepository.getRunById(runId);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const searchQuery = campaign.search_query;
    const postLimit = campaign.settings?.reddit_post_limit || 100;

    logger.info('Campaign loaded', {
      campaignId,
      runId,
      runNumber: run.run_number,
      query: searchQuery,
      postLimit: postLimit
    });

    // Step 4: Trigger Reddit keyword search
    logger.info('Step 4: Triggering Reddit keyword search...');

    const searchOptions = {
      date: 'Past month',
      num_of_posts: postLimit,
      sort_by: 'Hot'
    };

    logger.info('Search options', searchOptions);

    const snapshotId = await redditScraper.triggerKeywordSearch(searchQuery, searchOptions);

    // Update run with snapshot ID
    run.snapshot_id = snapshotId;
    run.snapshot_status = 'running';
    run.updated_at = new Date().toISOString();
    await campaignRepository.updateRun(runId, run);

    logger.info('Keyword search triggered', { snapshotId });

    // Step 5: Monitor snapshot
    logger.info('Step 5: Monitoring snapshot...');
    await snapshotMonitor.waitForCompletion(
      snapshotId,
      (id) => redditScraper.checkStatus(id),
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
        posts = await redditScraper.downloadSnapshot(snapshotId);
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

    logger.info(`Downloaded ${posts.length} Reddit posts`);

    // Step 7: Store posts directly
    logger.info('Step 7: Storing posts in database...');
    const now = new Date().toISOString();
    let successCount = 0;
    let failCount = 0;

    // Note: We need to use postRepository here. 
    // Since we don't have a single insert method in postRepository for this specific logic loop yet,
    // we can either add one or use the generic db insert via the repository if we expose it, or add `savePost` to repo.
    // For now I will import the dbFactory or PlatformManager to get the collection name and use a repository method.
    // I added `insert(platform, key, document)` to PostRepository.

    const postRepository = require('../modules/repositories/postRepository');

    for (const rawPost of posts) {
      try {
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

        await postRepository.insert('reddit', postId, postDocument);
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

    await campaignRepository.updateRun(runId, run);

    logger.info('=== Reddit Search Completed Successfully ===', {
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
    logger.error('Reddit search failed', {
      campaignId,
      runId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    // await couchbaseClient.disconnect(); // handled by db factory singleton or script exit for now
    // Actually, in these scripts we usually want to close connection...
    // The DBFactory maintains a singleton. We might need a proper shutdown method.
    // For now, allow process.exit to handle it or we can expose a disconnect method.
    const dbFactory = require('../modules/storage/dbFactory');
    if (dbFactory.instance) {
      await dbFactory.instance.disconnect();
    }
    logger.clearContext();
  }
}

// Get parameters from command line
const campaignId = process.argv[2];
const runId = process.argv[3];

if (!campaignId || !runId) {
  console.error('Usage: node src/scripts/searchReddit.js <campaign-id> <run-id>');
  process.exit(1);
}

// Run the script
searchReddit(campaignId, runId)
  .then((result) => {
    logger.info('Script finished successfully', result);
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

