const { v4: uuidv4 } = require('uuid');
const dbFactory = require('../modules/storage/dbFactory');
const campaignRepository = require('../modules/repositories/campaignRepository');
const youtubeScraper = require('../modules/scraper/youtubeScraper');
const snapshotMonitor = require('../modules/scraper/snapshotMonitor');
const logger = require('../utils/logger');

async function searchYouTube(campaignId, runId) {
  let db;
  try {
    logger.setContext(campaignId, runId);
    logger.info('=== Starting YouTube Keyword Search ===', { campaignId, runId });

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
    const postLimit = campaign.settings?.youtube_post_limit || 100;

    logger.info('Campaign loaded', {
      campaignId,
      runId,
      runNumber: run.run_number,
      query: searchQuery,
      postLimit: postLimit
    });

    // Step 4: Trigger YouTube keyword search
    logger.info('Step 4: Triggering YouTube keyword search...');

    const searchOptions = {
      num_of_posts: postLimit
    };

    logger.info('Search options', searchOptions);

    const snapshotId = await youtubeScraper.triggerKeywordSearch(searchQuery, searchOptions);

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
      (id) => youtubeScraper.checkStatus(id),
      {
        pollInterval: 10000,
        timeout: 1800000
      }
    );

    // Step 6: Download results
    logger.info('Step 6: Downloading results...');
    let videos = [];
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        videos = await youtubeScraper.downloadSnapshot(snapshotId);
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

    logger.info(`Downloaded ${videos.length} YouTube videos`);

    // Step 7: Store videos directly
    logger.info('Step 7: Storing videos in database...');
    const now = new Date().toISOString();
    let successCount = 0;
    let failCount = 0;

    for (const rawVideo of videos) {
      try {
        const postId = uuidv4();

        const postDocument = {
          id: postId,
          campaign_id: campaignId,
          run_id: runId,
          platform: 'youtube',
          platform_url: rawVideo.url,
          post_id: rawVideo.video_id,
          shortcode: rawVideo.shortcode || rawVideo.video_id,
          content_type: 'video',
          created_at: now,
          scraped_at: rawVideo.timestamp || now,
          analysis_status: 'pending',

          raw_data: {
            user_posted: rawVideo.youtuber,
            youtuber_id: rawVideo.youtuber_id,
            channel_url: rawVideo.channel_url,
            is_verified: rawVideo.verified,

            handle_name: rawVideo.handle_name,
            avatar_img_channel: rawVideo.avatar_img_channel,
            subscribers: rawVideo.subscribers,

            title: rawVideo.title,
            description: rawVideo.description,

            hashtags: rawVideo.hashtags || [],
            tags: rawVideo.tags || [],

            date_posted: rawVideo.date_posted,

            engagement: {
              likes: rawVideo.likes || 0,
              views: rawVideo.views || 0,
              comments: rawVideo.num_comments || 0
            },

            media: {
              video_url: rawVideo.video_url,
              preview_image: rawVideo.preview_image,
              video_length: rawVideo.video_length,
              quality: rawVideo.quality,
              quality_label: rawVideo.quality_label
            },

            music: rawVideo.music,

            transcript: rawVideo.transcript,
            formatted_transcript: rawVideo.formatted_transcript || [],
            transcript_language: rawVideo.transcript_language || [],
            transcription_language: rawVideo.transcription_language,

            chapters: rawVideo.chapters || [],

            related_videos: rawVideo.related_videos || [],
            recommended_videos: rawVideo.recommended_videos || [],

            is_sponsored: rawVideo.is_sponsored,
            license: rawVideo.license,
            is_age_restricted: rawVideo.is_age_restricted,

            post_type: rawVideo.post_type
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

        await db.upsert('youtube_posts', postId, postDocument);
        successCount++;

      } catch (error) {
        logger.error('Failed to store video', {
          url: rawVideo.url,
          error: error.message
        });
        failCount++;
      }
    }

    logger.info('Videos stored', { success: successCount, failed: failCount });

    // Step 8: Update run with stats
    logger.info('Step 8: Updating run document...');

    // CRITICAL: Reload run to get latest updates from all other scripts
    const finalRun = await campaignRepository.getRun(runId);
    if (!finalRun) throw new Error(`Final run document re-load failed: ${runId}`);

    finalRun.snapshot_status = 'ready';

    // Update THIS platform's stats specifically
    if (!finalRun.stats.by_platform) finalRun.stats.by_platform = {};
    finalRun.stats.by_platform.youtube = {
      posts_found: successCount,
      posts_failed: failCount
    };

    // INCREMENT global counts instead of overwriting
    finalRun.stats.urls_found = (finalRun.stats.urls_found || 0) + videos.length;
    finalRun.stats.posts_scraped = (finalRun.stats.posts_scraped || 0) + successCount;
    finalRun.stats.posts_failed = (finalRun.stats.posts_failed || 0) + failCount;
    finalRun.updated_at = now;

    await campaignRepository.updateRun(runId, finalRun);

    logger.info('=== YouTube Search Completed Successfully ===', {
      campaignId,
      runId,
      videosFound: successCount,
      videosFailed: failCount
    });

    return {
      success: true,
      postsFound: successCount,
      postsFailed: failCount
    };

  } catch (error) {
    logger.error('YouTube search failed', {
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
  console.error('Usage: node src/scripts/searchYouTube.js <campaign-id> <run-id>');
  process.exit(1);
}

// Run the script
searchYouTube(campaignId, runId)
  .then((result) => {
    logger.info('Script finished successfully', result);
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

