const dbFactory = require('../modules/storage/dbFactory');
const logger = require('../utils/logger');

async function fixStuckRuns() {
    let db;
    try {
        logger.info('Starting stuck run cleanup...');
        db = await dbFactory.getDB();

        // Find runs that are 'running' but haven't been updated in the last 15 minutes
        // (Adjust timeframe as needed) // 15 minutes ago
        const cutoffTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();

        // N1QL query to find stuck runs
        // Note: This relies on the updated_at field being updated during the process.
        // If updated_at is missing, we might need to rely on run_at.
        const query = `
      SELECT META().id as id, r.*
      FROM SMLE._default.search_runs r
      WHERE r.status = 'running'
      AND (r.updated_at < $cutoffTime OR r.updated_at IS MISSING)
      AND r.run_at < $cutoffTime
    `;

        const stuckRuns = await db.query(query, {
            parameters: { cutoffTime }
        });

        logger.info(`Found ${stuckRuns.length} potentially stuck runs`);

        for (const row of stuckRuns) {
            const runId = row.id;
            const run = row.search_runs || row; // Handle potential wrapping depending on query result structure

            logger.info(`Fixing stuck run: ${runId}`, { runAt: run.run_at, updatedAt: run.updated_at });

            run.status = 'failed';
            run.error = 'Run marked as failed by cleanup script (stuck in running state)';
            run.failed_at = new Date().toISOString();
            run.updated_at = new Date().toISOString();

            await db.upsert('search_runs', runId, run);
            logger.info(`Marked run ${runId} as failed`);
        }

        logger.info('Cleanup completed successfully');

    } catch (error) {
        logger.error('Cleanup failed', { error: error.message });
        process.exit(1);
    } finally {
        if (db) {
            await db.disconnect();
        }
    }
}

fixStuckRuns();
