const couchbaseClient = require('../modules/storage/couchbaseClient');
const platformManager = require('../modules/platforms/platformManager');
const logger = require('../utils/logger');

async function reanalyzeCampaign(campaignId) {
  try {
    logger.info('=== Re-analyzing Campaign ===', { campaignId });
    
    await couchbaseClient.connect();
    
    // Get campaign
    const campaign = await couchbaseClient.get('searches', campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }
    
    const platforms = campaign.platforms || [campaign.platform];
    
    logger.info('Campaign loaded', {
      query: campaign.search_query,
      platforms: platforms
    });
    
    // Reset all posts to pending for re-analysis
    let totalReset = 0;
    
    for (const platform of platforms) {
      const collection = platformManager.getCollection(platform);
      
      const updateQuery = `
        UPDATE SMLE._default.${collection}
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
      
      try {
        const results = await couchbaseClient.query(updateQuery, {
          parameters: { campaignId }
        });
        
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
    
    // Now trigger analysis for each run
    const runsQuery = `
      SELECT r.*
      FROM SMLE._default.search_runs r
      WHERE r.campaign_id = $campaignId
      ORDER BY r.run_number ASC
    `;
    
    const runs = await couchbaseClient.query(runsQuery, {
      parameters: { campaignId }
    });
    
    logger.info(`Found ${runs.length} runs to re-analyze`);
    
    console.log(`\n✅ Reset ${totalReset} posts to pending status`);
    console.log(`📊 Found ${runs.length} run(s) in this campaign\n`);
    console.log('To analyze them, run:\n');
    
    runs.forEach((r, idx) => {
      const run = r.r || r;
      console.log(`  Run #${run.run_number}:`);
      console.log(`    npm run analyze-posts ${campaignId} ${run.id}\n`);
    });
    
    console.log('Or analyze all runs sequentially:\n');
    
    for (const r of runs) {
      const run = r.r || r;
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
    await couchbaseClient.disconnect();
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

