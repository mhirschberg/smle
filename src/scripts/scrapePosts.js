const { v4: uuidv4 } = require('uuid');
const couchbaseClient = require('../modules/storage/couchbaseClient');
const platformManager = require('../modules/platforms/platformManager');
const snapshotMonitor = require('../modules/scraper/snapshotMonitor');
const logger = require('../utils/logger');

async function scrapePosts(campaignId, runId, specificPlatform = null) {
  try {
    logger.setContext(campaignId, runId);
    logger.info('=== Starting Post Scraping ===', { campaignId, runId, specificPlatform });
    
    // Step 1: Connect to Couchbase
    logger.info('Step 1: Connecting to Couchbase...');
    await couchbaseClient.connect();
    
    // Step 2: Fetch run document
    logger.info('Step 2: Fetching run document...');
    const run = await couchbaseClient.get('search_runs', runId);
    
    if (!run) {
      throw new Error(`Run document not found: ${runId}`);
    }
    
    // Step 3: Fetch campaign document
    logger.info('Step 3: Fetching campaign document...');
    const campaign = await couchbaseClient.get('searches', campaignId);
    
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
const urlsToScrape = sanitizedUrls;
logger.info(`Step 6: Triggering ${platform} scrape...`, { 
  urlCount: urlsToScrape.length 
});const snapshotId = await scraper.triggerScrape(urlsToScrape);
    
    // Update run document with snapshot ID
    if (!run.snapshot_ids) {
      run.snapshot_ids = {};
    }
    run.snapshot_ids[platform] = snapshotId;
    run.snapshot_status = 'running';
    run.updated_at = new Date().toISOString();
    await couchbaseClient.upsert('search_runs', runId, run);
    
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
    
    const postDeduplicator = require('../modules/storage/postDeduplicator');
    const relevanceFilter = require('../modules/analysis/relevanceFilter');
    
    const enableRelevanceFilter = campaign.settings?.enable_relevance_filter || false;
    const relevanceThreshold = campaign.settings?.relevance_threshold || 0.7;
    
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
    
    for (const rawPost of posts) {
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
        
        // Check if post already exists (deduplication)
        const existing = await postDeduplicator.findExistingPost(rawPost.url, collection);
        
        if (existing) {
          await postDeduplicator.updateExistingPost(
            existing.docId,
            existing.post,
            rawPost,
            runNumber,
            runId,
            collection
          );
          
          updatedCount++;
          successCount++;
        } else {
          const postId = uuidv4();
          const baseDoc = postDeduplicator.createNewPost(
            postId,
            rawPost,
            platform,
            campaignId,
            runId,
            runNumber,
            now
          );
          
          const postDocument = mapPostToPlatform(rawPost, platform, campaignId, runId, now, baseDoc);
          
          await couchbaseClient.insert(collection, postId, postDocument);
          newCount++;
          successCount++;
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
    
    if (!run.stats.by_platform) {
      run.stats.by_platform = {};
    }
    
    run.stats.by_platform[platform] = {
      posts_scraped: successCount,
      posts_failed: failCount,
      posts_filtered: filteredCount,
      posts_new: newCount,
      posts_updated: updatedCount
    };
    
    // Update overall stats
    run.stats.posts_scraped = (run.stats.posts_scraped || 0) + successCount;
    run.stats.posts_failed = (run.stats.posts_failed || 0) + failCount;
    run.updated_at = now;
    
    await couchbaseClient.upsert('search_runs', runId, run);
    
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
    await couchbaseClient.disconnect();
    logger.clearContext();
  }
}

/**
 * Map raw post data to platform-specific structure
 */
function mapPostToPlatform(rawPost, platform, campaignId, runId, timestamp, baseDoc = null) {
  // Ensure platform is clean
  platform = platform.trim().toLowerCase();
  
  // Use provided baseDoc or create default
  const baseDocument = baseDoc || {
    id: require('uuid').v4(),
    campaign_id: campaignId,
    run_id: runId,
    platform: platform,
    platform_url: rawPost.url,
    post_id: rawPost.post_id || rawPost.id,
    created_at: timestamp,
    scraped_at: rawPost.timestamp || timestamp,
    analysis_status: 'pending',
    first_seen_run: 1,
    last_seen_run: 1,
    total_appearances: 1,
    engagement_history: [],
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

  switch (platform) {
    case 'instagram':
      const contentType = rawPost.url?.includes('/reel/') ? 'reel' : 'post';
      return {
        ...baseDocument,
        shortcode: rawPost.shortcode,
        content_type: contentType,
        raw_data: {
          user_posted: rawPost.user_posted,
          is_verified: rawPost.is_verified,
          profile_image_link: rawPost.profile_image_link,
          user_profile_url: rawPost.user_profile_url,
          description: rawPost.description,
          hashtags: rawPost.hashtags || [],
          date_posted: rawPost.date_posted,
          engagement: {
            likes: rawPost.likes || 0,
            views: rawPost.views || 0,
            video_play_count: rawPost.video_play_count || 0,
            num_comments: rawPost.num_comments || 0
          },
          top_comments: rawPost.top_comments || [],
          media: {
            thumbnail: rawPost.thumbnail,
            video_url: rawPost.video_url,
            audio_url: rawPost.audio_url,
            length: rawPost.length
          },
          product_type: rawPost.product_type,
          is_paid_partnership: rawPost.is_paid_partnership,
          coauthor_producers: rawPost.coauthor_producers || [],
          tagged_users: rawPost.tagged_users || []
        }
      };
    
    case 'tiktok':
      return {
        ...baseDocument,
        shortcode: rawPost.shortcode,
        content_type: 'video',
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
        }
      };
    
    case 'twitter':
      return {
        ...baseDocument,
        post_id: rawPost.id,
        content_type: 'tweet',
        raw_data: {
          user_posted: rawPost.user_posted,
          user_id: rawPost.user_id,
          name: rawPost.name,
          is_verified: rawPost.is_verified,
          verification_type: rawPost.verification_type,
          profile_image_link: rawPost.profile_image_link,
          biography: rawPost.biography,
          followers: rawPost.followers,
          following: rawPost.following,
          posts_count: rawPost.posts_count,
          description: rawPost.description,
          hashtags: rawPost.hashtags || [],
          date_posted: rawPost.date_posted,
          engagement: {
            likes: rawPost.likes || 0,
            replies: rawPost.replies || 0,
            reposts: rawPost.reposts || 0,
            quotes: rawPost.quotes || 0,
            bookmarks: rawPost.bookmarks || 0,
            views: rawPost.views || 0
          },
          media: {
            photos: rawPost.photos || [],
            videos: rawPost.videos || [],
            external_image_urls: rawPost.external_image_urls || [],
            external_video_urls: rawPost.external_video_urls || []
          },
          quoted_post: rawPost.quoted_post,
          parent_post_details: rawPost.parent_post_details,
          tagged_users: rawPost.tagged_users || [],
          external_url: rawPost.external_url,
          context_added: rawPost.context_added
        }
      };
    
    case 'reddit':
      return {
        ...baseDocument,
        post_id: rawPost.post_id,
        content_type: 'post',
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
        }
      };
    
    case 'facebook':
      return {
        ...baseDocument,
        post_id: rawPost.post_id,
        shortcode: rawPost.shortcode,
        content_type: rawPost.post_type || 'post',
        raw_data: {
          user_posted: rawPost.user_username_raw || rawPost.user_handle,
          user_handle: rawPost.user_handle || rawPost.profile_handle,
          profile_id: rawPost.profile_id,
          user_url: rawPost.user_url,
          page_url: rawPost.page_url,
          is_verified: rawPost.page_is_verified,
          page_logo: rawPost.page_logo,
          avatar_image_url: rawPost.avatar_image_url,
          header_image: rawPost.header_image,
          content: rawPost.content,
          hashtags: rawPost.hashtags || [],
          date_posted: rawPost.date_posted,
          engagement: {
            likes: rawPost.likes || 0,
            comments: rawPost.num_comments || 0,
            shares: rawPost.num_shares || 0,
            views: rawPost.video_view_count || rawPost.play_count || 0
          },
          likes_breakdown: rawPost.num_likes_type || [],
          media: {
            post_image: rawPost.post_image,
            attachments: rawPost.attachments || []
          },
          post_external_link: rawPost.post_external_link,
          post_external_title: rawPost.post_external_title,
          page_likes: rawPost.page_likes,
          page_followers: rawPost.page_followers,
          is_sponsored: rawPost.is_sponsored,
          sponsor_name: rawPost.sponsor_name,
          has_handshake: rawPost.has_handshake,
          original_post: rawPost.original_post,
          marketplace_price: rawPost.marketplace_price,
          delegate_page_id: rawPost.delegate_page_id
        }
      };
    
    case 'youtube':
      return {
        ...baseDocument,
        post_id: rawPost.video_id,
        shortcode: rawPost.shortcode || rawPost.video_id,
        content_type: 'video',
        raw_data: {
          user_posted: rawPost.youtuber,
          youtuber_id: rawPost.youtuber_id,
          channel_url: rawPost.channel_url,
          is_verified: rawPost.verified,
          handle_name: rawPost.handle_name,
          avatar_img_channel: rawPost.avatar_img_channel,
          subscribers: rawPost.subscribers,
          title: rawPost.title,
          description: rawPost.description,
          hashtags: rawPost.hashtags || [],
          tags: rawPost.tags || [],
          date_posted: rawPost.date_posted,
          engagement: {
            likes: rawPost.likes || 0,
            views: rawPost.views || 0,
            comments: rawPost.num_comments || 0
          },
          media: {
            video_url: rawPost.video_url,
            preview_image: rawPost.preview_image,
            video_length: rawPost.video_length,
            quality: rawPost.quality,
            quality_label: rawPost.quality_label
          },
          music: rawPost.music,
          transcript: rawPost.transcript,
          formatted_transcript: rawPost.formatted_transcript || [],
          transcript_language: rawPost.transcript_language || [],
          transcription_language: rawPost.transcription_language,
          chapters: rawPost.chapters || [],
          related_videos: rawPost.related_videos || [],
          recommended_videos: rawPost.recommended_videos || [],
          is_sponsored: rawPost.is_sponsored,
          license: rawPost.license,
          is_age_restricted: rawPost.is_age_restricted,
          post_type: rawPost.post_type
        }
      };
    
    case 'linkedin':
      return {
        ...baseDocument,
        post_id: rawPost.id,
        content_type: rawPost.post_type || 'post',
        raw_data: {
          user_posted: rawPost.user_id,
          user_url: rawPost.use_url,
          user_title: rawPost.user_title,
          author_profile_pic: rawPost.author_profile_pic,
          user_followers: rawPost.user_followers,
          user_connections: rawPost.num_connections,
          headline: rawPost.headline,
          title: rawPost.title,
          post_text: rawPost.post_text,
          original_post_text: rawPost.original_post_text,
          post_text_html: rawPost.post_text_html,
          hashtags: rawPost.hashtags || [],
          date_posted: rawPost.date_posted,
          engagement: {
            likes: rawPost.num_likes || 0,
            comments: rawPost.num_comments || 0
          },
          media: {
            images: rawPost.images || [],
            videos: rawPost.videos || [],
            video_thumbnail: rawPost.video_thumbnail,
            video_duration: rawPost.video_duration,
            document_cover_image: rawPost.document_cover_image,
            document_page_count: rawPost.document_page_count
          },
          embedded_links: rawPost.embedded_links || [],
          external_link_data: rawPost.external_link_data,
          top_visible_comments: rawPost.top_visible_comments || [],
          tagged_companies: rawPost.tagged_companies || [],
          tagged_people: rawPost.tagged_people || [],
          repost: rawPost.repost,
          account_type: rawPost.account_type,
          user_posts: rawPost.user_posts,
          user_articles: rawPost.user_articles,
          more_articles_by_user: rawPost.more_articles_by_user || [],
          more_relevant_posts: rawPost.more_relevant_posts || []
        }
      };
    
    default:
      logger.error('Unsupported platform in mapPostToPlatform', { 
        platform,
        platformType: typeof platform,
        rawPlatform: JSON.stringify(platform),
        url: rawPost.url
      });
      throw new Error(`Unsupported platform: ${platform}`);
  }
}


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

