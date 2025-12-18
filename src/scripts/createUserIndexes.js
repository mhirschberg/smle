const dbFactory = require('../modules/storage/dbFactory');
const logger = require('../utils/logger');

async function createIndexes() {
    try {
        const db = await dbFactory.getDB();

        logger.info('Creating indexes for users...');

        // Primary index for users (if needing full scans)
        await db.query(`
            CREATE PRIMARY INDEX \`#primary_users\` ON SMLE._default.users
        `);

        // Index for username lookups
        await db.query(`
            CREATE INDEX \`ix_users_username\` ON SMLE._default.users(username) 
            WHERE type = 'user'
        `);

        logger.info('Indexes created successfully');
        process.exit(0);
    } catch (error) {
        // Ignore "already exists" errors
        if (error.message && error.message.includes('already exists')) {
            logger.info('Indexes already exist');
            process.exit(0);
        }

        logger.error('Failed to create indexes', { error: error.message });
        process.exit(1);
    }
}

createIndexes();
