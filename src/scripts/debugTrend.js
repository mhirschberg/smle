const campaignRepository = require('../modules/repositories/campaignRepository');
const logger = require('../utils/logger');

const campaignId = 'b54631e2-59f9-4078-8b7e-530cd55bac0c';

async function check() {
    try {
        console.log('Fetching runs for trend analysis...');
        const runs = await campaignRepository.getRuns(campaignId, 1000);

        const trend = runs
            .filter(r => r.status === 'completed')
            .sort((a, b) => a.run_number - b.run_number)
            .map(r => ({
                run_number: r.run_number,
                run_id: r.id,
                raw_sentiment: r.stats?.avg_sentiment,
                parsed_sentiment: r.stats?.avg_sentiment ? parseFloat(r.stats.avg_sentiment) : null,
                type: typeof (r.stats?.avg_sentiment ? parseFloat(r.stats.avg_sentiment) : null)
            }));

        console.log('Trend Data:', JSON.stringify(trend, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
