const dbFactory = require('../modules/storage/dbFactory');
const platformManager = require('../modules/platforms/platformManager');
const embeddingGenerator = require('../modules/analysis/embeddingGenerator');
const logger = require('../utils/logger');

async function generateEmbeddings(campaignId = null, runId = null) {
  let db;
  try {
    logger.info('=== Generating Embeddings for Existing Posts ===', { campaignId, runId });

    const config = require('../config');
    const dbType = (process.env.DB_TYPE || config.db.type).toLowerCase();

    db = await dbFactory.getDB();

    // Determine scope
    let query;
    let parameters = [];
    const platforms = ['instagram', 'tiktok', 'twitter', 'reddit', 'facebook', 'youtube', 'linkedin'];

    logger.info('Finding posts without embeddings...', { scope: campaignId ? 'campaign' : 'all', dbType });

    if (dbType === 'postgres' || dbType === 'cratedb') {
      let whereClause = "doc->>'analysis_status' = 'analyzed' AND (doc->'analysis'->>'embedding' IS NULL)";

      if (campaignId && runId) {
        whereClause += " AND doc->>'campaign_id' = $1 AND doc->>'run_id' = $2";
        parameters = [campaignId, runId];
      } else if (campaignId) {
        whereClause += " AND doc->>'campaign_id' = $1";
        parameters = [campaignId];
      }

      const unionQueries = platforms.map(platform => {
        const collection = platformManager.getCollection(platform);
        return `SELECT id as docid, doc, '${collection}' as source_collection FROM ${collection} WHERE ${whereClause}`;
      });

      query = unionQueries.join(' UNION ALL ');
    } else {
      // Couchbase N1QL
      let whereClause = `p.analysis_status = 'analyzed' AND (p.analysis.embedding IS NULL OR p.analysis.embedding IS MISSING)`;
      let n1qlParams = {};

      if (campaignId && runId) {
        whereClause = `p.campaign_id = $campaignId AND p.run_id = $runId AND ${whereClause}`;
        n1qlParams.campaignId = campaignId;
        n1qlParams.runId = runId;
      } else if (campaignId) {
        whereClause = `p.campaign_id = $campaignId AND ${whereClause}`;
        n1qlParams.campaignId = campaignId;
      }

      const unionQueries = platforms.map(platform => {
        const collection = platformManager.getCollection(platform);
        return `
          SELECT META().id as docId, p.*, '${collection}' as source_collection
          FROM SMLE._default.${collection} p
          WHERE ${whereClause}
        `;
      });

      query = unionQueries.join(' UNION ALL ');
      parameters = n1qlParams;
    }

    const results = await db.query(query, { parameters });

    logger.info(`Found ${results.length} posts needing embeddings`);

    if (results.length === 0) {
      logger.info('No posts need embeddings. All done!');
      return;
    }

    // Group by platform for logging
    const byPlatform = {};
    results.forEach(r => {
      const post = (dbType === 'postgres' || dbType === 'cratedb') ? r.doc : (r.p || r);
      const platform = post.platform;
      byPlatform[platform] = (byPlatform[platform] || 0) + 1;
    });
    logger.info('Posts by platform', byPlatform);

    const CONCURRENCY = 10;
    let successCount = 0;
    let failCount = 0;

    // Process in batches
    for (let i = 0; i < results.length; i += CONCURRENCY) {
      const batch = results.slice(i, i + CONCURRENCY);

      logger.info(`Processing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(results.length / CONCURRENCY)}`, {
        posts: `${i + 1}-${Math.min(i + CONCURRENCY, results.length)} of ${results.length}`
      });

      const batchResults = await Promise.allSettled(
        batch.map(async (row) => {
          let docId, source_collection, post;

          if (dbType === 'postgres' || dbType === 'cratedb') {
            docId = row.docid;
            source_collection = row.source_collection;
            post = row.doc;
          } else {
            const { docId: dId, source_collection: sc, ...p } = row;
            docId = dId;
            source_collection = sc;
            post = p.p || p;
          }

          try {
            const embedding = await embeddingGenerator.generateEmbedding(post);

            if (!post.analysis) post.analysis = {};
            post.analysis.embedding = embedding;
            post.updated_at = new Date().toISOString();

            await db.upsert(source_collection, docId, post);

            logger.debug('Embedding generated', {
              postId: docId,
              platform: post.platform,
              dimension: embedding?.length
            });

            return { success: true };
          } catch (error) {
            logger.error('Failed to generate embedding', {
              postId: docId,
              error: error.message
            });
            return { success: false };
          }
        })
      );

      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          failCount++;
        }
      });

      logger.info(`Batch completed`, { success: successCount, failed: failCount });
    }

    logger.info('=== Embeddings Generation Completed ===', {
      total: results.length,
      success: successCount,
      failed: failCount
    });

    console.log(`\n✅ Generated embeddings for ${successCount} posts`);
    if (failCount > 0) {
      console.log(`❌ Failed: ${failCount} posts\n`);
    }

  } catch (error) {
    logger.error('Failed to generate embeddings', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    if (db) await db.disconnect();
  }
}

// Get parameters from command line
const campaignId = process.argv[2] || null;
const runId = process.argv[3] || null;

// Run the script
generateEmbeddings(campaignId, runId)
  .then(() => {
    logger.info('Script finished successfully');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

