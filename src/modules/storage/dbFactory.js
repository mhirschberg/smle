const config = require('../../config');
const logger = require('../../utils/logger');

// Singleton instance container
let dbInstance = null;

class DbFactory {
    static async getDB() {
        if (dbInstance) {
            return dbInstance;
        }

        const dbType = process.env.DB_TYPE || config.db?.type || 'couchbase';
        logger.info(`Initializing database adapter for type: ${dbType}`);

        try {
            switch (dbType.toLowerCase()) {
                case 'couchbase':
                    const CouchbaseAdapter = require('./adapters/couchbaseAdapter');
                    dbInstance = new CouchbaseAdapter(config);
                    break;
                case 'cratedb':
                case 'postgres':
                    const CrateDbAdapter = require('./adapters/crateDbAdapter');
                    dbInstance = new CrateDbAdapter(config);
                    break;
                default:
                    throw new Error(`Unsupported database type: ${dbType}`);
            }

            await dbInstance.connect();
            return dbInstance;
        } catch (error) {
            logger.error(`Failed to initialize database adapter: ${error.message}`);
            throw error;
        }
    }
}

module.exports = DbFactory;
