const campaignRepository = require('../../modules/repositories/campaignRepository');
const postRepository = require('../../modules/repositories/postRepository');
const analyticsRepository = require('../../modules/repositories/analyticsRepository');
const platformManager = require('../../modules/platforms/platformManager');
const logger = require('../../utils/logger');
const { spawn } = require('child_process');
const path = require('path');
const summaryGenerator = require('../../modules/analysis/summaryGenerator');

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

      const results = await campaignRepository.getAll().catch(err => {
        if (err.message.includes('not exist') || err.message.includes('not found')) {
          logger.warn('Searches table not found, returning empty array');
          return [];
        }
        throw err;
      });

      logger.info('Raw query results', { count: results.length });

      // Process each campaign to get run count - USE Promise.all for async operations
      const campaignPromises = results.map(async (campaignData) => {
        const campaignId = campaignData.id;

        // Get run count for this campaign
        let totalRuns = 0;
        let latestRun = null;
        let totalPosts = 0;

        try {
          totalRuns = await campaignRepository.getTotalRunCount(campaignId);

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
      logger.error('Failed to get campaigns', { error: error.message });
      // On uninitialized DB, return empty list instead of error
      res.json({ searches: [], error: error.message, uninitialized: true });
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

      // Get run count and stats with resilience
      try {
        const runCount = await campaignRepository.getTotalRunCount(id);
        campaign.total_runs = runCount || 0;

        // CRITICAL: Return ANALYZED count
        const platforms = campaign.platforms || [campaign.platform];
        const allResults = await analyticsRepository.getAggregatedStats(id, platforms);
        const totalScraped = allResults.reduce((sum, res) => sum + (res.total_posts || 0), 0);
        const totalAnalyzed = allResults.reduce((sum, res) => sum + (res.analyzed_posts || 0), 0);

        campaign.total_posts = totalScraped || 0;
        campaign.analyzed_posts = totalAnalyzed || 0;
        campaign.posts_count = totalScraped || 0; // Maintain for compatibility
      } catch (err) {
        logger.warn('Failed to fetch detailed campaign stats, returning basic info', { id, error: err.message });
        campaign.total_runs = campaign.total_runs || 0;
        campaign.total_posts = campaign.total_posts || 0;
        campaign.posts_count = campaign.posts_count || 0;
        campaign.stats_error = err.message; // Let frontend know
      }

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

      // Log at debug level to avoid cluttering console during polling
      // logger.debug('Fetched campaign runs', { campaignId: id, count: runs.length });

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

      // Log at debug level
      /*
      logger.debug('Fetched posts', {
        campaignId: id,
        platforms: platformsToQuery,
        count: posts.length,
        sentiment,
        run_id,
        platform
      });
      */

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

      let allResults = [];
      try {
        allResults = await analyticsRepository.getAggregatedStats(id, platforms);
      } catch (err) {
        logger.error('Failed to aggregate stats from database', { id, error: err.message });
        // Return empty stats instead of crashing
        return res.json({
          stats: { total_posts: 0, avg_sentiment: 0, by_platform: {} },
          error: err.message
        });
      }

      // Aggregate stats from all platforms
      const aggregatedStats = {
        total_posts: 0,
        analyzed_posts: 0,
        avg_sentiment: 0,
        total_likes: 0,
        total_comments: 0,
        positive_count: 0,
        neutral_count: 0,
        negative_count: 0,
        by_platform: {} // Add breakdown for frontend
      };

      let totalSentimentSum = 0;
      let platformsWithData = 0;

      allResults.forEach((stats, index) => {
        const platform = platforms[index];

        aggregatedStats.total_posts += Number(stats.total_posts || 0);
        aggregatedStats.analyzed_posts += Number(stats.analyzed_posts || 0);
        aggregatedStats.total_likes += Number(stats.total_likes || 0);
        aggregatedStats.total_comments += Number(stats.total_comments || 0);
        aggregatedStats.positive_count += Number(stats.positive_count || 0);
        aggregatedStats.neutral_count += Number(stats.neutral_count || 0);
        aggregatedStats.negative_count += Number(stats.negative_count || 0);

        // Store platform-specific stats
        aggregatedStats.by_platform[platform] = {
          total_posts: Number(stats.total_posts || 0),
          analyzed_posts: Number(stats.analyzed_posts || 0),
          avg_sentiment: stats.avg_sentiment ? parseFloat(stats.avg_sentiment) : 0,
          total_likes: Number(stats.total_likes || 0),
          total_comments: Number(stats.total_comments || 0)
        };

        if (stats.avg_sentiment) {
          totalSentimentSum += parseFloat(stats.avg_sentiment);
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
      const runs = await campaignRepository.getRuns(id, 1000); // explicit high limit

      const trend = runs
        .filter(r => r.status === 'completed')
        .sort((a, b) => a.run_number - b.run_number)
        .map(r => ({
          run_number: r.run_number,
          run_at: r.run_at,
          avg_sentiment: r.stats?.avg_sentiment ? parseFloat(r.stats.avg_sentiment) : null,
          post_count: r.stats?.posts_analyzed
        }));

      res.json({ trend });
    } catch (error) {
      logger.error('Failed to get sentiment trend', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Trigger manual summary generation for a specific run
   */
  async triggerRunSummaries(req, res) {
    try {
      const { id, runId } = req.params;

      // Check if run exists
      const run = await campaignRepository.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: 'Run not found' });
      }

      // Trigger background generation
      setImmediate(async () => {
        try {
          await this.generateRunArtifacts(id, runId);
          logger.info('Manual summary generation completed', { runId });
        } catch (err) {
          logger.error('Manual summary generation failed', { runId, error: err.message });
        }
      });

      res.json({ success: true, message: 'Summary generation started' });

    } catch (error) {
      logger.error('Failed to trigger summary generation', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get semantic summary for a specific sentiment
   */
  async getSentimentSummary(req, res) {
    try {
      const { id } = req.params;
      const { sentiment } = req.query;

      if (!['positive', 'negative', 'neutral'].includes(sentiment)) {
        return res.status(400).json({ error: 'Invalid sentiment. Must be positive, negative, or neutral' });
      }

      // 1. Fetch posts for this sentiment
      // We use postRepository.getPosts but need to ensure it supports filtering efficiently
      const posts = await postRepository.getPosts(id, {
        limit: 50, // Analyze top 50 posts
        sentiment: sentiment,
        sort: 'engagement' // Focus on high impact posts
      });

      if (posts.length === 0) {
        return res.json({ summary: `No ${sentiment} posts found to analyze.` });
      }

      // 2. Generate summary
      const summary = await summaryGenerator.generateSentimentSummary(posts, sentiment);

      res.json({ summary });

    } catch (error) {
      logger.error('Failed to get sentiment summary', { error: error.message });
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
        limit = 100, // Generic limit fallback
        tiktok_post_limit = null,
        reddit_post_limit = null,
        youtube_post_limit = null,
        reddit_use_dual_search = true,
        enable_relevance_filter = false,
        relevance_threshold = 0.7,
        description = '' // Optional description

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
        description: description,
        keywords: search_query.split(' '),
        google_domain: google_domain,
        created_at: now,
        updated_at: now,
        status: 'active',
        scheduled_config: scheduledConfig,
        settings: {
          tiktok_post_limit: parseInt(tiktok_post_limit || limit),
          reddit_post_limit: parseInt(reddit_post_limit || limit),
          youtube_post_limit: parseInt(youtube_post_limit || limit),
          generic_post_limit: parseInt(limit), // Save for SERP/scraping scripts
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
   * Get sentiment summary on-demand
   */
  async getSentimentSummary(req, res) {
    try {
      const { id } = req.params;
      const { sentiment } = req.query;

      const campaign = await campaignRepository.getById(id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      // Fetch posts (using existing logic)
      const posts = await postRepository.getPosts(id, {
        limit: 30,
        sentiment: sentiment,
        sort: 'engagement',
        platformsToQuery: campaign.platforms || [campaign.platform]
      });

      const summary = await summaryGenerator.generateSentimentSummary(posts, sentiment, campaign.query);

      res.json({ summary });

    } catch (error) {
      logger.error('Failed to get sentiment summary', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get platform summary on-demand
   */
  async getPlatformSummary(req, res) {
    try {
      const { id } = req.params;
      const { platform } = req.query;

      logger.info(`Received platform summary request for campaign ${id} / platform ${platform}`);

      if (!platform) return res.status(400).json({ error: 'Platform is required' });

      const campaign = await campaignRepository.getById(id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      logger.info(`Fetched campaign: ${campaign.search_query}`);

      // Fetch posts for this platform from LATEST/specific run? 
      // Let's grab high engagement posts generally from this campaign

      const posts = await postRepository.getPosts(id, {
        limit: 30,
        sort: 'engagement',
        platformsToQuery: [platform]
      });

      logger.info(`Fetched ${posts.length} posts for platform ${platform}`);
      logger.info('Starting LLM generation...');
      const summary = await summaryGenerator.generatePlatformSummary(posts, platform, campaign.query);
      logger.info('LLM generation complete');

      // Persist to latest run (Sidecar Strategy)
      try {
        const latestRun = await campaignRepository.getLatestRun(id);
        if (latestRun) {
          await campaignRepository.savePlatformSummary(latestRun.id, platform, summary);
          logger.info(`Persisted platform summary to run ${latestRun.id} (sidecar)`);
        } else {
          logger.warn('No runs found to persist summary');
        }
      } catch (dbError) {
        logger.error('Failed to persist summary to DB', { error: dbError.message });
      }

      res.json({ summary });

    } catch (error) {
      logger.error('Failed to get platform summary', { error: error.message });
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
   * Resume an interrupted run
   */
  async resumeRun(req, res) {
    try {
      const { runId } = req.params;

      const run = await campaignRepository.getRun(runId);
      if (!run) {
        return res.status(404).json({ error: 'Run not found' });
      }

      const campaignId = run.campaign_id;

      logger.info('Resuming run', { campaignId, runId });

      // Step 1: Mark as running again
      run.status = 'running';
      run.updated_at = new Date().toISOString();
      await campaignRepository.updateRun(runId, run);

      // Step 2: Trigger analysis (it only processes 'pending' posts)
      setImmediate(() => {
        this.runAnalysisAndAnalytics(campaignId, runId).catch(err => {
          logger.error('Resumed run failed', { runId, error: err.message });
        });
      });

      res.json({
        success: true,
        message: 'Analysis resumed for run ' + runId
      });

    } catch (error) {
      logger.error('Failed to resume run', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Helper to run only the analysis and analytics steps
   */
  async runAnalysisAndAnalytics(campaignId, runId) {
    try {
      // Step 3: Analyze all posts
      logger.info('Resuming Step 3: Analyzing all posts...');
      await this.runScript('analyze-posts', [campaignId, runId]);

      // Step 4: Generating analytics
      logger.info('Resuming Step 4: Generating analytics...');
      await this.runScript('analytics', [campaignId, runId]);

      // Update run status
      const run = await campaignRepository.getRun(runId);
      if (run) {
        run.status = 'completed';
        run.completed_at = new Date().toISOString();
        await campaignRepository.updateRun(runId, run);
      }
    } catch (error) {
      logger.error('Resumed pipeline failed', { campaignId, runId, error: error.message });
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

      const totalRuns = await campaignRepository.getTotalRunCount(campaignId);
      const runNumber = totalRuns + 1;

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

      // Helper function to run npm script with timeout
      const runScript = (script, args = [], timeoutMs = 600000) => { // Default 10 mins
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            logger.warn(`Script ${script} timed out after ${timeoutMs}ms. Killing child process...`, { campaignId, runId });
            child.kill('SIGKILL');
            reject(new Error(`Script ${script} timed out after ${timeoutMs}ms`));
          }, timeoutMs);

          const child = spawn('npm', ['run', script, '--', ...args], {
            cwd: projectRoot,
            stdio: ['inherit', 'inherit', 'pipe']
          });

          let stderr = '';
          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });

          child.on('close', (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
              logger.error(`Script ${script} failed`, { code, stderr: stderr.substring(0, 500) });
              reject(new Error(`Script ${script} exited with code ${code}. Error: ${stderr.substring(0, 200)}`));
            } else {
              resolve();
            }
          });

          child.on('error', (err) => {
            clearTimeout(timeout);
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
          // Scraping can take up to 30 mins per the monitor + processing time
          return runScript('scrape-posts', [campaignId, runId, platform], 2400000)
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
      await runScript('analyze-posts', [campaignId, runId], 1800000); // 30 mins

      // Step 4: Generate analytics
      logger.info('Step 4: Generating analytics...');
      await runScript('analytics', [campaignId, runId], 600000); // 10 mins

      // Step 5: Generate Artifacts (Summaries)
      logger.info('Step 5: Generating Summaries (Background)...');
      await this.generateRunArtifacts(campaignId, runId);

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

  /**
   * Helper to generate all AI summaries for a run
   */
  async generateRunArtifacts(campaignId, runId) {
    try {
      const campaign = await campaignRepository.getById(campaignId);
      const platforms = campaign.platforms || [campaign.platform];

      // 1. Fetch Stats & Top Posts for Executive Summary
      const platformStats = await analyticsRepository.getAggregatedStats(campaignId, platforms);
      const aggregated = platformStats.reduce((acc, s) => ({
        total_posts: acc.total_posts + Number(s.total_posts || 0),
        positive_count: acc.positive_count + Number(s.positive_count || 0),
        negative_count: acc.negative_count + Number(s.negative_count || 0),
        sum_sentiment: acc.sum_sentiment + (Number(s.avg_sentiment || 0) * Number(s.total_posts || 0))
      }), { total_posts: 0, positive_count: 0, negative_count: 0, sum_sentiment: 0 });

      const avg_sentiment = aggregated.total_posts > 0 ? (aggregated.sum_sentiment / aggregated.total_posts) : 0;

      const topPosts = await postRepository.getPosts(campaignId, {
        limit: 20,
        sort: 'engagement',
        run_id: runId,
        platformsToQuery: platforms
      }) || []; // Ensure array

      logger.info('Generating executive summary', { topPostsCount: topPosts.length });

      const executiveSummary = await summaryGenerator.generateRunSummary({ id: runId }, {
        ...aggregated,
        avg_sentiment
      }, topPosts, campaign.query);

      // 2. Generate Sentiment Summaries
      const sentiments = ['positive', 'negative', 'neutral'];
      const sentimentSummaries = {};

      for (const sentiment of sentiments) {
        logger.info(`Fetching posts for sentiment: ${sentiment}`);
        let sentimentPosts = [];
        try {
          sentimentPosts = await postRepository.getPosts(campaignId, {
            limit: 30,
            sentiment: sentiment,
            run_id: runId, // strict to this run
            sort: 'engagement',
            platformsToQuery: platforms
          });
        } catch (err) {
          logger.warn(`Failed to fetch posts for sentiment ${sentiment}`, { error: err.message });
          continue;
        }

        if (sentimentPosts.length > 0) {
          const distribution = sentimentPosts.reduce((acc, p) => {
            acc[p.platform] = (acc[p.platform] || 0) + 1;
            return acc;
          }, {});

          logger.info(`Generating summary for ${sentiment}`, {
            count: sentimentPosts.length,
            distribution
          });

          try {
            // Pass campaign.query correctly (it was missing before)
            const summary = await summaryGenerator.generateSentimentSummary(sentimentPosts, sentiment, campaign.query);
            sentimentSummaries[sentiment] = summary;
          } catch (err) {
            logger.error(`Failed to generate ${sentiment} summary`, { error: err.message });
          }
        } else {
          logger.info(`No posts found for sentiment ${sentiment}`);
        }
      }

      // 3. Generate Platform Summaries
      // We process these atomically to avoid race conditions with manual triggers
      for (const platform of platforms) {
        logger.info(`Generating summary for platform: ${platform}`);
        try {
          const platformPosts = await postRepository.getPosts(campaignId, {
            limit: 25,
            run_id: runId,
            sort: 'engagement',
            platformsToQuery: [platform]
          });

          let summary = "No posts found for this platform in this run.";
          if (platformPosts && platformPosts.length > 0) {
            summary = await summaryGenerator.generatePlatformSummary(platformPosts, platform, campaign.query);
          }

          // Atomic save
          await campaignRepository.savePlatformSummary(runId, platform, summary);
          logger.info(`Generated and saved summary for ${platform}`);

        } catch (err) {
          logger.error(`Failed to generate ${platform} summary`, { error: err.message });
        }
      }

      // 4. Update Run (Executive and Sentiment only)
      const run = await campaignRepository.getRun(runId);
      if (run) {
        run.summary = executiveSummary;
        run.sentiment_summaries = sentimentSummaries;
        // Do NOT overwrite platform_summaries here as they are handled atomically above
        await campaignRepository.updateRun(runId, run);
        logger.info('Run artifacts generated and saved', { runId });
      }

    } catch (error) {
      logger.error('Failed to generate run artifacts', { runId, error: error.message });
      throw error; // Allow caller to handle
    }
  }

}

module.exports = new SearchController();
