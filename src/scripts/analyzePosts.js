const campaignRepository = require('../modules/repositories/campaignRepository');
const postRepository = require('../modules/repositories/postRepository');
const platformManager = require('../modules/platforms/platformManager');
const llmAnalyzer = require('../modules/analysis/llmAnalyzer');
const embeddingGenerator = require('../modules/analysis/embeddingGenerator');
const logger = require('../utils/logger');
const dbFactory = require('../modules/storage/dbFactory');

async function analyzePosts(campaignId, runId) {
  let db;
  try {
    logger.setContext(campaignId, runId);
    logger.info('=== Starting Post Analysis ===', { campaignId, runId });

    // Step 1: Connect to DB
    logger.info('Step 1: Connecting to Database...');
    db = await dbFactory.getDB();

    // Step 2: Get campaign to determine platforms
    const campaign = await campaignRepository.getById(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    const platforms = campaign.platforms || [campaign.platform];

    logger.info('Step 2: Finding posts to analyze from all platforms...', { platforms });

    // Step 3: Build UNION query for all platforms
    const config = require('../config');
    const dbType = (process.env.DB_TYPE || config.db.type).toLowerCase();
    let query;
    let params;

    if (dbType === 'postgres' || dbType === 'cratedb') {
      const unionQueries = platforms.map(platform => {
        const collection = platformManager.getCollection(platform);
        return `
          SELECT id as docid, doc, '${collection}' as source_collection
          FROM ${collection}
          WHERE doc->>'campaign_id' = $1
          AND doc->>'run_id' = $2
          AND doc->>'analysis_status' = 'pending'
        `;
      });
      query = unionQueries.join(' UNION ALL ');
      params = [campaignId, runId];
    } else {
      const unionQueries = platforms.map(platform => {
        const collection = platformManager.getCollection(platform);
        return `
          SELECT META().id as docId, p.*, '${collection}' as source_collection
          FROM SMLE._default.${collection} p
          WHERE p.campaign_id = $campaignId
          AND p.run_id = $runId
          AND p.analysis_status = 'pending'
        `;
      });
      query = unionQueries.join(' UNION ALL ');
      params = { campaignId, runId };
    }

    const results = await db.query(query, {
      parameters: params
    });

    logger.info(`Found ${results.length} posts to analyze across all platforms`);

    if (results.length === 0) {
      logger.warn('No pending posts found');
      return;
    }

    // Log breakdown by platform
    const breakdown = {};
    results.forEach(r => {
      const post = dbType === 'postgres' || dbType === 'cratedb' ? r.doc : (r.p || r);
      const platform = post.platform;
      breakdown[platform] = (breakdown[platform] || 0) + 1;
    });
    logger.info('Posts by platform', breakdown);

    // Step 4: Analyze posts in parallel with concurrency control
    logger.info('Step 4: Analyzing posts with LLM (parallel mode with embeddings)...');

    const CONCURRENCY = 20;  // High concurrency
    const now = new Date().toISOString();

    let successCount = 0;
    let failCount = 0;
    const statsByPlatform = {};

    // Initialize platform stats
    platforms.forEach(p => {
      statsByPlatform[p] = { analyzed: 0, failed: 0 };
    });

    // Process in batches
    for (let i = 0; i < results.length; i += CONCURRENCY) {
      const batch = results.slice(i, i + CONCURRENCY);

      logger.info(`Processing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(results.length / CONCURRENCY)}`, {
        posts: `${i + 1}-${Math.min(i + CONCURRENCY, results.length)} of ${results.length}`
      });

      // Analyze batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(row => analyzePost(db, row, now))
      );

      // Count successes and failures
      batchResults.forEach((result, idx) => {
        const row = batch[idx];
        const post = dbType === 'postgres' || dbType === 'cratedb' ? row.doc : (row.p || row);
        const platform = post.platform;

        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
          if (statsByPlatform[platform]) statsByPlatform[platform].analyzed++;
        } else {
          failCount++;
          if (statsByPlatform[platform]) statsByPlatform[platform].failed++;
        }
      });

      logger.info(`Batch completed`, {
        batchSuccess: batchResults.filter(r => r.status === 'fulfilled' && r.value.success).length,
        batchFailed: batchResults.filter(r => r.status === 'rejected' || !r.value?.success).length
      });
    }

    logger.info('=== Analysis Completed ===', {
      campaignId,
      runId,
      analyzed: successCount,
      failed: failCount,
      byPlatform: statsByPlatform
    });

    // Step 5: Update run document with average sentiment
    logger.info('Step 5: Updating run document...');

    const avgSentiments = {};
    for (const platform of platforms) {
      avgSentiments[platform] = await calculateAvgSentiment(db, campaignId, runId, platform);
    }

    // CRITICAL: Reload run to avoid overwriting late-arriving scraper stats
    const run = await campaignRepository.getRun(runId);
    if (run) {
      run.stats.posts_analyzed = successCount;

      // Calculate overall average sentiment across all platforms
      const allSentiments = Object.values(avgSentiments).filter(s => s !== null);
      if (allSentiments.length > 0) {
        run.stats.avg_sentiment = Math.round(
          (allSentiments.reduce((sum, s) => sum + s, 0) / allSentiments.length) * 10
        ) / 10;
      }

      // Store per-platform sentiments
      if (!run.stats.by_platform) {
        run.stats.by_platform = {};
      }

      platforms.forEach(platform => {
        if (!run.stats.by_platform[platform]) {
          run.stats.by_platform[platform] = {};
        }
        run.stats.by_platform[platform].posts_analyzed = statsByPlatform[platform].analyzed;
        run.stats.by_platform[platform].avg_sentiment = avgSentiments[platform];
      });

      run.updated_at = now;
      await campaignRepository.updateRun(runId, run);
    }

    logger.info('Run document updated with multi-platform stats');

    return {
      success: true,
      analyzed: successCount,
      failed: failCount,
      byPlatform: statsByPlatform
    };

  } catch (error) {
    logger.error('Analysis failed', {
      campaignId,
      runId,
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    if (db) {
      await db.disconnect();
    }
    logger.clearContext();
  }
}

/**
 * Analyze a single post (WITH EMBEDDINGS)
 */
async function analyzePost(db, row, timestamp) {
  const config = require('../config');
  const dbType = (process.env.DB_TYPE || config.db.type).toLowerCase();

  // Postgres results from pg come back with lowercase column names unless quoted.
  // Our query uses 'SELECT id as docid', so it will be row.docid.
  const postId = dbType === 'postgres' || dbType === 'cratedb' ? (row.docid || row.docId) : row.docId;
  const collection = row.source_collection;

  // Extract post document based on DB type
  let post;
  if (dbType === 'postgres' || dbType === 'cratedb') {
    post = row.doc;
  } else {
    const { docId, source_collection, ...extractedPost } = row;
    post = extractedPost;
  }

  if (!postId) {
    logger.error('No postId found in row for analysis', { row, dbType });
    return { success: false, error: 'No postId found' };
  }

  try {
    logger.debug(`Analyzing post`, {
      platform: post.platform,
      shortcode: post.shortcode || post.post_id
    });

    // Get LLM analysis
    const analysis = await llmAnalyzer.analyzePost(post);

    // Generate embedding (RE-ENABLED)
    const embedding = await embeddingGenerator.generateEmbedding(post);

    // Update post document
    post.analysis = {
      ...analysis,
      embedding: embedding,
      analyzed_at: timestamp,
      llm_model: process.env.LLM_MODEL || 'llama3.2'
    };

    post.analysis_status = 'analyzed';
    post.updated_at = timestamp;

    // Save to correct collection
    await db.upsert(collection, postId, post);

    logger.info('Post analyzed', {
      postId,
      platform: post.platform,
      sentiment: analysis.sentiment_label,
      score: analysis.sentiment_score,
      topics: analysis.key_topics
    });

    return { success: true, postId, platform: post.platform };

  } catch (error) {
    logger.error('Failed to analyze post', {
      postId,
      platform: post.platform,
      error: error.message
    });

    // Mark as failed
    try {
      post.analysis_status = 'failed';
      if (!post.analysis) post.analysis = {};
      post.analysis.error = error.message;
      post.updated_at = timestamp;
      await db.upsert(collection, postId, post);
    } catch (updateError) {
      logger.error('Failed to update post status', {
        postId,
        error: updateError.message
      });
    }

    return { success: false, postId, platform: post.platform, error: error.message };
  }
}

/**
 * Calculate average sentiment for a platform in a run
 */
async function calculateAvgSentiment(db, campaignId, runId, platform) {
  try {
    const collection = platformManager.getCollection(platform);
    const dbType = require('../config').db.type.toLowerCase();
    let query;
    let params;

    if (dbType === 'postgres' || dbType === 'cratedb') {
      query = `
        SELECT AVG((doc->'analysis'->>'sentiment_score')::float) as avg_sentiment
        FROM ${collection}
        WHERE doc->>'campaign_id' = $1
        AND doc->>'run_id' = $2
        AND doc->'analysis'->>'sentiment_score' IS NOT NULL
      `;
      params = [campaignId, runId];
    } else {
      query = `
        SELECT AVG(p.analysis.sentiment_score) as avg_sentiment
        FROM SMLE._default.${collection} p
        WHERE p.campaign_id = $campaignId
        AND p.run_id = $runId
        AND p.analysis.sentiment_score IS NOT NULL
      `;
      params = { campaignId, runId };
    }

    const result = await db.query(query, {
      parameters: params
    });

    if (result.length > 0 && result[0].avg_sentiment) {
      return Math.round(result[0].avg_sentiment * 10) / 10;
    }

    return null;
  } catch (error) {
    logger.error('Failed to calculate avg sentiment', {
      platform,
      error: error.message
    });
    return null;
  }
}

// Get parameters from command line
const campaignId = process.argv[2];
const runId = process.argv[3];

if (!campaignId || !runId) {
  console.error('Usage: npm run analyze-posts <campaign-id> <run-id>');
  process.exit(1);
}

// Run the script
analyzePosts(campaignId, runId)
  .then((result) => {
    logger.info('Script finished successfully', result);
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });
