const dbFactory = require('../modules/storage/dbFactory');
const logger = require('../utils/logger');
const config = require('../config');

async function runTest() {
    const dbType = config.db.type;
    console.log(`Starting Database Diagnostic for: ${dbType}`);

    let db;
    try {
        db = await dbFactory.getDB();
        console.log('✅ Successfully initialized database adapter.');
    } catch (err) {
        console.error('❌ Failed to initialize database adapter:', err.message);
        process.exit(1);
    }

    try {
        // 1. Connection Test
        console.log('\n--- 1. Connection Test ---');
        await db.connect();
        console.log('✅ Connected successfully.');

        // 2. Collection Path Test
        console.log('\n--- 2. Collection Path Test ---');
        const testCollection = 'searches';
        const collectionPath = db.getCollectionPath(testCollection);
        console.log(`Path for "${testCollection}": ${collectionPath}`);

        // 3. Property Path Test
        console.log('\n--- 3. Property Path Test ---');
        const propPath = db.getPropertyPath('doc', 'metadata', 'id');
        console.log(`Property path for doc.metadata.id: ${propPath}`);

        // 4. Sample Query Test (Table checking)
        console.log('\n--- 4. Table Existence Test ---');
        try {
            const query = dbType === 'couchbase'
                ? `SELECT 1 FROM ${collectionPath} LIMIT 1`
                : `SELECT 1 FROM ${collectionPath} LIMIT 1`;
            await db.query(query);
            console.log(`✅ Table/Collection "${collectionPath}" is accessible.`);
        } catch (err) {
            console.warn(`⚠️ Table/Collection "${collectionPath}" error: ${err.message}`);
            console.log('Note: This might be normal if you haven\'t run setup scripts yet.');
        }

        // 5. Schema Logic Test (Simulate repository logic)
        console.log('\n--- 5. Mock Query Patterns ---');
        const testQueries = [];

        if (dbType === 'cratedb' || dbType === 'postgres') {
            const pathFilter = db.getPropertyPath('doc', 'type');
            const campaignIdFilter = db.getPropertyPath('doc', 'campaign_id');
            const statusFilter = db.getPropertyPath('doc', 'status');
            const runsCollection = db.getCollectionPath('search_runs');

            testQueries.push({
                name: 'Campaign Fetch Pattern',
                sql: `SELECT id FROM ${collectionPath} WHERE ${pathFilter} = $1 LIMIT 1`,
                params: ['campaign']
            });

            testQueries.push({
                name: 'Search Runs Status Check',
                sql: `SELECT id FROM ${runsCollection} WHERE ${statusFilter} = $1 AND ${campaignIdFilter} = $2 LIMIT 1`,
                params: ['running', 'test-id']
            });
        } else if (dbType === 'couchbase') {
            testQueries.push({
                name: 'Campaign Fetch Pattern',
                sql: `SELECT id FROM ${collectionPath} WHERE type = $type LIMIT 1`,
                params: { type: 'campaign' }
            });
        }

        for (const t of testQueries) {
            try {
                console.log(`Testing: ${t.name}`);
                console.log(`Query: ${t.sql}`);
                await db.query(t.sql, { parameters: t.params });
                console.log('✅ Query executed (regardless of results).');
            } catch (err) {
                console.error(`❌ Query failed: ${err.message}`);
            }
        }

        console.log('\n--- Diagnostic Complete ---');
    } catch (err) {
        console.error('\n❌ Diagnostic failed with fatal error:', err.message);
        console.error(err.stack);
    } finally {
        if (db) await db.disconnect();
    }
}

runTest();
