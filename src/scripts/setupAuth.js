const config = require('../config');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const dbFactory = require('../modules/storage/dbFactory');

async function setupAuth() {
    let db;
    try {
        const username = process.env.ADMIN_USERNAME;
        const password = process.env.ADMIN_PASSWORD;

        if (!username || !password) {
            logger.error('ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required');
            process.exit(1);
        }

        logger.info('Initializing database adapter...');
        db = await dbFactory.getDB();
        const dbType = config.db.type.toLowerCase();

        // 1. Create Indexes (Optional/Database specific)
        logger.info('Creating indexes if needed...');
        if (dbType === 'couchbase') {
            try {
                const collectionPath = db.getCollectionPath('users');
                await db.query(`CREATE INDEX \`ix_users_username\` ON ${collectionPath}(username) WHERE type = 'user'`);
            } catch (e) { /* ignore if exists */ }
        }

        // Wait for indexes
        await new Promise(r => setTimeout(r, 2000));

        // 2. Create Admin User
        logger.info('Creating admin user...');
        const { v4: uuidv4 } = require('uuid');

        // Check if exists using query
        let query;
        let params;
        if (dbType === 'postgres' || dbType === 'cratedb') {
            query = `SELECT id FROM _default WHERE doc->>'type' = 'user' AND doc->>'username' = $1 LIMIT 1`;
            params = [username];
        } else {
            const collectionPath = db.getCollectionPath('users');
            query = `SELECT META().id as id FROM ${collectionPath} WHERE type = 'user' AND username = $username LIMIT 1`;
            params = { username };
        }

        const result = await db.query(query, { parameters: params });

        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const now = new Date().toISOString();

        if (result.length > 0) {
            const id = result[0].id;
            logger.info(`User ${username} exists (id: ${id}). Updating password...`);
            await db.upsert('users', id, {
                id,
                type: 'user',
                username,
                password_hash,
                updated_at: now
            });
        } else {
            const id = uuidv4();
            await db.insert('users', id, {
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
        if (db) await db.disconnect();
    }
}

setupAuth();
