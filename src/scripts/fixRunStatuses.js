const campaignRepository = require('../modules/repositories/campaignRepository');
const logger = require('../utils/logger');

const runIds = [
    'c15422e6-3013-41bb-9117-18faa7483657',
    '2cf06e3e-b152-4588-bb16-49e1eb81fccc',
    '4af94d47-9a37-4699-9543-bb3992e5bd85',
    // '3c9c47e5-62cf-403a-96a2-88307fc1bd92', // Already completed
    '0bea3af9-8ead-4232-8d8d-82c1107ae157'
];

async function fixStatuses() {
    try {
        console.log(`Fixing statuses for ${runIds.length} runs...`);

        for (const runId of runIds) {
            const run = await campaignRepository.getRun(runId);
            if (run) {
                console.log(`Updating run ${runId} (Run #${run.run_number}) from ${run.status} to completed`);
                run.status = 'completed';
                run.completed_at = new Date().toISOString(); // Set completion time to now if missing
                run.error = null; // Clear error
                await campaignRepository.updateRun(runId, run);
            } else {
                console.warn(`Run ${runId} not found`);
            }
        }

        console.log('Statuses updated.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fixStatuses();
