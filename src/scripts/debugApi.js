const campaignRepository = require('../modules/repositories/campaignRepository');
const postRepository = require('../modules/repositories/postRepository');
const logger = require('../utils/logger');

async function check() {
    try {
        console.log('Simulating controller getAll logic...');
        const results = await campaignRepository.getAll();

        for (const campaignData of results) {
            const campaignId = campaignData.id;
            let totalRuns = await campaignRepository.getTotalRunCount(campaignId);

            console.log('Campaign:', {
                id: campaignId,
                name: campaignData.search_query,
                total_runs: totalRuns, // This is what the controller now sets
                raw_doc_total_runs: campaignData.total_runs
            });
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
