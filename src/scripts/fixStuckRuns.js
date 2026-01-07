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

        // Determine scope and query based on DB type
        const config = require('../config');
        const dbType = (process.env.DB_TYPE || config.db.type).toLowerCase();
        let query;
        let params;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            const table = db.getCollectionPath('search_runs');
            const statusPath = db.getPropertyPath('doc', 'status');
            const updatedAtPath = db.getPropertyPath('doc', 'updated_at');
            const runAtPath = db.getPropertyPath('doc', 'run_at');

            query = `
                SELECT id as id, doc
                FROM ${table}
                WHERE ${statusPath} = $1
                AND (${updatedAtPath} < $2 OR ${updatedAtPath} IS NULL)
                AND ${runAtPath} < $2
            `;
            params = ['running', cutoffTime];
        } else {
            // N1QL query to find stuck runs
            query = `
                SELECT META().id as id, r.*
                FROM SMLE._default.search_runs r
                WHERE r.status = 'running'
                AND (r.updated_at < $cutoffTime OR r.updated_at IS MISSING)
                AND r.run_at < $cutoffTime
            `;
            params = { cutoffTime };
        }

        const stuckRuns = await db.query(query, {
            parameters: params
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
