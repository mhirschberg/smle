const { v4: uuidv4 } = require('uuid');
const dbFactory = require('../modules/storage/dbFactory');
const campaignRepository = require('../modules/repositories/campaignRepository');
const analyticsRepository = require('../modules/repositories/analyticsRepository');
const trendCalculator = require('../modules/analytics/trendCalculator');
const logger = require('../utils/logger');
const config = require('../config');

async function generateAnalytics(campaignId, runId) {
  let db;
  try {
    logger.setContext(campaignId, runId);
    logger.info('=== Starting Analytics Generation ===', { campaignId, runId });

    // Step 1: Connect to DB
    logger.info('Step 1: Connecting to Database...');
    db = await dbFactory.getDB();
    const dbType = config.db.type.toLowerCase();

    // Step 2: Load campaign document
    logger.info('Step 2: Loading campaign document...');
    const campaign = await campaignRepository.getById(campaignId);

    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    // Support both old and new campaign structures
    const platforms = campaign.platforms || [campaign.platform];

    logger.info('Campaign loaded', {
      query: campaign.search_query,
      platforms: platforms
    });

    // Step 3: Get platform manager and load posts from all platforms
    const platformManager = require('../modules/platforms/platformManager');

    logger.info('Step 3: Loading analyzed posts from all platforms...', {
      platforms: platforms
    });

    // Build UNION query for all platforms
    let query;
    let params;

    if (dbType === 'postgres' || dbType === 'cratedb') {
      const unionQueries = platforms.map(platform => {
        const collection = platformManager.getCollection(platform);
        return `
          SELECT doc
          FROM ${collection}
          WHERE doc->>'campaign_id' = $1
          AND doc->>'run_id' = $2
          AND doc->>'analysis_status' = 'analyzed'
        `;
      });
      query = unionQueries.join(' UNION ALL ');
      params = [campaignId, runId];
    } else {
      const unionQueries = platforms.map(platform => {
        const collection = platformManager.getCollection(platform);
        return `
          SELECT p.*
          FROM SMLE._default.${collection} p
          WHERE p.campaign_id = $campaignId
          AND p.run_id = $runId
          AND p.analysis_status = 'analyzed'
        `;
      });
      query = unionQueries.join(' UNION ALL ');
      params = { campaignId, runId };
    }

    const results = await db.query(query, {
      parameters: params
    });

    const posts = results.map(r => r.doc || r.p || r);

    logger.info(`Loaded ${posts.length} analyzed posts from ${platforms.length} platform(s)`);

    if (posts.length === 0) {
      logger.warn('No analyzed posts found');
      return;
    }

    // Log breakdown by platform
    const postsByPlatform = {};
    posts.forEach(p => {
      const platform = p.platform;
      postsByPlatform[platform] = (postsByPlatform[platform] || 0) + 1;
    });
    logger.info('Posts breakdown', postsByPlatform);

    // Step 4: Calculate analytics
    logger.info('Step 4: Calculating analytics...');

    const now = new Date().toISOString();

    const analytics = {
      id: uuidv4(),
      type: 'run_analytics',
      campaign_id: campaignId,
      run_id: runId,
      search_query: campaign.search_query,
      platforms: platforms,
      created_at: now,
      post_count: posts.length,
      posts_by_platform: postsByPlatform,

      sentiment_distribution: trendCalculator.calculateSentimentDistribution(posts),
      sentiment_over_time: trendCalculator.calculateSentimentOverTime(posts),
      top_hashtags: trendCalculator.calculateTopHashtags(posts, 20),
      top_topics: trendCalculator.calculateTopTopics(posts, 20),
      engagement_correlation: trendCalculator.calculateEngagementCorrelation(posts),
      content_type_performance: trendCalculator.calculateContentTypePerformance(posts),

      top_posts: {
        by_sentiment: trendCalculator.getTopPosts(posts, 'sentiment', 10),
        by_engagement: trendCalculator.getTopPosts(posts, 'engagement', 10),
        most_negative: trendCalculator.getTopPosts(posts, 'negative', 5)
      },

      // Per-platform analytics
      by_platform: {}
    };

    // Calculate per-platform analytics
    platforms.forEach(platform => {
      const platformPosts = posts.filter(p => p.platform === platform);
      if (platformPosts.length > 0) {
        analytics.by_platform[platform] = {
          post_count: platformPosts.length,
          sentiment_distribution: trendCalculator.calculateSentimentDistribution(platformPosts),
          avg_sentiment: platformPosts.reduce((sum, p) => sum + (p.analysis?.sentiment_score || 0), 0) / platformPosts.length,
          top_topics: trendCalculator.calculateTopTopics(platformPosts, 10)
        };
      }
    });

    logger.info('Analytics calculated');

    // Step 5: Store analytics
    logger.info('Step 5: Storing analytics...');
    await db.upsert('analytics', analytics.id, analytics);

    logger.info('Analytics stored', { analyticsId: analytics.id });

    // Step 6: Print summary
    logger.info('=== Analytics Summary ===');
    console.log(`\n📊 OVERALL SENTIMENT DISTRIBUTION:`);
    console.log(`  Positive (8-10): ${analytics.sentiment_distribution.counts.positive} (${analytics.sentiment_distribution.percentages.positive}%)`);
    console.log(`  Neutral (4-7):   ${analytics.sentiment_distribution.counts.neutral} (${analytics.sentiment_distribution.percentages.neutral}%)`);
    console.log(`  Negative (1-3):  ${analytics.sentiment_distribution.counts.negative} (${analytics.sentiment_distribution.percentages.negative}%)`);

    console.log(`\n📱 POSTS BY PLATFORM:`);
    Object.entries(postsByPlatform).forEach(([platform, count]) => {
      const platformAnalytics = analytics.by_platform[platform];
      console.log(`  ${platform}: ${count} posts (avg sentiment: ${platformAnalytics?.avg_sentiment?.toFixed(1) || 'N/A'})`);
    });

    console.log(`\n🏷️  TOP HASHTAGS:`);
    analytics.top_hashtags.slice(0, 10).forEach((h, i) => {
      console.log(`  ${i + 1}. ${h.tag} (${h.count} posts, avg sentiment: ${h.avg_sentiment})`);
    });

    console.log(`\n💬 TOP TOPICS:`);
    analytics.top_topics.slice(0, 10).forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.topic} (${t.count} mentions, avg sentiment: ${t.avg_sentiment})`);
    });

    console.log('\n');

    return {
      success: true,
      analyticsId: analytics.id
    };

  } catch (error) {
    logger.error('Analytics generation failed', {
      campaignId,
      runId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    logger.clearContext();
  }
}

// Get parameters from command line
const campaignId = process.argv[2];
const runId = process.argv[3];

if (!campaignId || !runId) {
  console.error('Usage: npm run analytics <campaign-id> <run-id>');
  process.exit(1);
}

// Run the script
generateAnalytics(campaignId, runId)
  .then((result) => {
    logger.info('Script finished successfully', result);
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

