const couchbase = require('couchbase');
const config = require('../config');
const logger = require('../utils/logger');

async function migrateCampaigns() {
    let cluster;
    try {
        logger.info('Starting migration: Assigning campaigns to root user...');

        cluster = await couchbase.connect(
            config.db.couchbase.connectionString,
            {
                username: config.db.couchbase.username,
                password: config.db.couchbase.password
            }
        );

        const bucketName = 'SMLE';
        const scopeName = '_default';
        const collectionName = '_default'; // Default collection where users are now stored (and campaigns)
        // Note: Campaigns are in searches collection? Let's check adapter.
        // Adapter: searches: scope.collection('searches')
        // Users: scope.collection('_default') (as per our fix)

        // 1. Get Root User ID
        const queryUser = `
            SELECT META().id
            FROM \`${bucketName}\`.\`${scopeName}\`.\`${collectionName}\`
            WHERE type = 'user' AND username = 'root'
            LIMIT 1
        `;
        const userResult = await cluster.query(queryUser);

        if (userResult.rows.length === 0) {
            throw new Error('Root user not found. Please run setupAuth.js first.');
        }

        const rootUserId = userResult.rows[0].id;
        logger.info(`Found root user id: ${rootUserId}`);

        // 2. Update all campaigns (type='campaign') to have owner_id = rootUserId
        // Campaigns are in 'searches' collection
        const searchesCollection = 'searches';

        const queryCampaigns = `
            UPDATE \`${bucketName}\`.\`${scopeName}\`.\`${searchesCollection}\`
            SET owner_id = $rootUserId
            WHERE type = 'campaign' AND (owner_id IS MISSING OR owner_id IS NULL)
        `;

        const updateResult = await cluster.query(queryCampaigns, { parameters: { rootUserId } });

        logger.info(`Migration completed. Updated campaigns count: ${updateResult.meta.metrics.mutationCount}`);
        process.exit(0);

    } catch (error) {
        logger.error('Migration failed', { error: error.message, stack: error.stack });
        process.exit(1);
    } finally {
        if (cluster) await cluster.close();
    }
}

migrateCampaigns();
