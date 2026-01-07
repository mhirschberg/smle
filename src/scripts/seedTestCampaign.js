const { v4: uuidv4 } = require('uuid');
const dbFactory = require('../modules/storage/dbFactory');
const campaignRepository = require('../modules/repositories/campaignRepository');
const logger = require('../utils/logger');
const config = require('../config');

async function seedTestCampaign() {
    let db;
    try {
        console.log('--- Seeding Test Campaign ---');
        db = await dbFactory.getDB();
        const dbType = config.db.type.toLowerCase();

        // 1. Create Campaign
        const campaignId = uuidv4();
        const campaign = {
            id: campaignId,
            type: 'campaign',
            search_query: 'Test CrateDB Campaign',
            platform: 'instagram',
            platforms: ['instagram', 'reddit'],
            status: 'active',
            created_at: new Date().toISOString()
        };

        console.log(`Creating campaign: ${campaignId}`);
        await campaignRepository.create(campaign);

        // 2. Create Run
        const runId = uuidv4();
        const run = {
            id: runId,
            type: 'search_run',
            campaign_id: campaignId,
            status: 'running',
            run_at: new Date().toISOString(),
            stats: {
                posts_scraped: 10,
                posts_analyzed: 0,
                avg_sentiment: 0
            },
            created_at: new Date().toISOString()
        };

        console.log(`Creating run: ${runId}`);
        await campaignRepository.createRun(run);

        // 3. Create Dummy Posts
        const platforms = ['instagram', 'reddit'];
        const numPostsPerPlatform = 5;

        for (const platform of platforms) {
            const table = `${platform}_posts`;
            console.log(`Adding ${numPostsPerPlatform} posts to ${table}...`);

            for (let i = 0; i < numPostsPerPlatform; i++) {
                const postId = uuidv4();
                const post = {
                    id: postId,
                    platform: platform,
                    campaign_id: campaignId,
                    run_id: runId,
                    shortcode: `test-${platform}-${i}`,
                    content: `This is test post ${i} for ${platform} on CrateDB.`,
                    analysis_status: 'pending',
                    created_at: new Date().toISOString(),
                    raw_data: {
                        engagement: {
                            likes: Math.floor(Math.random() * 100),
                            num_comments: Math.floor(Math.random() * 20)
                        }
                    }
                };

                await db.upsert(table, postId, post);
            }
        }

        console.log('\n✅ Seeding Complete!');
        console.log(`Campaign ID: ${campaignId}`);
        console.log(`Run ID:      ${runId}`);
        console.log('\nTo test analysis, run:');
        console.log(`node src/scripts/analyzePosts.js ${campaignId} ${runId}`);
        console.log('\nTo test analytics, run:');
        console.log(`node src/scripts/generateAnalytics.js ${campaignId} ${runId}`);

    } catch (err) {
        console.error('❌ Seeding failed:', err.message);
        console.error(err.stack);
    } finally {
        if (db) await db.disconnect();
    }
}

seedTestCampaign();
