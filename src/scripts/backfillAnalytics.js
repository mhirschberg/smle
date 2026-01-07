const { spawn } = require('child_process');
const path = require('path');

const campaignId = 'b54631e2-59f9-4078-8b7e-530cd55bac0c';
const runIds = [
    '0bea3af9-8ead-4232-8d8d-82c1107ae157',
    'c15422e6-3013-41bb-9117-18faa7483657',
    '4af94d47-9a37-4699-9543-bb3992e5bd85',
    '2cf06e3e-b152-4588-bb16-49e1eb81fccc'
];

async function runBackfill() {
    console.log(`Starting backfill for ${runIds.length} missing runs...`);

    for (const runId of runIds) {
        console.log(`Processing Run ID: ${runId}`);
        await new Promise((resolve, reject) => {
            const scriptPath = path.join(__dirname, 'generateAnalytics.js');
            const child = spawn('node', [scriptPath, campaignId, runId], {
                stdio: 'inherit'
            });

            child.on('close', (code) => {
                if (code === 0) {
                    console.log(`Successfully generated analytics for run ${runId}`);
                    resolve();
                } else {
                    console.error(`Failed to generate analytics for run ${runId} with code ${code}`);
                    reject(new Error(`Exit code ${code}`));
                }
            });

            child.on('error', (err) => {
                console.error(`Failed to spawn script for run ${runId}:`, err);
                reject(err);
            });
        });
    }

    console.log('Backfill completed.');
}

runBackfill().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
