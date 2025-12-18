/**
 * Interface that all database adapters must implement
 */
class DatabaseAdapter {
    constructor(config) {
        if (this.constructor === DatabaseAdapter) {
            throw new Error("Abstract class 'DatabaseAdapter' cannot be instantiated directly.");
        }
        this.config = config;
    }

    async connect() {
        throw new Error("Method 'connect()' must be implemented.");
    }

    async disconnect() {
        throw new Error("Method 'disconnect()' must be implemented.");
    }

    async get(collectionName, key) {
        throw new Error("Method 'get(collectionName, key)' must be implemented.");
    }

    async insert(collectionName, key, document) {
        throw new Error("Method 'insert(collectionName, key, document)' must be implemented.");
    }

    async upsert(collectionName, key, document) {
        throw new Error("Method 'upsert(collectionName, key, document)' must be implemented.");
    }

    async delete(collectionName, key) {
        throw new Error("Method 'delete(collectionName, key)' must be implemented.");
    }

    async query(queryString, options = {}) {
        throw new Error("Method 'query(queryString, options)' must be implemented.");
    }
}

module.exports = DatabaseAdapter;
