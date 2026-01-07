const config = require('../config');
const logger = require('../utils/logger');
const dbFactory = require('../modules/storage/dbFactory');

async function migrateCampaigns() {
    let db;
    try {
        logger.info('Starting migration: Assigning campaigns to root user...');

        db = await dbFactory.getDB();
        const dbType = config.db.type.toLowerCase();

        // 1. Get Root User ID
        let queryUser;
        let userParams;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            queryUser = `
                SELECT id
                FROM _default
                WHERE doc->>'type' = 'user' AND doc->>'username' = 'root'
                LIMIT 1
            `;
            userParams = [];
        } else {
            queryUser = `
                SELECT META().id
                FROM SMLE._default._default
                WHERE type = 'user' AND username = 'root'
                LIMIT 1
            `;
            userParams = {};
        }

        const userResult = await db.query(queryUser, { parameters: userParams });

        if (userResult.length === 0) {
            throw new Error('Root user not found. Please run setupAuth.js first.');
        }

        const rootUserId = userResult[0].id;
        logger.info(`Found root user id: ${rootUserId}`);

        // 2. Update all campaigns (type='campaign') to have owner_id = rootUserId
        let queryCampaigns;
        let updateParams;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            queryCampaigns = `
                UPDATE searches
                SET doc = jsonb_set(doc, '{owner_id}', $1::jsonb)
                WHERE doc->>'type' = 'campaign' AND (doc->>'owner_id' IS NULL)
            `;
            updateParams = [JSON.stringify(rootUserId)];
        } else {
            queryCampaigns = `
                UPDATE SMLE._default.searches
                SET owner_id = $rootUserId
                WHERE type = 'campaign' AND (owner_id IS MISSING OR owner_id IS NULL)
            `;
            updateParams = { rootUserId };
        }

        const updateResult = await db.query(queryCampaigns, { parameters: updateParams });

        const mutationCount = dbType === 'postgres' || dbType === 'cratedb' ? (updateResult.length || 0) : (updateResult.meta?.metrics?.mutationCount || 0);
        logger.info(`Migration completed. Updated campaigns count: ${mutationCount}`);
        process.exit(0);

    } catch (error) {
        logger.error('Migration failed', { error: error.message, stack: error.stack });
        process.exit(1);
    } finally {
        if (db) await db.disconnect();
    }
}

migrateCampaigns();
