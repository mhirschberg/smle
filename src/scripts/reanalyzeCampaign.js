const campaignRepository = require('../modules/repositories/campaignRepository');
const dbFactory = require('../modules/storage/dbFactory');
const platformManager = require('../modules/platforms/platformManager');
const logger = require('../utils/logger');
const config = require('../config');

async function reanalyzeCampaign(campaignId) {
  try {
    logger.info('=== Re-analyzing Campaign ===', { campaignId });

    // Use repository to get campaign
    const campaign = await campaignRepository.getById(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    const platforms = campaign.platforms || [campaign.platform];
    const db = await dbFactory.getDB();
    const dbType = config.db.type.toLowerCase();

    logger.info('Campaign loaded', {
      query: campaign.search_query,
      platforms: platforms
    });

    // Reset all posts to pending for re-analysis
    let totalReset = 0;

    for (const platform of platforms) {
      const collection = platformManager.getCollection(platform);
      let query;
      let params = { campaignId };

      if (dbType === 'postgres' || dbType === 'cratedb') {
        const collectionPath = db.getCollectionPath(collection);
        const campaignIdPath = db.getPropertyPath('doc', 'campaign_id');
        const statusPath = db.getPropertyPath('doc', 'analysis_status');
        const analysisPath = db.getPropertyPath('doc', 'analysis');
        const returning = dbType === 'cratedb' ? '' : ' RETURNING id';

        // Simplified reset logic: set analysis_status and analysis object
        // For CrateDB/Postgres we use standard SQL update on the columns
        const emptyAnalysis = JSON.stringify({
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
        });

        if (dbType === 'postgres') {
          query = `
            UPDATE ${collectionPath}
            SET doc = jsonb_set(
              jsonb_set(doc, '{analysis_status}', '"pending"'),
              '{analysis}',
              $2::jsonb
            )
            WHERE ${campaignIdPath} = $1
            AND ${statusPath} = 'analyzed'
            ${returning}
          `;
        } else {
          // CrateDB approach: update subcolumns directly
          query = `
            UPDATE ${collectionPath}
            SET ${statusPath} = 'pending',
                ${analysisPath} = $2
            WHERE ${campaignIdPath} = $1
            AND ${statusPath} = 'analyzed'
          `;
        }
        params = [campaignId, emptyAnalysis];
      } else {
        const collectionPath = db.getCollectionPath(collection);
        query = `
          UPDATE ${collectionPath}
          SET analysis_status = 'pending',
              analysis = {
                "sentiment_score": null,
                "sentiment_label": null,
                "key_topics": [],
                "brand_mentioned": null,
                "summary": null,
                "language": null,
                "embedding": null,
                "analyzed_at": null,
                "llm_model": null,
                "error": null
              }
          WHERE campaign_id = $campaignId
          AND analysis_status = 'analyzed'
          RETURNING META().id
        `;
        params = { campaignId };
      }

      try {
        const results = await db.query(query, { parameters: params });
        logger.info(`Reset ${results.length} posts in ${collection}`);
        totalReset += results.length;
      } catch (err) {
        logger.error(`Failed to reset ${collection}`, { error: err.message });
      }
    }

    logger.info(`Total posts reset: ${totalReset}`);

    if (totalReset === 0) {
      logger.warn('No posts found to re-analyze');
      return;
    }

    // Now trigger analysis for each run using repository
    const runs = await campaignRepository.getRuns(campaignId, 1000);

    logger.info(`Found ${runs.length} runs to re-analyze`);

    console.log(`\n✅ Reset ${totalReset} posts to pending status`);
    console.log(`📊 Found ${runs.length} run(s) in this campaign\n`);
    console.log('To analyze them, run:\n');

    runs.forEach((run, idx) => {
      console.log(`  Run #${run.run_number}:`);
      console.log(`    npm run analyze-posts ${campaignId} ${run.id}\n`);
    });

    console.log('Or analyze all runs sequentially:\n');

    for (const run of runs) {
      logger.info(`Analyzing Run #${run.run_number}...`);

      const { execSync } = require('child_process');
      try {
        execSync(`npm run analyze-posts ${campaignId} ${run.id}`, {
          stdio: 'inherit',
          cwd: require('path').resolve(__dirname, '../../')
        });
        logger.info(`✅ Run #${run.run_number} completed`);
      } catch (error) {
        logger.error(`❌ Run #${run.run_number} failed`, { error: error.message });
      }
    }

    logger.info('=== Re-analysis Complete ===');

  } catch (error) {
    logger.error('Re-analysis failed', { error: error.message, stack: error.stack });
    throw error;
  } finally {
    // No explicit disconnect needed since factory handles it
  }
}

const campaignId = process.argv[2];

if (!campaignId) {
  console.error('Usage: node src/scripts/reanalyzeCampaign.js <campaign-id>');
  process.exit(1);
}

reanalyzeCampaign(campaignId)
  .then(() => {
    logger.info('Script finished successfully');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

