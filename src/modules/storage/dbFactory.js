const config = require('../../config');
const logger = require('../../utils/logger');

// Singleton instance containers
let dbInstance = null;
let graphDbInstance = null;

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

    static async getGraphDB() {
        if (graphDbInstance) {
            return graphDbInstance;
        }

        logger.info('Initializing Neo4j graph database adapter');

        try {
            const Neo4jAdapter = require('./adapters/neo4jAdapter');
            graphDbInstance = new Neo4jAdapter(config);
            await graphDbInstance.connect();
            return graphDbInstance;
        } catch (error) {
            logger.warn(`Failed to initialize Neo4j adapter (is Neo4j running?): ${error.message}`);
            // We don't throw here to allow the app to function without graph support
            return null;
        }
    }
}

module.exports = DbFactory;
