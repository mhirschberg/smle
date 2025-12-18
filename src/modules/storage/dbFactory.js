const config = require('../../config');
const CouchbaseAdapter = require('./adapters/couchbaseAdapter');
const logger = require('../../utils/logger');

class DBFactory {
    constructor() {
        this.instance = null;
    }

    async getDB() {
        if (this.instance) {
            return this.instance;
        }

        // We can also have lock logic here if needed, but for now single instance is fine
        const dbType = config.db.type;

        logger.info(`Initializing database adapter for type: ${dbType}`);

        switch (dbType) {
            case 'couchbase':
                this.instance = new CouchbaseAdapter(config.db);
                break;

            // Future adapters can be added here
            // case 'cratedb':
            //   this.instance = new CrateDBAdapter(config.db);
            //   break;

            default:
                throw new Error(`Unsupported database type: ${dbType}`);
        }

        // Auto-connect?
        // Depending on usage, we might want to connect explicitly
        await this.instance.connect();

        return this.instance;
    }
}

module.exports = new DBFactory();
