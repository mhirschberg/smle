const config = require('../../config');
const CouchbaseAdapter = require('./adapters/couchbaseAdapter');
const CrateDbAdapter = require('./adapters/crateDbAdapter');
const logger = require('../../utils/logger');

// Singleton instance container (could be enhanced)
let dbInstance = null;

class DbFactory {
    static async getDB() {
        if (dbInstance) {
            return dbInstance;
        }

        const dbType = process.env.DB_TYPE || config.db?.type || 'couchbase';
        logger.info(`Initializing database adapter for type: ${dbType}`);

        switch (dbType.toLowerCase()) {
            case 'couchbase':
                dbInstance = new CouchbaseAdapter(config);
                break;
            case 'cratedb':
            case 'postgres':
                dbInstance = new CrateDbAdapter(config);
                break;
            default:
                throw new Error(`Unsupported database type: ${dbType}`);
        }

        await dbInstance.connect();
        return dbInstance;
    }
}

module.exports = DbFactory;
