const dbFactory = require('../modules/storage/dbFactory');
const campaignRepository = require('../modules/repositories/campaignRepository');
const postRepository = require('../modules/repositories/postRepository');
const logger = require('../utils/logger');

async function repairMetadata() {
    try {
        const db = await dbFactory.getDB();
        console.log('=== Starting Campaign Metadata Repair ===');

        const campaigns = await campaignRepository.getAll();
        console.log(`Found ${campaigns.length} campaigns`);

        for (const campaign of campaigns) {
            console.log(`\nChecking campaign: ${campaign.search_query} (${campaign.id})`);

            // 1. Count actual runs
            const runs = await campaignRepository.getRuns(campaign.id);
            const actualRunCount = runs.length;

            // 2. Count actual posts
            const actualPostCount = await postRepository.getTotalPostCount(campaign.id);

            // 3. Update campaign if needed
            let needsUpdate = false;
            const updates = {};

            if (campaign.total_runs !== actualRunCount) {
                console.log(`- Run Count Mismatch: Doc=${campaign.total_runs}, Actual=${actualRunCount}`);
                updates.total_runs = actualRunCount;
                campaign.total_runs = actualRunCount;
                needsUpdate = true;
            } else {
                console.log(`- Run Count OK: ${actualRunCount}`);
            }

            if (campaign.post_count !== actualPostCount) {
                console.log(`- Post Count Mismatch: Doc=${campaign.post_count}, Actual=${actualPostCount}`);
                updates.post_count = actualPostCount;
                campaign.post_count = actualPostCount;
                needsUpdate = true;
            } else {
                console.log(`- Post Count OK: ${actualPostCount}`);
            }

            if (needsUpdate) {
                console.log('-> Updating campaign document...');
                await campaignRepository.create(campaign); // upsert
                console.log('-> Updated successfully');
            }
        }

        console.log('\n=== Repair Completed ===');
        process.exit(0);

    } catch (error) {
        console.error('Repair failed:', error);
        process.exit(1);
    }
}

repairMetadata();
