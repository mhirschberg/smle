const couchbase = require('couchbase');
require('dotenv').config();
const logger = {
    info: (...args) => console.log('[INFO]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args)
};

async function checkCouchbase() {
    let cluster;
    try {
        const connectionString = process.env.CB_CONNECTION_STRING || 'couchbase://localhost';
        const username = process.env.CB_USERNAME || 'root';
        const password = process.env.CB_PASSWORD || 'sobaka';
        const bucketName = process.env.CB_BUCKET || 'SMLE';

        logger.info(`Connecting to Couchbase at ${connectionString}...`);

        cluster = await couchbase.connect(connectionString, {
            username: username,
            password: password,
            timeouts: {
                connectTimeout: 10000,
                kvTimeout: 10000,
                queryTimeout: 75000
            }
        });

        logger.info('Connected! Checking buckets...');

        // List all buckets
        const bucketManager = cluster.buckets();
        const buckets = await bucketManager.getAllBuckets();
        logger.info('Found buckets:', buckets.map(b => b.name));

        const bucketExists = buckets.some(b => b.name === bucketName);
        if (!bucketExists) {
            logger.error(`Bucket "${bucketName}" NOT found in the cluster.`);
            return;
        }

        logger.info(`Bucket "${bucketName}" found. Checking scopes and collections...`);
        const bucket = cluster.bucket(bucketName);
        const collectionsManager = bucket.collections();
        const scopes = await collectionsManager.getAllScopes();

        for (const scope of scopes) {
            logger.info(`Scope: ${scope.name}`);
            for (const collection of scope.collections) {
                logger.info(`  - Collection: ${collection.name}`);
            }
        }

        // Test N1QL with backticks
        logger.info('Testing N1QL query with backticks...');
        try {
            const query = `SELECT count(*) as count FROM \`${bucketName}\`._default._default`;
            const result = await cluster.query(query);
            logger.info('Query success!', result.rows);
        } catch (e) {
            logger.warn('Query failed with backticks on _default._default', { error: e.message });
        }

    } catch (error) {
        logger.error('Failed to analyze Couchbase setup', { error: error.message, stack: error.stack });
    } finally {
        if (cluster) await cluster.close();
    }
}

checkCouchbase();
