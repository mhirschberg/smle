const couchbase = require('couchbase');
const config = require('../config');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');

async function setupAuth() {
    let cluster;
    try {
        const username = 'root';
        const password = 'Sobaka!123';
        const bucketName = 'SMLE';
        const scopeName = '_default';
        const collectionName = '_default'; // Using default collection

        logger.info('Connecting to Couchbase...');
        cluster = await couchbase.connect(
            config.db.couchbase.connectionString,
            {
                username: config.db.couchbase.username,
                password: config.db.couchbase.password
            }
        );

        const bucket = cluster.bucket(bucketName);

        // 1. Create Indexes on _default
        logger.info('Creating indexes...');
        try {
            // Index for username lookups on default collection
            // Note: _default collection is usually queryable as `bucketname` or `bucketname._default._default`
            await cluster.query(`CREATE INDEX \`ix_users_username\` ON \`${bucketName}\`.\`${scopeName}\`.\`${collectionName}\`(username) WHERE type = 'user'`);
        } catch (e) { /* ignore if exists */
            console.log(e.message);
        }

        // Wait for indexes
        await new Promise(r => setTimeout(r, 2000));

        // 2. Create Admin User
        logger.info('Creating admin user...');
        const collection = bucket.scope(scopeName).collection(collectionName);
        const { v4: uuidv4 } = require('uuid');

        // Check if exists using query
        const query = `SELECT META().id FROM \`${bucketName}\`.\`${scopeName}\`.\`${collectionName}\` WHERE type = 'user' AND username = $username LIMIT 1`;
        const result = await cluster.query(query, { parameters: { username } });

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const now = new Date().toISOString();

        if (result.rows.length > 0) {
            const id = result.rows[0].id;
            logger.info(`User ${username} exists (id: ${id}). Updating password...`);
            // Get existing doc to preserve fields if needed, or just overwrite since it's admin seed
            await collection.upsert(id, {
                id,
                type: 'user',
                username,
                password_hash,
                updated_at: now
            });
        } else {
            const id = uuidv4();
            await collection.insert(id, {
                id,
                type: 'user',
                username,
                password_hash,
                created_at: now,
                updated_at: now
            });
            logger.info(`User ${username} created (id: ${id}).`);
        }

        logger.info('Admin user setup completed successfully.');
        process.exit(0);

    } catch (error) {
        logger.error('Admin setup failed', { error: error.message, stack: error.stack });
        process.exit(1);
    } finally {
        if (cluster) await cluster.close();
    }
}

setupAuth();
