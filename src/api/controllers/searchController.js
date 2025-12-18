const campaignRepository = require('../../modules/repositories/campaignRepository');
const postRepository = require('../../modules/repositories/postRepository');
const analyticsRepository = require('../../modules/repositories/analyticsRepository');
const platformManager = require('../../modules/platforms/platformManager');
const logger = require('../../utils/logger');
const { spawn } = require('child_process');
const path = require('path');

class SearchController {
  /**
   * Get all campaigns (searches)
   */
  async getAllSearches(req, res) {
    try {
      // Trigger background cleanup of stuck runs (older than 60 mins)
      campaignRepository.cleanupStuckRuns(60).catch(err => {
        logger.error('Background cleanup failed', { error: err.message });
      });

      const results = await campaignRepository.getAll();

      logger.info('Raw query results', { count: results.length });

      // Process each campaign to get run count - USE Promise.all for async operations
      const campaignPromises = results.map(async (campaignData) => {
        const campaignId = campaignData.id;

        // Get run count for this campaign
        let totalRuns = 0;
        let latestRun = null;
        let totalPosts = 0;

        try {
          totalRuns = await campaignRepository.getRunningCount(campaignId);

          if (totalRuns > 0) {
            latestRun = await campaignRepository.getLatestRun(campaignId);
          }

          // Get total posts count across all platforms
          totalPosts = await postRepository.getTotalPostCount(campaignId);

        } catch (err) {
          logger.warn('Failed to get run info', { campaignId, error: err.message });
        }

        return {
          ...campaignData,
          total_runs: totalRuns,
          latest_run: latestRun,
          total_posts: totalPosts,
          posts_count: totalPosts // Add both for compatibility
        };
      });

      const campaigns = await Promise.all(campaignPromises);

      logger.info('Fetched campaigns', { count: campaigns.length });

      res.json({ searches: campaigns });
    } catch (error) {
      logger.error('Failed to get campaigns', { error: error.message, stack: error.stack });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get single campaign by ID
   */
  async getSearchById(req, res) {
    try {
      const { id } = req.params;
      const campaign = await campaignRepository.getById(id);

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Get run count
      const runCount = await campaignRepository.getRunningCount(id);
      const totalPosts = await postRepository.getTotalPostCount(id);

      campaign.total_runs = runCount || 0;
      campaign.total_posts = totalPosts || 0;
      campaign.posts_count = totalPosts || 0;

      res.json({ search: campaign });
    } catch (error) {
      logger.error('Failed to get campaign', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get runs for a campaign
   */
  async getCampaignRuns(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const runs = await campaignRepository.getRuns(id, parseInt(limit), parseInt(offset));

      logger.info('Fetched campaign runs', { campaignId: id, count: runs.length });

      res.json({ runs, count: runs.length });
    } catch (error) {
      logger.error('Failed to get campaign runs', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get posts for a campaign (across all runs or specific run)
   */
  async getSearchPosts(req, res) {
    try {
      const { id } = req.params;
      const {
        limit = 50,
        offset = 0,
        sort = 'sentiment',
        sentiment = 'all',
        run_id = null,
        platform = null
      } = req.query;

      // Get campaign to determine platforms
      const campaign = await campaignRepository.getById(id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const campaignPlatforms = campaign.platforms || [campaign.platform];

      // Filter platforms if specific platform requested
      const platformsToQuery = platform ? [platform] : campaignPlatforms;

      const posts = await postRepository.getPosts(id, {
        limit,
        offset,
        sort,
        sentiment,
        run_id,
        platform,
        platformsToQuery
      });

      logger.info('Fetched posts', {
        campaignId: id,
        platforms: platformsToQuery,
        count: posts.length,
        sentiment,
        run_id,
        platform
      });

      res.json({ posts, count: posts.length });
    } catch (error) {
      logger.error('Failed to get posts', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get campaign statistics (aggregated across all runs)
   */
  async getSearchStats(req, res) {
    try {
      const { id } = req.params;

      // Get campaign to determine platforms
      const campaign = await campaignRepository.getById(id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const platforms = campaign.platforms || [campaign.platform];

      const allResults = await analyticsRepository.getAggregatedStats(id, platforms);

      // Aggregate stats from all platforms
      const aggregatedStats = {
        total_posts: 0,
        avg_sentiment: 0,
        total_likes: 0,
        total_comments: 0,
        positive_count: 0,
        neutral_count: 0,
        negative_count: 0
      };

      let totalSentimentSum = 0;
      let platformsWithData = 0;

      allResults.forEach(stats => {
        aggregatedStats.total_posts += stats.total_posts || 0;
        aggregatedStats.total_likes += stats.total_likes || 0;
        aggregatedStats.total_comments += stats.total_comments || 0;
        aggregatedStats.positive_count += stats.positive_count || 0;
        aggregatedStats.neutral_count += stats.neutral_count || 0;
        aggregatedStats.negative_count += stats.negative_count || 0;

        if (stats.avg_sentiment) {
          totalSentimentSum += stats.avg_sentiment;
          platformsWithData++;
        }
      });

      // Calculate overall average sentiment
      if (platformsWithData > 0) {
        aggregatedStats.avg_sentiment = totalSentimentSum / platformsWithData;
      }

      res.json({ stats: aggregatedStats });
    } catch (error) {
      logger.error('Failed to get stats', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get sentiment trend over runs
   */
  async getSentimentTrend(req, res) {
    try {
      const { id } = req.params;

      // Use repository method - this was raw query before, simplified logic since repository has flexible getRuns?
      // Actually we need a specific query for this stats projection, so adding a helper method or using raw query via adapter might be better.
      // For now, let's just get all runs and map in memory or add a specific trend method to repo.
      // Let's assume we add getSentimentTrend to analytics or campaign repo.
      // Wait, I didn't add that to the repo yet. I will update the repo in a next step or inline it temporarily if needed.
      // Actually, better to stick to the plan. I will assume I can fetch all runs and map them here for now, or use the db adapter directly via repo?
      // No, let's keep it consistent. I will just fetch runs and process them.

      // NOTE: Original used N1QL for specific projection.
      // Let's assume we use campaignRepository.getRuns but it gets everything.
      // Optimization: Add getRunsWithStats to repo?
      // For now, let's just use getRuns and map. It might be heavier but keeps code clean.
      // Or better, let's add `getSentimentTrend` to CampaignRepository. I will do that in a follow up "fix" or just accept the overhead.

      // Actually, looking at previous code, it was selecting specific fields.
      // I'll stick to full object retrieval for now to be safe, or I'd have to edit the repo file again.
      // To strictly follow DRY, `getRuns` is reusable.

      const runs = await campaignRepository.getRuns(id, 1000); // explicit high limit

      const trend = runs
        .filter(r => r.status === 'completed')
        .sort((a, b) => a.run_number - b.run_number)
        .map(r => ({
          run_number: r.run_number,
          run_at: r.run_at,
          avg_sentiment: r.stats?.avg_sentiment,
          post_count: r.stats?.posts_analyzed
        }));

      res.json({ trend });
    } catch (error) {
      logger.error('Failed to get sentiment trend', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Create new campaign
   */
  async createSearch(req, res) {
    try {
      const { v4: uuidv4 } = require('uuid');
      const {
        search_query,
        platforms,
        google_domain = 'google.com',
        scheduled = false,
        interval_minutes = 10,
        duration_days = 7,
        tiktok_post_limit = 100,
        reddit_post_limit = 100,
        youtube_post_limit = 100,
        reddit_use_dual_search = true,
        enable_relevance_filter = false,
        relevance_threshold = 0.7

      } = req.body;

      // Validate required fields
      if (!search_query || !platforms || platforms.length === 0) {
        return res.status(400).json({
          error: 'Missing required fields: search_query and platforms are required'
        });
      }

      // Validate platforms
      const validPlatforms = ['instagram', 'tiktok', 'twitter', 'reddit', 'facebook', 'youtube', 'linkedin'];
      const invalidPlatforms = platforms.filter(p => !validPlatforms.includes(p));

      if (invalidPlatforms.length > 0) {
        return res.status(400).json({
          error: `Invalid platform(s): ${invalidPlatforms.join(', ')}. Must be one of: ${validPlatforms.join(', ')}`
        });
      }

      // Create campaign document
      const campaignId = uuidv4();
      const now = new Date().toISOString();

      const scheduledConfig = {
        enabled: scheduled,
        interval_minutes: scheduled ? parseInt(interval_minutes) : null,
        duration_days: scheduled ? parseInt(duration_days) : null,
        next_run: scheduled ? new Date(Date.now() + interval_minutes * 60000).toISOString() : null,
        started_at: scheduled ? now : null,
        ends_at: scheduled ? new Date(Date.now() + duration_days * 24 * 60 * 60000).toISOString() : null
      };

      const campaignDocument = {
        id: campaignId,
        type: 'campaign',
        platforms: platforms,
        search_query: search_query,
        keywords: search_query.split(' '),
        google_domain: google_domain,
        created_at: now,
        updated_at: now,
        status: 'active',
        scheduled_config: scheduledConfig,
        settings: {
          tiktok_post_limit: parseInt(tiktok_post_limit),
          reddit_post_limit: parseInt(reddit_post_limit),
          youtube_post_limit: parseInt(youtube_post_limit),
          reddit_use_dual_search: Boolean(reddit_use_dual_search),
          enable_relevance_filter: Boolean(enable_relevance_filter),
          relevance_threshold: parseFloat(relevance_threshold)
        },
        stats: {
          total_runs: 0,
          total_posts_found: 0,
          avg_sentiment_overall: null,
          last_run_at: null,
          by_platform: {}
        }
      };

      // Initialize platform stats
      platforms.forEach(platform => {
        campaignDocument.stats.by_platform[platform] = {
          total_posts: 0,
          avg_sentiment: null,
          last_run_at: null
        };
      });

      // Store campaign via Repository
      await campaignRepository.create(campaignDocument);

      logger.info('Multi-platform campaign created', {
        campaignId,
        search_query,
        platforms,
        scheduled,
        settings: campaignDocument.settings
      });

      // Trigger the first run asynchronously
      setImmediate(() => {
        this.triggerCampaignRun(campaignId).catch(err => {
          logger.error('Campaign run failed', { campaignId, error: err.message });
        });
      });

      // Return immediately
      res.status(201).json({
        success: true,
        searchId: campaignId,
        message: 'Multi-platform campaign created and first run started',
        search: campaignDocument
      });

    } catch (error) {
      logger.error('Failed to create campaign', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Delete a campaign and all its data
   */
  async deleteCampaign(req, res) {
    try {
      const { id } = req.params;

      const campaign = await campaignRepository.getById(id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      const platforms = campaign.platforms || [campaign.platform];

      logger.info('Deleting campaign', { campaignId: id, platforms });

      const runsDeleted = await campaignRepository.deleteRunsByCampaignId(id);

      const totalPostsDeleted = await postRepository.deleteAllByCampaignId(id, platforms);

      const analyticsDeleted = await analyticsRepository.deleteAll(id);

      await campaignRepository.delete(id);

      logger.info('Campaign deleted', {
        campaignId: id,
        runsDeleted: runsDeleted.length,
        postsDeleted: totalPostsDeleted,
        analyticsDeleted: analyticsDeleted.length
      });

      res.json({
        success: true,
        message: 'Campaign deleted successfully',
        deleted: {
          runs: runsDeleted.length,
          posts: totalPostsDeleted,
          analytics: analyticsDeleted.length
        }
      });

    } catch (error) {
      logger.error('Failed to delete campaign', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Delete all campaigns (admin cleanup)
   */
  async deleteAllCampaigns(req, res) {
    try {
      logger.info('Deleting all campaigns');

      const searchesDeleted = await campaignRepository.deleteAllCampaigns();
      const runsDeleted = await campaignRepository.deleteAllRuns();

      const platformCollections = ['instagram_posts', 'tiktok_posts', 'twitter_posts', 'reddit_posts', 'facebook_posts', 'youtube_posts', 'linkedin_posts'];
      const totalPostsDeleted = await postRepository.deleteAllPosts(platformCollections);

      const analyticsDeleted = await analyticsRepository.deleteAllAnalytics();

      logger.info('All campaigns deleted', {
        searches: searchesDeleted.length,
        runs: runsDeleted.length,
        posts: totalPostsDeleted,
        analytics: analyticsDeleted.length
      });

      res.json({
        success: true,
        message: 'All campaigns deleted successfully',
        deleted: {
          campaigns: searchesDeleted.length,
          runs: runsDeleted.length,
          posts: totalPostsDeleted,
          analytics: analyticsDeleted.length
        }
      });

    } catch (error) {
      logger.error('Failed to delete all campaigns', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Trigger a campaign run manually
   */
  async triggerManualRun(req, res) {
    try {
      const { id } = req.params;

      const campaign = await campaignRepository.getById(id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      logger.info('Triggering manual run', { campaignId: id });

      setImmediate(() => {
        this.triggerCampaignRun(id).catch(err => {
          logger.error('Manual run failed', { campaignId: id, error: err.message });
        });
      });

      res.json({
        success: true,
        message: 'Campaign run triggered'
      });

    } catch (error) {
      logger.error('Failed to trigger manual run', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Pause/Resume a campaign
   */
  async toggleCampaignStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['active', 'paused'].includes(status)) {
        return res.status(400).json({
          error: 'Invalid status. Must be "active" or "paused"'
        });
      }

      const campaign = await campaignRepository.getById(id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      campaign.status = status;
      campaign.updated_at = new Date().toISOString();

      await campaignRepository.create(campaign); // upsert

      logger.info('Campaign status updated', { campaignId: id, status });

      res.json({
        success: true,
        message: `Campaign ${status === 'active' ? 'resumed' : 'paused'}`,
        campaign
      });

    } catch (error) {
      logger.error('Failed to toggle campaign status', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Trigger a campaign run
   */
  async triggerCampaignRun(campaignId) {
    try {
      const { v4: uuidv4 } = require('uuid');

      logger.info('Starting campaign run', { campaignId });

      const campaign = await campaignRepository.getById(campaignId);
      if (!campaign) {
        throw new Error(`Campaign not found: ${campaignId}`);
      }

      const runCount = await campaignRepository.getRunningCount(campaignId);
      const runNumber = runCount + 1;

      const runId = uuidv4();
      const now = new Date().toISOString();

      const runDocument = {
        id: runId,
        campaign_id: campaignId,
        run_number: runNumber,
        run_at: now,
        status: 'running',
        stats: {
          urls_found: 0,
          posts_scraped: 0,
          posts_analyzed: 0,
          avg_sentiment: null,
          by_platform: {}
        }
      };

      await campaignRepository.createRun(runDocument);

      await this.runPipeline(campaignId, runId);

      logger.info('Campaign run completed', { campaignId, runId, runNumber });

    } catch (error) {
      logger.error('Campaign run failed', { campaignId, error: error.message });
      throw error;
    }
  }

  /**
   * Run the full pipeline for a specific run
   */
  async runPipeline(campaignId, runId) {
    try {
      const projectRoot = path.resolve(__dirname, '../../../');

      const campaign = await campaignRepository.getById(campaignId);
      if (!campaign) {
        throw new Error(`Campaign not found: ${campaignId}`);
      }

      const platforms = campaign.platforms || [campaign.platform];

      logger.info('Running multi-platform pipeline', {
        campaignId,
        runId,
        platforms
      });

      // Helper function to run npm script
      const runScript = (script, args = []) => {
        return new Promise((resolve, reject) => {
          const child = spawn('npm', ['run', script, '--', ...args], {
            cwd: projectRoot,
            stdio: 'inherit'
          });

          child.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(`Script ${script} exited with code ${code}`));
            } else {
              resolve();
            }
          });

          child.on('error', (err) => {
            reject(err);
          });
        });
      };

      // Step 1: Search for all platforms in PARALLEL
      logger.info('Step 1: Running search for all platforms in parallel...', { platforms });

      const searchPromises = platforms.map(platform => {
        if (platform === 'tiktok') {
          return runScript('search-tiktok', [campaignId, runId])
            .then(() => ({ platform, success: true, needsScraping: false }))
            .catch(err => ({ platform, success: false, needsScraping: false, error: err.message }));
        } else if (platform === 'youtube') {
          return runScript('search-youtube', [campaignId, runId])
            .then(() => ({ platform, success: true, needsScraping: false }))
            .catch(err => ({ platform, success: false, needsScraping: false, error: err.message }));
        } else if (platform === 'reddit') {
          const useDualSearch = campaign.settings?.reddit_use_dual_search !== false;

          if (useDualSearch) {
            return runScript('search-reddit-dual', [campaignId, runId])
              .then(() => ({ platform, success: true, needsScraping: true }))
              .catch(err => ({ platform, success: false, needsScraping: true, error: err.message }));
          } else {
            return runScript('search-reddit', [campaignId, runId])
              .then(() => ({ platform, success: true, needsScraping: false }))
              .catch(err => ({ platform, success: false, needsScraping: false, error: err.message }));
          }
        } else {
          // Instagram, Twitter, Facebook, LinkedIn: SERP search (needs scraping)
          return runScript('serp', [campaignId, runId, platform])
            .then(() => ({ platform, success: true, needsScraping: true }))
            .catch(err => ({ platform, success: false, needsScraping: true, error: err.message }));
        }
      });

      const searchResults = await Promise.allSettled(searchPromises);

      // DECLARE platformsNeedingScraping HERE (outside the loop)
      const platformsNeedingScraping = [];

      // Log search results and determine which platforms need scraping
      searchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { platform, success, needsScraping, error } = result.value;
          if (success) {
            logger.info(`Search completed for ${platform}`, { needsScraping });
            if (needsScraping) {
              platformsNeedingScraping.push(platform);
            }
          } else {
            logger.warn(`Search failed for ${platform}`, { error });
          }
        } else {
          logger.error(`Search promise rejected`, {
            error: result.reason?.message
          });
        }
      });

      logger.info('Platforms needing scraping', { platforms: platformsNeedingScraping });

      // Step 2: Scrape platforms that need it
      if (platformsNeedingScraping.length > 0) {
        logger.info('Step 2: Scraping posts from platforms that need it...', {
          platforms: platformsNeedingScraping
        });

        const scrapePromises = platformsNeedingScraping.map(platform => {
          return runScript('scrape-posts', [campaignId, runId, platform])
            .then(() => ({ platform, success: true }))
            .catch(err => ({ platform, success: false, error: err.message }));
        });

        const scrapeResults = await Promise.allSettled(scrapePromises);

        scrapeResults.forEach((result) => {
          if (result.status === 'fulfilled') {
            const { platform, success, error } = result.value;
            if (success) {
              logger.info(`Scraping completed for ${platform}`);
            } else {
              logger.warn(`Scraping failed for ${platform}`, { error });
            }
          }
        });
      } else {
        logger.info('Step 2: Skipped - No platforms require scraping');
      }

      // Step 3: Analyze all posts
      logger.info('Step 3: Analyzing all posts...');
      await runScript('analyze-posts', [campaignId, runId]);

      // Step 4: Generate analytics
      logger.info('Step 4: Generating analytics...');
      await runScript('analytics', [campaignId, runId]);

      // Update run status
      const run = await campaignRepository.getRun(runId);
      if (run) {
        run.status = 'completed';
        run.completed_at = new Date().toISOString();
        await campaignRepository.updateRun(runId, run);
      }

      // Update campaign stats
      const updatedCampaign = await campaignRepository.getById(campaignId);
      if (updatedCampaign) {
        updatedCampaign.stats.total_runs = (updatedCampaign.stats.total_runs || 0) + 1;
        updatedCampaign.stats.last_run_at = new Date().toISOString();
        updatedCampaign.updated_at = new Date().toISOString();
        await campaignRepository.update(campaignId, updatedCampaign);
      }

      logger.info('Multi-platform pipeline completed successfully', {
        campaignId,
        runId,
        platforms
      });

    } catch (error) {
      logger.error('Pipeline failed', { campaignId, runId, error: error.message, stack: error.stack });

      // Update run status to failed
      try {
        const run = await campaignRepository.getRun(runId);
        if (run) {
          run.status = 'failed';
          run.error = error.message;
          run.failed_at = new Date().toISOString();
          await campaignRepository.updateRun(runId, run);
        }
      } catch (updateErr) {
        logger.error('Failed to update run status', { runId, error: updateErr.message });
      }

      throw error;
    }
  }

}

module.exports = new SearchController();

